'use client'

import React, { useMemo, useCallback, useState, useRef } from 'react'
import { GoogleMap as GoogleMapComponent, useJsApiLoader, Marker, InfoWindow, Circle } from '@react-google-maps/api'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/constants/google-maps-config'

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

interface GoogleMapProps {
    address?: string
    markers?: MapMarker[]
    center?: { lat: number; lng: number }
    zoom?: number
    heatPoints?: { lat: number; lng: number; weight?: number }[]
    showHeatmap?: boolean
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

export function GoogleMap({ address, markers = [], center, zoom = 10, heatPoints = [], showHeatmap = false }: GoogleMapProps) {
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
    const heatLayerRef = useRef<google.maps.visualization.HeatmapLayer | null>(null)

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map)
    }, [])

    const onUnmount = useCallback(function callback(map: google.maps.Map) {
        setMap(null)
    }, [])

    // Smooth pan when center changes
    React.useEffect(() => {
        if (map && center) {
            map.panTo(center)
        }
    }, [map, center])

    // Clear selected marker if it's no longer in the markers list (e.g. when switching tabs)
    React.useEffect(() => {
        if (selectedMarker && !markers.find(m => m.id === selectedMarker.id)) {
            setSelectedMarker(null)
        }
    }, [markers, selectedMarker])

    React.useEffect(() => {
        if (!map) return

        if (heatLayerRef.current) {
            heatLayerRef.current.setMap(null)
            heatLayerRef.current = null
        }

        if (!showHeatmap || heatPoints.length === 0 || !google.maps.visualization?.HeatmapLayer) return

        const data = heatPoints.map((p) => ({
            location: new google.maps.LatLng(p.lat, p.lng),
            weight: Math.max(0.1, Math.min(1.2, p.weight ?? 0.6)),
        }))

        const heat = new google.maps.visualization.HeatmapLayer({
            data,
            radius: 36,
            opacity: 0.78,
            maxIntensity: 1.05,
            dissipating: true,
            gradient: [
                'rgba(59,130,246,0)',
                'rgba(59,130,246,0.34)',
                'rgba(250,204,21,0.56)',
                'rgba(251,146,60,0.72)',
                'rgba(239,68,68,0.86)',
                'rgba(185,28,28,0.96)',
            ],
        })

        heat.setMap(map)
        heatLayerRef.current = heat

        return () => {
            if (heatLayerRef.current) {
                heatLayerRef.current.setMap(null)
                heatLayerRef.current = null
            }
        }
    }, [map, showHeatmap, heatPoints])

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
                zoom={zoom}
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
