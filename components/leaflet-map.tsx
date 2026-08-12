'use client'

import { useEffect, useState, memo } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { EmergencyResource } from '@/lib/types/emergency'

// Fix for default marker icons in Leaflet with Next.js
if (typeof window !== 'undefined') {
    if (!(L.Icon.Default.prototype as any)._fixed) {
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        });
        (L.Icon.Default.prototype as any)._fixed = true;
    }
}


interface LeafletMapProps {
    center: { lat: number; lng: number }
    resources: EmergencyResource[]
    zoom?: number
    className?: string
    interactive?: boolean
    variant?: 'standard' | 'satellite' | 'dark'
}

// Separate component to handle map view updates and capture the map instance
const MapReadyHandler = ({
    center,
    zoom,
    children
}: {
    center: [number, number],
    zoom: number,
    children: React.ReactNode
}) => {
    const map = useMap()
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        if (map) {
            map.setView(center, zoom)
            // Small delay to ensure the container is truly ready for appendChild
            const timer = setTimeout(() => setIsReady(true), 0)
            return () => clearTimeout(timer)
        }
    }, [map, center, zoom])

    return isReady ? <>{children}</> : null
}

const ResourceMarkers = memo(({ resources }: { resources: EmergencyResource[] }) => {
    return (
        <>
            {resources.map((resource) => (
                <Marker
                    key={resource.id}
                    position={[resource.location.lat, resource.location.lng]}
                    icon={L.divIcon({
                        className: 'custom-resource-icon',
                        html: `
                            <div style="
                                background-color: ${resource.type === 'hospital' ? '#ef4444' : resource.type === 'pharmacy' ? '#22c55e' : '#3b82f6'}; 
                                width: 12px; 
                                height: 12px; 
                                border-radius: 50%; 
                                border: 2px solid white; 
                                box-shadow: 0 0 5px rgba(0,0,0,0.2);
                            "></div>
                        `,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })}
                >
                    <Popup className="rounded-xl overflow-hidden">
                        <div className="p-1">
                            <h4 className="font-black text-slate-900 leading-tight mb-1">{resource.name}</h4>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">{resource.location.address}</p>
                            <div className="flex items-center justify-between gap-4">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${resource.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                    }`}>
                                    {resource.status}
                                </span>
                                {resource.distance && (
                                    <span className="text-[9px] font-bold text-slate-400">{resource.distance.toFixed(1)} miles</span>
                                )}
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    )
})

ResourceMarkers.displayName = 'ResourceMarkers'

export default function LeafletMap({
    center,
    resources,
    zoom = 13,
    className = "h-full w-full",
    interactive = true,
    variant = 'standard'
}: LeafletMapProps) {
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    if (!isMounted) return null

    const mapCenter: [number, number] = [center.lat, center.lng]

    const getTileLayer = () => {
        switch (variant) {
            case 'satellite':
                return (
                    <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                    />
                )
            case 'dark':
                return (
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    />
                )
            default:
                return (
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                )
        }
    }

    return (
        <div className={className}>
            <MapContainer
                center={mapCenter}
                zoom={zoom}
                scrollWheelZoom={interactive}
                dragging={interactive}
                zoomControl={interactive}
                doubleClickZoom={interactive}
                attributionControl={false}
                className="h-full w-full outline-none"
            >
                <MapReadyHandler center={mapCenter} zoom={zoom}>
                    {getTileLayer()}

                    <ResourceMarkers resources={resources} />

                    {/* User Location Marker */}
                    <Marker
                        position={mapCenter}
                        icon={L.divIcon({
                            className: 'custom-div-icon',
                            html: `<div style="background-color:#3b82f6; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3);"></div>`,
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })}
                    >
                        <Popup>
                            <span className="text-[10px] font-black uppercase font-sans">Your Location</span>
                        </Popup>
                    </Marker>
                </MapReadyHandler>
            </MapContainer>
        </div>
    )
}
