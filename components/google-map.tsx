'use client'

import React, { useMemo, useCallback, useState, useRef } from 'react'
import { GoogleMap as GoogleMapComponent, useJsApiLoader, Marker, InfoWindow, Circle, Polyline } from '@react-google-maps/api'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/constants/google-maps-config'

type DeckHeatPoint = { position: [number, number]; weight: number }

/** Matches prior Google HeatmapLayer gradient (blue → yellow → orange → red). */
const HEATMAP_COLOR_RANGE: [number, number, number, number][] = [
    [59, 130, 246, 0],
    [59, 130, 246, 87],
    [250, 204, 21, 143],
    [251, 146, 60, 184],
    [239, 68, 68, 220],
    [185, 28, 28, 245],
]

interface MapMarker {
    id: string
    position: { lat: number; lng: number }
    title: string
    type: 'user' | 'hazard' | 'earthquake' | 'weather' | 'admin' | 'incident' | 'condition' | 'infrastructure'
    isSafe?: boolean
    mag?: number
    description?: string
    status?: string
    alerts?: any[]
    radius?: number // For highlighting hazard zones
    timestamp?: string
    color?: string
    icon?: string
    category?: string
}

export interface MapStateBounds {
    west: number
    south: number
    east: number
    north: number
}

export interface CoverageCircleSpec {
    center: { lat: number; lng: number }
    radiusMeters: number
    label?: string
}

export interface MapPolylineSpec {
    path: { lat: number; lng: number }[]
    strokeColor?: string
    strokeWeight?: number
    strokeOpacity?: number
    label?: string
}

interface GoogleMapProps {
    address?: string
    markers?: MapMarker[]
    center?: { lat: number; lng: number }
    zoom?: number
    heatPoints?: { lat: number; lng: number; weight?: number }[]
    showHeatmap?: boolean
    /** When set, pan/zoom are limited to this US state envelope. */
    stateBounds?: MapStateBounds | null
    /** Sub-admin license service area (miles stored server-side; pass meters here). */
    coverageCircle?: CoverageCircleSpec | null
    /** Optional polylines (e.g. tornado survey path in demo mode). */
    polylines?: MapPolylineSpec[]
}

const containerStyle = {
    width: '100%',
    height: '100%',
    minHeight: '400px'
}

const defaultCenter = {
    lat: 37.7749,
    lng: -122.4194
}

