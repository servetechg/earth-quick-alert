'use client'

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { GoogleMap as GoogleMapComponent, useJsApiLoader, Marker, InfoWindow, Circle, Polyline } from '@react-google-maps/api'
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/constants/google-maps-config'
import {
    coverageCircleLatLngBounds,
    coverageCirclePath,
    type LatLngPoint,
} from '@/lib/geo/license-coverage-radius'
import type { UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap'
import { IncidentDetailDialog } from '@/components/incident/incident-detail-dialog'

function formatMarkerStatus(status?: string, isSafe?: boolean): string {
    if (status === 'help' || status === 'needs_assistance') return 'Help'
    if (status === 'safe') return 'Safe'
    if (isSafe === false) return 'Help'
    if (isSafe === true) return 'Safe'
    return status ?? 'Unknown'
}

function isHelpStatus(status?: string, isSafe?: boolean): boolean {
    if (isSafe === false) return true
    const s = (status ?? '').toLowerCase()
    return s === 'help' || s === 'needs_assistance' || s === 'danger'
}

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
    type: 'user' | 'hazard' | 'earthquake' | 'weather' | 'admin' | 'incident' | 'condition' | 'infrastructure' | 'responder'
    isSafe?: boolean
    mag?: number
    description?: string
    status?: string
    alerts?: any[]
    radius?: number // For highlighting hazard zones
    timestamp?: string
    color?: string
    icon?: string
    /** Single-letter glyph for critical-infrastructure pins */
    glyph?: string
    category?: string
    location?: string
    /** Link to AI risk report for this incident (Dashboard A). */
    riskReportHref?: string
    incidentId?: string
}

