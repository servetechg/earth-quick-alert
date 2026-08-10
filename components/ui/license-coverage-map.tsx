'use client'

import React, { useEffect, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Custom marker icon to prevent default Leaflet image path resolution issues in Next.js
const defaultMarkerIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface LicenseCoverageMapProps {
  center: { lat: number; lng: number }
  radiusMile?: number
  coverageType?: 'state' | 'radius' | string
  zoom?: number
  className?: string
}

function MapViewController({ center, zoom }: { center: { lat: number; lng: number }; zoom: number }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    // Invalidate map container dimensions for modal dialog rendering
    map.invalidateSize()
    const timer1 = setTimeout(() => map.invalidateSize(), 150)
    const timer2 = setTimeout(() => map.invalidateSize(), 400)

    if (center?.lat && center?.lng) {
      map.setView([center.lat, center.lng], zoom)
    }

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [map, center.lat, center.lng, zoom])

  return null
}

export default function LicenseCoverageMap({
  center,
  radiusMile = 5,
  coverageType = 'radius',
  zoom = 10,
  className = '',
}: LicenseCoverageMapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className={`w-full h-[240px] bg-slate-100 animate-pulse rounded-3xl flex items-center justify-center text-xs text-slate-400 font-bold ${className}`}>
        Loading Coverage Map...
      </div>
    )
  }

  const geoapifyKey =
    process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || '9abe9caf7f5943d189e9ef564c5cdec7'

  const tileUrl = geoapifyKey
    ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

  const radiusMeters = (radiusMile || 5) * 1609.34

  return (
    <div className={`w-full h-[240px] relative overflow-hidden rounded-3xl border border-slate-200 shadow-inner ${className}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        zoomControl={true}
        scrollWheelZoom={false}
        style={{ width: '100%', height: '100%', borderRadius: '1.5rem' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.geoapify.com/">Geoapify</a>'
          url={tileUrl}
        />
        <MapViewController center={center} zoom={zoom} />
        {center?.lat && center?.lng && (
          <Marker position={[center.lat, center.lng]} icon={defaultMarkerIcon} />
        )}
        {coverageType === 'radius' && center?.lat && center?.lng && radiusMeters > 0 && (
          <Circle
            center={[center.lat, center.lng]}
            radius={radiusMeters}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.2,
              weight: 2,
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}