const makeGlyphMarker = (bg: string, glyph: string, size: number) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${bg}" stroke="white" stroke-width="3"/>
<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="${Math.round(size * 0.48)}" font-family="Arial, sans-serif" font-weight="700">${glyph}</text>
</svg>`
    return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(size / 2, size / 2),
    }
}

function toLatLngBounds(bounds: MapStateBounds) {
    return new google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east },
    )
}

function viewportExceedsStateBounds(map: google.maps.Map, bounds: MapStateBounds): boolean {
    const viewport = map.getBounds()
    if (!viewport) return false
    const ne = viewport.getNorthEast()
    const sw = viewport.getSouthWest()
    const { west, south, east, north } = bounds
    return (
        ne.lat() > north + 1e-6 ||
        sw.lat() < south - 1e-6 ||
        ne.lng() > east + 1e-6 ||
        sw.lng() < west - 1e-6
    )
}

export function GoogleMap({
    address,
    markers = [],
    center,
    zoom = 10,
    heatPoints = [],
    showHeatmap = false,
    stateBounds = null,
    coverageCircle = null,
    polylines = [],
}: GoogleMapProps) {
    const { isLoaded } = useJsApiLoader({
        id: GOOGLE_MAPS_LOADER_ID,
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES
    })

    const mapCenter = useMemo(() => {
        if (center) return center
        return defaultCenter
    }, [center])

    const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
    const [map, setMap] = React.useState<google.maps.Map | null>(null)
    const deckOverlayRef = useRef<GoogleMapsOverlay | null>(null)
    const stateBoundsFittedRef = useRef(false)
    const stateMinZoomRef = useRef<number | null>(null)
    const lastZoomRef = useRef<number | null>(null)

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map)
    }, [])

    const onUnmount = useCallback(function callback() {
        if (deckOverlayRef.current) {
            deckOverlayRef.current.setMap(null)
            deckOverlayRef.current.finalize()
            deckOverlayRef.current = null
        }
        setMap(null)
    }, [])

    const validHeatPoints = useMemo(
        () =>
            heatPoints.filter(
                (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !isNaN(p.lat) && !isNaN(p.lng),
            ),
        [heatPoints],
    )

    // Smooth pan when center changes (skip when locked to state — fitBounds owns the view)
    React.useEffect(() => {
        if (!map || !center || stateBounds) return
        map.panTo(center)
    }, [map, center, stateBounds])

    const applyStateMinZoom = useCallback((targetMap: google.maps.Map, bounds: MapStateBounds) => {
        const tighten = (attempt: number) => {
            const z = targetMap.getZoom() ?? 6
            if (!viewportExceedsStateBounds(targetMap, bounds) || attempt >= 5) {
                stateMinZoomRef.current = z
                lastZoomRef.current = z
                targetMap.setOptions({ minZoom: z })
                return
            }
            targetMap.setZoom(z + 1)
            google.maps.event.addListenerOnce(targetMap, 'idle', () => tighten(attempt + 1))
        }
        tighten(0)
    }, [])

    const fitStateView = useCallback(
        (targetMap: google.maps.Map, bounds: MapStateBounds) => {
            const latLngBounds = toLatLngBounds(bounds)
            const { west, south, east, north } = bounds
            targetMap.setCenter({ lat: (south + north) / 2, lng: (west + east) / 2 })
            targetMap.fitBounds(latLngBounds, 8)
            google.maps.event.addListenerOnce(targetMap, 'idle', () => {
                applyStateMinZoom(targetMap, bounds)
            })
        },
        [applyStateMinZoom],
    )

    // Apply state boundary restriction; warn only on zoom-out past full-state view
    React.useEffect(() => {
        if (!map) return

        if (!stateBounds) {
            stateBoundsFittedRef.current = false
            stateMinZoomRef.current = null
            lastZoomRef.current = null
            map.setOptions({ restriction: null, minZoom: undefined })
            return
        }

        const latLngBounds = toLatLngBounds(stateBounds)
        map.setOptions({
            restriction: {
                latLngBounds,
                strictBounds: true,
            },
        })

        if (!stateBoundsFittedRef.current) {
            fitStateView(map, stateBounds)
            stateBoundsFittedRef.current = true
        }

        const resetToStateView = () => {
            fitStateView(map, stateBounds)
        }

        const onDragEnd = () => {
            if (viewportExceedsStateBounds(map, stateBounds)) {
                resetToStateView()
            }
        }

        const onZoomChanged = () => {
            const current = map.getZoom()
            if (current == null) return
            const minZoom = stateMinZoomRef.current
            const prev = lastZoomRef.current

            const zoomedOut = prev != null && current < prev
            const belowMin = minZoom != null && current < minZoom
            const viewportTooWide = viewportExceedsStateBounds(map, stateBounds)

            if (zoomedOut && (belowMin || viewportTooWide)) {
                if (minZoom != null) {
                    map.setZoom(minZoom)
                } else {
                    resetToStateView()
                }
            } else if (viewportTooWide) {
                resetToStateView()
            }

            lastZoomRef.current = map.getZoom() ?? current
        }

        const zoomListener = map.addListener('zoom_changed', onZoomChanged)
        const dragEndListener = map.addListener('dragend', onDragEnd)

        return () => {
            google.maps.event.removeListener(zoomListener)
            google.maps.event.removeListener(dragEndListener)
        }
    }, [map, stateBounds, fitStateView])

    React.useEffect(() => {
        stateBoundsFittedRef.current = false
        stateMinZoomRef.current = null
        lastZoomRef.current = null
    }, [stateBounds?.west, stateBounds?.south, stateBounds?.east, stateBounds?.north])

    // Clear selected marker if it's no longer in the markers list (e.g. when switching tabs)
    React.useEffect(() => {
        if (selectedMarker && !markers.find(m => m.id === selectedMarker.id)) {
            setSelectedMarker(null)
        }
    }, [markers, selectedMarker])

    React.useEffect(() => {
        if (!map) return

        if (!deckOverlayRef.current) {
            deckOverlayRef.current = new GoogleMapsOverlay({ interleaved: true })
        }
        const overlay = deckOverlayRef.current

        if (!showHeatmap || validHeatPoints.length === 0) {
            overlay.setProps({ layers: [] })
            overlay.setMap(map)
            return
        }

        const data: DeckHeatPoint[] = validHeatPoints.map((p) => ({
            position: [p.lng, p.lat],
            weight: Math.max(0.1, Math.min(1.2, p.weight ?? 0.6)),
        }))

        overlay.setProps({
            layers: [
                new HeatmapLayer<DeckHeatPoint>({
                    id: 'incident-heatmap',
                    data,
                    pickable: false,
                    getPosition: (d) => d.position,
                    getWeight: (d) => d.weight,
                    radiusPixels: 36,
                    intensity: 1.2,
                    threshold: 0.04,
                    colorRange: HEATMAP_COLOR_RANGE,
                }),
            ],
        })
        overlay.setMap(map)

        return () => {
            overlay.setProps({ layers: [] })
        }
    }, [map, showHeatmap, validHeatPoints])

    if (!isLoaded) return <div className="w-full h-full min-h-[400px] bg-slate-100 animate-pulse flex items-center justify-center rounded-xl border border-slate-200">
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Initalizing Satellite Feed...</p>
    </div>

    const validMarkers = markers.filter(marker =>
        marker.position &&
        typeof marker.position.lat === 'number' &&
        typeof marker.position.lng === 'number' &&
        !isNaN(marker.position.lat) &&
        !isNaN(marker.position.lng)
    );

    return (
        <div className="w-full h-full min-h-[400px] rounded-xl overflow-hidden shadow-inner border border-slate-200 relative">
            <GoogleMapComponent
                mapContainerStyle={containerStyle}
                center={mapCenter}
                zoom={stateBounds ? undefined : zoom}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                    disableDefaultUI: false,
                    zoomControl: true,
                    mapTypeControl: true,
                    scaleControl: true,
                    streetViewControl: false,
                    rotateControl: true,
                    fullscreenControl: true
                }}
            >
                {coverageCircle &&
                    Number.isFinite(coverageCircle.center.lat) &&
                    Number.isFinite(coverageCircle.center.lng) &&
                    coverageCircle.radiusMeters > 0 && (
                        <Circle
                            center={coverageCircle.center}
                            radius={coverageCircle.radiusMeters}
                            options={{
                                strokeColor: '#33375D',
                                strokeOpacity: 0.85,
                                strokeWeight: 2,
                                fillColor: '#33375D',
                                fillOpacity: 0.06,
                                clickable: false,
                                zIndex: 1,
                            }}
                        />
                    )}

                {polylines.map((line, idx) => {
                    const path = line.path.filter(
                        (p) =>
                            Number.isFinite(p.lat) &&
                            Number.isFinite(p.lng) &&
                            !Number.isNaN(p.lat) &&
                            !Number.isNaN(p.lng),
                    )
                    if (path.length < 2) return null
                    return (
                        <Polyline
                            key={`polyline-${idx}-${line.label ?? 'path'}`}
                            path={path}
                            options={{
                                strokeColor: line.strokeColor ?? '#DC2626',
                                strokeOpacity: line.strokeOpacity ?? 0.9,
                                strokeWeight: line.strokeWeight ?? 4,
                                geodesic: true,
                                zIndex: 2,
                            }}
                        />
                    )
                })}

                {validMarkers.map((marker) => (
                    <React.Fragment key={marker.id}>
                        <Marker
                            position={marker.position}
                            title={marker.title}
                            onClick={() => setSelectedMarker(marker)}
                            icon={
                                marker.type === 'user' ? (
                                    marker.isSafe ? {
                                        url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
                                        scaledSize: new google.maps.Size(32, 32)
                                    } : {
                                        url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                                        scaledSize: new google.maps.Size(32, 32)
                                    }
                                ) : marker.type === 'earthquake' ? {
                                    url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
                                    scaledSize: new google.maps.Size(40, 40)
                                } : marker.type === 'weather' ? {
                                    url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                                    scaledSize: new google.maps.Size(32, 32)
                                } : marker.type === 'admin' ? {
                                    url: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
                                    scaledSize: new google.maps.Size(42, 42)
                                } : (marker.type === 'incident' || marker.type === 'infrastructure') ? (
                                    marker.icon === 'hospital' ? makeGlyphMarker('#EF4444', '+', 34) :
                                        marker.icon === 'pharmacy' ? makeGlyphMarker('#10B981', '\u213E', 32) : {
                                            url: marker.color === '#10B981' ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' :
                                                marker.color === '#3B82F6' ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' :
                                                    marker.color === '#F59E0B' ? 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png' :
                                                        marker.color === '#06B6D4' ? 'https://maps.google.com/mapfiles/ms/icons/ltblue-dot.png' :
                                                            marker.color === '#6366F1' ? 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png' :
                                                                marker.color === '#EC4899' ? 'https://maps.google.com/mapfiles/ms/icons/pink-dot.png' :
                                                                    marker.icon === 'fire' ? 'https://maps.google.com/mapfiles/ms/icons/firedept.png' :
                                                                        marker.icon === 'police' ? 'https://maps.google.com/mapfiles/ms/icons/police.png' :
                                                                            'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                                            scaledSize: new google.maps.Size(32, 32)
                                        }
                                ) : marker.type === 'condition' ? {
                                    path: google.maps.SymbolPath.CIRCLE,
                                    fillColor: marker.color || '#4169E1',
                                    fillOpacity: 0.8,
                                    scale: 8,
                                    strokeColor: 'white',
                                    strokeWeight: 2,
                                } : undefined
                            }
                        />

                        {/* Area Highlighting for Hazards */}
                        {(marker.type === 'earthquake' || marker.type === 'weather') && marker.radius && (
                            <Circle
                                center={marker.position}
                                radius={marker.radius}
                                onClick={() => setSelectedMarker(marker)}
                                options={{
                                    strokeColor: marker.type === 'earthquake' ? '#FF8C00' : '#4169E1',
                                    strokeOpacity: 0.8,
                                    strokeWeight: 2,
                                    fillColor: marker.type === 'earthquake' ? '#FF8C00' : '#4169E1',
                                    fillOpacity: 0.35,
                                }}
                            />
                        )}
                    </React.Fragment>
                ))}

                {selectedMarker && (
                    <InfoWindow
                        position={selectedMarker.position}
                        onCloseClick={() => setSelectedMarker(null)}
                    >
                        <div className="p-2 min-w-[200px] max-w-[300px] bg-white text-slate-900 rounded-lg">
                            <h3 className="font-extrabold text-sm mb-1 uppercase tracking-tight flex items-center gap-2">
                                {selectedMarker.type === 'user' ? '👤 Citizen' :
                                    selectedMarker.type === 'earthquake' ? '🌋 Earthquake' :
                                        selectedMarker.type === 'weather' ? '🌦️ Weather Alert' :
                                            selectedMarker.type === 'incident' ? '⚠️ Incident' :
                                                selectedMarker.category ? selectedMarker.category :
                                                    selectedMarker.type === 'infrastructure' ? '🏢 Infrastructure' : '📍 Admin'}
                            </h3>
                            <div className="font-bold text-lg mb-1">{selectedMarker.title}</div>

                            {selectedMarker.status && (
                                <div className={`text-[10px] font-black uppercase mb-1 inline-block px-2 py-0.5 rounded ${selectedMarker.isSafe === false || selectedMarker.status === 'Danger' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                    }`}>
                                    Status: {selectedMarker.status}
                                </div>
                            )}

                            {selectedMarker.timestamp && (
                                <div className="text-[10px] text-slate-400 font-bold mb-2">
                                    Date: {new Date(selectedMarker.timestamp).toLocaleString()}
                                </div>
                            )}

                            {selectedMarker.description && (
                                <p className="text-xs text-slate-600 mb-2 leading-relaxed whitespace-pre-line">
                                    {selectedMarker.description}
                                </p>
                            )}

                            {selectedMarker.mag && (
                                <p className="text-xs font-bold text-orange-600 mb-2">
                                    Magnitude: {selectedMarker.mag.toFixed(1)}
                                </p>
                            )}

                            {selectedMarker.alerts && selectedMarker.alerts.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Active Alerts</p>
                                    <div className="space-y-1">
                                        {selectedMarker.alerts.map((a, i) => (
                                            <div key={i} className="text-[10px] font-bold text-red-600 bg-red-50 p-1.5 rounded border border-red-100 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                {a.title}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </InfoWindow>
                )}
            </GoogleMapComponent>
        </div>
    )
}
