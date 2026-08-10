'use client'

import React, { useEffect, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
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

interface SignupLocationMapProps {
  center: { lat: number; lng: number }
  markerPosition?: { lat: number; lng: number } | null
  zoom?: number
}

function MapViewController({ center, zoom }: { center: { lat: number; lng: number }; zoom: number }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    // Force Leaflet to recalculate container bounds and render full map tiles
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

export default function SignupLocationMap({
  center,
  markerPosition,
  zoom = 12,
}: SignupLocationMapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-full h-full bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-xs text-slate-400 font-bold">
        Loading Map...
      </div>
    )
  }

  const marker = markerPosition || center
  const geoapifyKey =
    process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || '9abe9caf7f5943d189e9ef564c5cdec7'

  // Use Geoapify osm-bright style with Carto fallback
  const tileUrl = geoapifyKey
    ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

  return (
    <div className="w-full h-44 relative overflow-hidden rounded-2xl border border-slate-200">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        zoomControl={true}
        scrollWheelZoom={false}
        style={{ width: '100%', height: '100%', borderRadius: '1rem' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.geoapify.com/">Geoapify</a>'
          url={tileUrl}
        />
        <MapViewController center={center} zoom={zoom} />
        {marker?.lat && marker?.lng && (
          <Marker position={[marker.lat, marker.lng]} icon={defaultMarkerIcon} />
        )}
      </MapContainer>
    </div>
  )
}