export interface MapDisasterZoneCircleSpec {
    id: string
    center: { lat: number; lng: number }
    radiusMeters: number
    fillColor?: string
    fillOpacity?: number
    strokeColor?: string
    strokeWeight?: number
    label: string
    /** Map position for the zone label marker */
    labelPosition: { lat: number; lng: number }
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

export interface RoadClosureDetail {
    roadName: string
    status: string
    reason?: string
    startLocation?: string
    endLocation?: string
    updatedAt?: string
    source?: string
}

export interface MapPolylineSpec {
    id?: string
    path: { lat: number; lng: number }[]
    strokeColor?: string
    strokeWeight?: number
    strokeOpacity?: number
    label?: string
    kind?: 'road_closure' | 'route'
    closure?: RoadClosureDetail
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
    /** Fit and restrict pan/zoom to the license radius (sub-admin radius licenses). */
    lockToCoverage?: boolean
    /** Optional polylines (e.g. tornado survey path in demo mode). */
    polylines?: MapPolylineSpec[]
    /** Concentric disaster impact circles (Zone A / B / C). */
    disasterZoneCircles?: MapDisasterZoneCircleSpec[]
    /** Incident metadata for heatmap clicks (no pin markers). */
    heatIncidents?: UnifiedEventHeatPoint[]
    /** When true, clicking the heat layer opens incident details instead of showing pins. */
    heatClickOnly?: boolean
    /** Fired when user clicks a heatmap incident (demo tab workflows). */
    onHeatIncidentSelect?: (incident: UnifiedEventHeatPoint) => void
    /** Debounced viewport bounds for nationwide infrastructure loading. */
    onBoundsChanged?: (bounds: MapStateBounds) => void
    /** Cluster infrastructure markers for large datasets. */
    clusterInfrastructure?: boolean
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

const makePharmacyPinIcon = () => ({
    url: '/icons/pharmacy-marker.svg',
    scaledSize: new google.maps.Size(32, 42),
    anchor: new google.maps.Point(16, 42),
})

const makeEmergencyServicePinIcon = () => ({
    url: '/icons/emergency-service-marker.svg',
    scaledSize: new google.maps.Size(32, 42),
    anchor: new google.maps.Point(16, 42),
})

/** Above this zoom, infrastructure markers render individually (Google Maps–style). */
const INFRA_CLUSTER_MAX_ZOOM = 10

/** Cluster radius in pixels — tighter groups at low zoom, expands as user zooms in. */
const INFRA_CLUSTER_RADIUS_PX = 58

/** Soft cluster blob without numeric labels. */
function createCountlessClusterRenderer() {
    return {
        render({ position }: { position: google.maps.LatLng }) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <circle cx="120" cy="120" r="62" fill="#33375D" opacity="0.14"/>
  <circle cx="120" cy="120" r="44" fill="#33375D" opacity="0.24"/>
  <circle cx="120" cy="120" r="28" fill="#33375D" opacity="0.36"/>
</svg>`
            return new google.maps.Marker({
                position,
                icon: {
                    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
                    scaledSize: new google.maps.Size(42, 42),
                    anchor: new google.maps.Point(21, 21),
                },
                clickable: true,
                zIndex: Number(google.maps.Marker.MAX_ZINDEX) + 1,
            })
        },
    }
}

function buildMarkerIcon(marker: MapMarker): google.maps.Icon | google.maps.Symbol | undefined {
    if (marker.type === 'user') {
        return marker.isSafe
            ? {
                  url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
                  scaledSize: new google.maps.Size(32, 32),
              }
            : {
                  url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                  scaledSize: new google.maps.Size(32, 32),
              }
    }
    if (marker.type === 'earthquake') {
        return {
            url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
            scaledSize: new google.maps.Size(40, 40),
        }
    }
    if (marker.type === 'weather') {
        return {
            url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            scaledSize: new google.maps.Size(32, 32),
        }
    }
    if (marker.type === 'admin') {
        return {
            url: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
            scaledSize: new google.maps.Size(42, 42),
        }
    }
    if (marker.type === 'responder') {
        return {
            url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
            scaledSize: new google.maps.Size(36, 36),
        }
    }
    if (marker.type === 'incident' || marker.type === 'infrastructure') {
        if (marker.glyph) {
            return makeGlyphMarker(marker.color || '#6366F1', marker.glyph, 34)
        }
        if (marker.icon === 'hospital') return makeGlyphMarker('#EF4444', 'H', 34)
        if (marker.icon === 'pharmacy') return makePharmacyPinIcon()
        if (marker.icon === 'fire') return makeEmergencyServicePinIcon()
        if (marker.icon === 'shelter') return makeGlyphMarker('#16A34A', 'S', 34)
        if (marker.icon === 'fuel') {
            return {
                url: 'https://maps.google.com/mapfiles/ms/icons/gas.png',
                scaledSize: new google.maps.Size(32, 32),
            }
        }
        if (marker.icon === 'generator') return makeGlyphMarker('#E5A436', 'G', 32)
        if (marker.icon === 'meals') return makeGlyphMarker('#D74C30', 'M', 32)
        if (marker.icon === 'power_crew') return makeGlyphMarker('#A99423', 'P', 32)
        if (marker.icon === 'water_crew') return makeGlyphMarker('#4674C6', 'W', 32)
        if (marker.icon === 'volunteers') return makeGlyphMarker('#5C7E2D', 'V', 32)
        return {
            url:
                marker.color === '#10B981'
                    ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
                    : marker.color === '#3B82F6'
                      ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                      : marker.color === '#F59E0B'
                        ? 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png'
                        : marker.color === '#06B6D4'
                          ? 'https://maps.google.com/mapfiles/ms/icons/ltblue-dot.png'
                          : marker.color === '#6366F1'
                            ? 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png'
                            : marker.color === '#EC4899'
                              ? 'https://maps.google.com/mapfiles/ms/icons/pink-dot.png'
                              : marker.icon === 'police'
                                  ? 'https://maps.google.com/mapfiles/ms/icons/police.png'
                                  : 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
            scaledSize: new google.maps.Size(32, 32),
        }
    }
    if (marker.type === 'condition') {
        return {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: marker.color || '#4169E1',
            fillOpacity: 0.8,
            scale: 8,
            strokeColor: 'white',
            strokeWeight: 2,
        }
    }
    return undefined
}

function toLatLngBounds(bounds: MapStateBounds) {
    return new google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east },
    )
}

function geoBoundsToMapStateBounds(bounds: { northeast: LatLngPoint; southwest: LatLngPoint }): MapStateBounds {
    return {
        west: bounds.southwest.lng,
        south: bounds.southwest.lat,
        east: bounds.northeast.lng,
        north: bounds.northeast.lat,
    }
}

function coverageToMapBounds(coverage: CoverageCircleSpec): MapStateBounds {
    const box = coverageCircleLatLngBounds(coverage.center, coverage.radiusMeters)
    return geoBoundsToMapStateBounds(box)
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371
    const dLat = ((bLat - aLat) * Math.PI) / 180
    const dLng = ((bLng - aLng) * Math.PI) / 180
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((aLat * Math.PI) / 180) *
            Math.cos((bLat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function findNearestHeatIncident(
    lat: number,
    lng: number,
    incidents: UnifiedEventHeatPoint[],
    maxKm = 40,
): UnifiedEventHeatPoint | null {
    let best: UnifiedEventHeatPoint | null = null
    let bestDist = Infinity
    for (const inc of incidents) {
        const d = distanceKm(lat, lng, inc.lat, inc.lng)
        if (d < bestDist) {
            bestDist = d
            best = inc
        }
    }
    return best && bestDist <= maxKm ? best : null
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
    lockToCoverage = false,
    polylines = [],
    disasterZoneCircles = [],
    heatIncidents = [],
    heatClickOnly = false,
    onHeatIncidentSelect,
    onBoundsChanged,
    clusterInfrastructure = false,
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
    const [selectedRoadClosure, setSelectedRoadClosure] = useState<MapPolylineSpec | null>(null)
    const [selectedHeatIncident, setSelectedHeatIncident] = useState<UnifiedEventHeatPoint | null>(null)
    const [incidentDialogOpen, setIncidentDialogOpen] = useState(false)
    const [map, setMap] = React.useState<google.maps.Map | null>(null)
    const deckOverlayRef = useRef<GoogleMapsOverlay | null>(null)
    const stateBoundsFittedRef = useRef(false)
    const coverageBoundsFittedRef = useRef(false)
    const stateMinZoomRef = useRef<number | null>(null)
    const coverageMinZoomRef = useRef<number | null>(null)
    const lastZoomRef = useRef<number | null>(null)

    const coverageMapBounds = useMemo((): MapStateBounds | null => {
        if (!lockToCoverage || !coverageCircle) return null
        if (
            !Number.isFinite(coverageCircle.center.lat) ||
            !Number.isFinite(coverageCircle.center.lng) ||
            !(coverageCircle.radiusMeters > 0)
        ) {
            return null
        }
        return coverageToMapBounds(coverageCircle)
    }, [lockToCoverage, coverageCircle])

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map)
    }, [])

    useEffect(() => {
        if (!map || !onBoundsChanged) return

        const emitBounds = () => {
            const bounds = map.getBounds()
            if (!bounds) return
            const ne = bounds.getNorthEast()
            const sw = bounds.getSouthWest()
            onBoundsChanged({
                west: sw.lng(),
                south: sw.lat(),
                east: ne.lng(),
                north: ne.lat(),
            })
        }

        emitBounds()
        const listener = map.addListener('idle', emitBounds)
        return () => {
            google.maps.event.removeListener(listener)
        }
    }, [map, onBoundsChanged])

    const validMarkers = useMemo(
        () =>
            markers.filter(
                (marker) =>
                    marker.position &&
                    typeof marker.position.lat === 'number' &&
                    typeof marker.position.lng === 'number' &&
                    !isNaN(marker.position.lat) &&
                    !isNaN(marker.position.lng),
            ),
        [markers],
    )

    const renderedMarkers = useMemo(() => {
        if (!clusterInfrastructure) return validMarkers
        return validMarkers.filter((m) => m.type !== 'infrastructure')
    }, [validMarkers, clusterInfrastructure])

    const infrastructureMarkers = useMemo(() => {
        if (!clusterInfrastructure) return []
        return validMarkers.filter((m) => m.type === 'infrastructure')
    }, [validMarkers, clusterInfrastructure])

    const clustererRef = useRef<MarkerClusterer | null>(null)
    const clusterMarkersRef = useRef<google.maps.Marker[]>([])

    useEffect(() => {
        if (!map || !clusterInfrastructure) return

        clustererRef.current?.clearMarkers()
        clusterMarkersRef.current.forEach((m) => m.setMap(null))
        clusterMarkersRef.current = []

        const gMarkers = infrastructureMarkers.map((marker) => {
            const gMarker = new google.maps.Marker({
                position: marker.position,
                title: marker.title,
                icon: buildMarkerIcon(marker),
            })
            gMarker.addListener('click', () => {
                setSelectedHeatIncident(null)
                setSelectedMarker(marker)
            })
            return gMarker
        })

        clusterMarkersRef.current = gMarkers
        clustererRef.current = new MarkerClusterer({
            map,
            markers: gMarkers,
            algorithm: new SuperClusterAlgorithm({
                maxZoom: INFRA_CLUSTER_MAX_ZOOM,
                radius: INFRA_CLUSTER_RADIUS_PX,
                minPoints: 3,
            }),
            renderer: createCountlessClusterRenderer(),
            onClusterClick: (_event, cluster, clusterMap) => {
                const bounds = new google.maps.LatLngBounds()
                for (const m of cluster.markers) {
                    const pos =
                        typeof (m as google.maps.Marker).getPosition === 'function'
                            ? (m as google.maps.Marker).getPosition()
                            : (m as { position?: google.maps.LatLng }).position
                    if (pos) bounds.extend(pos)
                }
                if (!bounds.isEmpty()) {
                    clusterMap.fitBounds(bounds, 56)
                }
            },
        })

        return () => {
            clustererRef.current?.clearMarkers()
            clustererRef.current = null
            clusterMarkersRef.current.forEach((m) => m.setMap(null))
            clusterMarkersRef.current = []
        }
    }, [map, clusterInfrastructure, infrastructureMarkers])


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

    // Smooth pan when center changes (skip when locked to state or coverage — fitBounds owns the view)
    React.useEffect(() => {
        if (!map || !center || stateBounds || coverageMapBounds) return
        map.panTo(center)
    }, [map, center, stateBounds, coverageMapBounds])

    const applyStateMinZoom = useCallback((targetMap: google.maps.Map, bounds: MapStateBounds) => {
        const tighten = (attempt: number) => {
            const z = targetMap.getZoom() ?? 6
            if (!viewportExceedsStateBounds(targetMap, bounds) || attempt >= 5) {
                const fitZoom = z
                // Stop zoom-out once the full state is visible — no further zoom-out past this level
                stateMinZoomRef.current = fitZoom
                lastZoomRef.current = targetMap.getZoom() ?? fitZoom
                targetMap.setOptions({ minZoom: fitZoom })
                return
            }
            targetMap.setZoom(z + 1)
            google.maps.event.addListenerOnce(targetMap, 'idle', () => tighten(attempt + 1))
        }
        tighten(0)
    }, [])

    const fitBoundedView = useCallback(
        (
            targetMap: google.maps.Map,
            bounds: MapStateBounds,
            onIdle: (targetMap: google.maps.Map, bounds: MapStateBounds) => void,
            padding = 8,
        ) => {
            const latLngBounds = toLatLngBounds(bounds)
            const { west, south, east, north } = bounds
            targetMap.setCenter({ lat: (south + north) / 2, lng: (west + east) / 2 })
            targetMap.fitBounds(latLngBounds, padding)
            google.maps.event.addListenerOnce(targetMap, 'idle', () => {
                onIdle(targetMap, bounds)
            })
        },
        [],
    )

    const establishStateZoomLimit = useCallback(
        (targetMap: google.maps.Map, bounds: MapStateBounds, preserveView = false) => {
            if (!preserveView) {
                fitBoundedView(targetMap, bounds, applyStateMinZoom)
                return
            }
            const prevZoom = targetMap.getZoom()
            const prevCenter = targetMap.getCenter()
            fitBoundedView(targetMap, bounds, (m) => {
                applyStateMinZoom(m, bounds)
                if (prevCenter && prevZoom != null) {
                    m.setZoom(prevZoom)
                    m.setCenter(prevCenter)
                    lastZoomRef.current = prevZoom
                }
            })
        },
        [applyStateMinZoom, fitBoundedView],
    )

    const fitStateView = useCallback(
        (targetMap: google.maps.Map, bounds: MapStateBounds) => {
            establishStateZoomLimit(targetMap, bounds, false)
        },
        [establishStateZoomLimit],
    )

    const applyCoverageMinZoom = useCallback((targetMap: google.maps.Map, bounds: MapStateBounds) => {
        const tighten = (attempt: number) => {
            const z = targetMap.getZoom() ?? 8
            if (!viewportExceedsStateBounds(targetMap, bounds) || attempt >= 5) {
                coverageMinZoomRef.current = z
                lastZoomRef.current = z
                targetMap.setOptions({ minZoom: z })
                return
            }
            targetMap.setZoom(z + 1)
            google.maps.event.addListenerOnce(targetMap, 'idle', () => tighten(attempt + 1))
        }
        tighten(0)
    }, [])

    const fitCoverageView = useCallback(
        (targetMap: google.maps.Map, bounds: MapStateBounds) => {
            fitBoundedView(targetMap, bounds, applyCoverageMinZoom, 24)
        },
        [applyCoverageMinZoom, fitBoundedView],
    )

    // Apply state boundary restriction; warn only on zoom-out past full-state view
    React.useEffect(() => {
        if (!map) return

        if (!stateBounds) {
            stateBoundsFittedRef.current = false
            stateMinZoomRef.current = null
            if (!coverageMapBounds) {
                lastZoomRef.current = null
                map.setOptions({ restriction: null, minZoom: undefined })
            }
        } else {
            const latLngBounds = toLatLngBounds(stateBounds)
            map.setOptions({
                restriction: {
                    latLngBounds,
                    strictBounds: true,
                },
            })

            if (!stateBoundsFittedRef.current) {
                // Keep current demo/regional zoom; only compute the full-state zoom-out floor
                establishStateZoomLimit(map, stateBounds, true)
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

                if (zoomedOut && belowMin) {
                    map.setZoom(minZoom!)
                }

                lastZoomRef.current = map.getZoom() ?? current
            }

            const zoomListener = map.addListener('zoom_changed', onZoomChanged)
            const dragEndListener = map.addListener('dragend', onDragEnd)

            return () => {
                google.maps.event.removeListener(zoomListener)
                google.maps.event.removeListener(dragEndListener)
            }
        }
    }, [map, stateBounds, fitStateView, establishStateZoomLimit, coverageMapBounds])

    // Lock sub-admin license radius: fit full circle and restrict pan/zoom to its bbox
    React.useEffect(() => {
        if (!map || !coverageMapBounds) {
            coverageBoundsFittedRef.current = false
            coverageMinZoomRef.current = null
            return
        }

        const bounds = coverageMapBounds
        const latLngBounds = toLatLngBounds(bounds)
        map.setOptions({
            restriction: {
                latLngBounds,
                strictBounds: true,
            },
        })

        if (!coverageBoundsFittedRef.current) {
            fitCoverageView(map, bounds)
            coverageBoundsFittedRef.current = true
        }

        const resetToCoverageView = () => {
            fitCoverageView(map, bounds)
        }

        const onDragEnd = () => {
            if (viewportExceedsStateBounds(map, bounds)) {
                resetToCoverageView()
            }
        }

        const onZoomChanged = () => {
            const current = map.getZoom()
            if (current == null) return
            const minZoom = coverageMinZoomRef.current
            const prev = lastZoomRef.current

            const zoomedOut = prev != null && current < prev
            const belowMin = minZoom != null && current < minZoom
            const viewportTooWide = viewportExceedsStateBounds(map, bounds)

            if (zoomedOut && (belowMin || viewportTooWide)) {
                if (minZoom != null) {
                    map.setZoom(minZoom)
                } else {
                    resetToCoverageView()
                }
            } else if (viewportTooWide) {
                resetToCoverageView()
            }

            lastZoomRef.current = map.getZoom() ?? current
        }

        const zoomListener = map.addListener('zoom_changed', onZoomChanged)
        const dragEndListener = map.addListener('dragend', onDragEnd)

        return () => {
            google.maps.event.removeListener(zoomListener)
            google.maps.event.removeListener(dragEndListener)
        }
    }, [map, coverageMapBounds, fitCoverageView])

    React.useEffect(() => {
        stateBoundsFittedRef.current = false
        stateMinZoomRef.current = null
        if (!coverageMapBounds) {
            lastZoomRef.current = null
        }
    }, [stateBounds?.west, stateBounds?.south, stateBounds?.east, stateBounds?.north, coverageMapBounds])

    React.useEffect(() => {
        coverageBoundsFittedRef.current = false
        coverageMinZoomRef.current = null
    }, [
        lockToCoverage,
        coverageCircle?.center.lat,
        coverageCircle?.center.lng,
        coverageCircle?.radiusMeters,
    ])

    // Clear selected marker if it's no longer in the markers list (e.g. when switching tabs)
    React.useEffect(() => {
        if (selectedMarker && !markers.find(m => m.id === selectedMarker.id)) {
            setSelectedMarker(null)
        }
    }, [markers, selectedMarker])

    const handleMapClick = useCallback(
        (e: google.maps.MapMouseEvent) => {
            if (!heatClickOnly || !showHeatmap || !heatIncidents.length) return
            const lat = e.latLng?.lat()
            const lng = e.latLng?.lng()
            if (lat == null || lng == null) return
            const hit = findNearestHeatIncident(lat, lng, heatIncidents)
            if (hit) {
                setSelectedMarker(null)
                setSelectedHeatIncident(hit)
                onHeatIncidentSelect?.(hit)
            } else {
                setSelectedHeatIncident(null)
            }
        },
        [heatClickOnly, showHeatmap, heatIncidents, onHeatIncidentSelect],
    )

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

    return (
        <div className="w-full h-full min-h-[400px] rounded-xl overflow-hidden shadow-inner border border-slate-200 relative">
            <GoogleMapComponent
                mapContainerStyle={containerStyle}
                center={mapCenter}
                zoom={stateBounds || coverageMapBounds ? undefined : zoom}
                onLoad={onLoad}
                onUnmount={onUnmount}
                onClick={handleMapClick}
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
                        <Polyline
                            path={coverageCirclePath(
                                coverageCircle.center,
                                coverageCircle.radiusMeters,
                            )}
                            options={{
                                strokeColor: '#33375D',
                                strokeOpacity: 0.95,
                                strokeWeight: 2,
                                geodesic: true,
                                clickable: false,
                                zIndex: 2,
                            }}
                        />
                    )}

                {disasterZoneCircles.map((zone) => (
                    <React.Fragment key={`dz-${zone.id}`}>
                        <Circle
                            center={zone.center}
                            radius={zone.radiusMeters}
                            options={{
                                fillColor: zone.fillColor ?? '#DC2626',
                                fillOpacity: zone.fillOpacity ?? 0.2,
                                strokeColor: zone.strokeColor ?? '#991B1B',
                                strokeWeight: zone.strokeWeight ?? 2,
                                strokeOpacity: 0.95,
                                clickable: false,
                                zIndex: zone.id === 'zone_a' ? 5 : zone.id === 'zone_b' ? 4 : 3,
                            }}
                        />
                        <Marker
                            position={zone.labelPosition}
                            clickable={false}
                            icon={{
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 0,
                            }}
                            label={{
                                text: zone.label,
                                color: '#3A3D41',
                                fontSize: '13px',
                                fontWeight: 'bold',
                            }}
                            zIndex={10}
                        />
                    </React.Fragment>
                ))}

                {polylines.map((line, idx) => {
                    const path = line.path.filter(
                        (p) =>
                            Number.isFinite(p.lat) &&
                            Number.isFinite(p.lng) &&
                            !Number.isNaN(p.lat) &&
                            !Number.isNaN(p.lng),
                    )
                    if (path.length < 2) return null
                    const lineKey = line.id ?? `polyline-${idx}-${line.label ?? 'path'}`
                    return (
                        <Polyline
                            key={lineKey}
                            path={path}
                            onClick={() => {
                                if (line.closure) {
                                    setSelectedHeatIncident(null)
                                    setSelectedMarker(null)
                                    setSelectedRoadClosure(line)
                                }
                            }}
                            options={{
                                strokeColor: line.strokeColor ?? '#DC2626',
                                strokeOpacity: line.strokeOpacity ?? 0.9,
                                strokeWeight: line.strokeWeight ?? (line.kind === 'road_closure' ? 7 : 4),
                                geodesic: true,
                                zIndex: line.kind === 'road_closure' ? 3 : 2,
                                clickable: Boolean(line.closure),
                            }}
                        />
                    )
                })}

                {selectedRoadClosure?.closure && selectedRoadClosure.path.length >= 2 && (
                    <InfoWindow
                        position={
                            selectedRoadClosure.path[
                                Math.floor(selectedRoadClosure.path.length / 2)
                            ]
                        }
                        onCloseClick={() => setSelectedRoadClosure(null)}
                    >
                        <div className="max-w-[280px] p-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                Road Closure
                            </p>
                            <div className="font-bold text-base mb-2 text-slate-900">
                                {selectedRoadClosure.closure.roadName}
                            </div>
                            <div
                                className={`text-[10px] font-black uppercase mb-2 inline-block px-2 py-0.5 rounded ${
                                    selectedRoadClosure.closure.status === 'Closed'
                                        ? 'bg-red-100 text-red-700'
                                        : selectedRoadClosure.closure.status === 'Restricted'
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                }`}
                            >
                                Status: {selectedRoadClosure.closure.status}
                            </div>
                            {selectedRoadClosure.closure.reason && (
                                <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                                    {selectedRoadClosure.closure.reason}
                                </p>
                            )}
                            {selectedRoadClosure.closure.startLocation && (
                                <p className="text-xs text-slate-700 mb-1">
                                    <span className="font-semibold">Start:</span>{' '}
                                    {selectedRoadClosure.closure.startLocation}
                                </p>
                            )}
                            {selectedRoadClosure.closure.endLocation && (
                                <p className="text-xs text-slate-700 mb-1">
                                    <span className="font-semibold">End:</span>{' '}
                                    {selectedRoadClosure.closure.endLocation}
                                </p>
                            )}
                            {selectedRoadClosure.closure.updatedAt && (
                                <p className="text-[10px] text-slate-400 font-medium mt-2">
                                    Updated:{' '}
                                    {new Date(selectedRoadClosure.closure.updatedAt).toLocaleString()}
                                </p>
                            )}
                            {selectedRoadClosure.closure.source && (
                                <p className="text-[10px] text-slate-400 font-medium">
                                    Source: {selectedRoadClosure.closure.source}
                                </p>
                            )}
                        </div>
                    </InfoWindow>
                )}

                {renderedMarkers.map((marker) => (
                    <React.Fragment key={marker.id}>
                        <Marker
                            position={marker.position}
                            title={marker.title}
                            onClick={() => {
                                setSelectedHeatIncident(null)
                                setSelectedMarker(marker)
                            }}
                            icon={buildMarkerIcon(marker)}
                        />

                        {/* Area Highlighting for Hazards */}
                        {(marker.type === 'earthquake' || marker.type === 'weather') && marker.radius && (
                            <Circle
                                center={marker.position}
                                radius={marker.radius}
                                onClick={() => {
                                setSelectedHeatIncident(null)
                                setSelectedMarker(marker)
                            }}
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

                {selectedHeatIncident && (
                    <InfoWindow
                        position={{ lat: selectedHeatIncident.lat, lng: selectedHeatIncident.lng }}
                        onCloseClick={() => setSelectedHeatIncident(null)}
                    >
                        <div className="p-2 min-w-[200px] max-w-[300px] bg-white text-slate-900 rounded-lg">
                            <h3 className="font-extrabold text-sm mb-1 uppercase tracking-tight flex items-center gap-2">
                                ⚠️ Incident
                            </h3>
                            <div className="font-bold text-lg mb-1">{selectedHeatIncident.name}</div>
                            {selectedHeatIncident.severity && (
                                <div className="text-[10px] font-black uppercase mb-1 inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                    {selectedHeatIncident.severity}
                                </div>
                            )}
                            {selectedHeatIncident.location && (
                                <p className="text-xs text-slate-700 mb-2 leading-relaxed">
                                    {selectedHeatIncident.location}
                                </p>
                            )}
                            <p className="text-[10px] text-slate-500 mb-2">
                                {selectedHeatIncident.category || selectedHeatIncident.source || 'Active alert'}
                            </p>
                            <button
                                type="button"
                                onClick={() => setIncidentDialogOpen(true)}
                                className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[#33375D] hover:underline"
                            >
                                View AI Report →
                            </button>
                        </div>
                    </InfoWindow>
                )}

                {selectedMarker && (
                    <InfoWindow
                        position={selectedMarker.position}
                        onCloseClick={() => setSelectedMarker(null)}
                    >
                        <div className="p-2 min-w-[200px] max-w-[300px] bg-white text-slate-900 rounded-lg">
                            <h3 className="font-extrabold text-sm mb-1 uppercase tracking-tight flex items-center gap-2">
                                {selectedMarker.type === 'user' ? '👤 Citizen' :
                                    selectedMarker.type === 'responder' ? '🚒 Responder' :
                                    selectedMarker.type === 'earthquake' ? '🌋 Earthquake' :
                                        selectedMarker.type === 'weather' ? '🌦️ Weather Alert' :
                                            selectedMarker.type === 'incident' ? '⚠️ Incident' :
                                                selectedMarker.category ? selectedMarker.category :
                                                    selectedMarker.type === 'infrastructure' ? '🏢 Infrastructure' : '📍 Admin'}
                            </h3>
                            <div className="font-bold text-lg mb-1">{selectedMarker.title}</div>

                            {(selectedMarker.status || selectedMarker.isSafe != null) && (
                                <div className={`text-[10px] font-black uppercase mb-1 inline-block px-2 py-0.5 rounded ${selectedMarker.isSafe === false || isHelpStatus(selectedMarker.status, selectedMarker.isSafe) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                    }`}>
                                    Status: {formatMarkerStatus(selectedMarker.status, selectedMarker.isSafe)}
                                </div>
                            )}

                            {selectedMarker.timestamp && (
                                <div className="text-[10px] text-slate-400 font-bold mb-2">
                                    Date: {new Date(selectedMarker.timestamp).toLocaleString()}
                                </div>
                            )}

                            {selectedMarker.location && (
                                <p className="text-xs text-slate-700 mb-2 leading-relaxed">
                                    <span className="font-black uppercase text-[10px] text-slate-400 tracking-wide">Address</span>
                                    <br />
                                    {selectedMarker.location}
                                </p>
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

                            {selectedMarker.incidentId && (
                                <button
                                    type="button"
                                    onClick={() => setIncidentDialogOpen(true)}
                                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[#33375D] hover:underline"
                                >
                                    View AI Report →
                                </button>
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

            <IncidentDetailDialog
                open={incidentDialogOpen}
                onOpenChange={setIncidentDialogOpen}
                eventIds={
                    selectedHeatIncident
                        ? [selectedHeatIncident.id]
                        : selectedMarker?.incidentId
                          ? [selectedMarker.incidentId]
                          : []
                }
                bulletText={
                    selectedHeatIncident
                        ? `${selectedHeatIncident.name} — ${selectedHeatIncident.severity} severity${selectedHeatIncident.location ? ` · ${selectedHeatIncident.location}` : ''}`
                        : selectedMarker?.title
                          ? `${selectedMarker.title}${selectedMarker.description ? ` — ${selectedMarker.description}` : ''}`
                          : ''
                }
            />
        </div>
    )
}
