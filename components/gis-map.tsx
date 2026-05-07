'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  Users,
  Zap,
  Cloud,
  Shield,
  Search,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Navigation,
  Loader2,
  Globe,
  Map as MapIcon,
  Maximize2,
  Settings,
  Radar
} from 'lucide-react'
import { GoogleMap } from '@/components/google-map'
import { cn } from '@/lib/utils'
import { ShieldCheck, Truck, Siren, Building2, MapPin } from 'lucide-react'
import { geocodeAddress, calculateDistance } from '@/lib/services/mock-map-service'
import { Switch } from '@/components/ui/switch'

interface GISMapProps {
  selectedLocation?: string
}

const HOSPITALS = [
  { name: 'Cedars-Sinai Medical Center', city: 'Los Angeles, CA', lat: 34.0759, lng: -118.3805 },
  { name: 'Mass General Hospital', city: 'Boston, MA', lat: 42.3631, lng: -71.0686 },
  { name: 'Mount Sinai Hospital', city: 'New York, NY', lat: 40.79, lng: -73.9525 },
  { name: 'Northwestern Memorial', city: 'Chicago, IL', lat: 41.8947, lng: -87.6217 },
  { name: 'Houston Methodist', city: 'Houston, TX', lat: 29.71, lng: -95.3987 },
  { name: 'Cleveland Clinic', city: 'Cleveland, OH', lat: 41.5036, lng: -81.6206 },
  { name: 'Mayo Clinic', city: 'Rochester, MN', lat: 44.0225, lng: -92.4669 },
  { name: 'Johns Hopkins Hospital', city: 'Baltimore, MD', lat: 39.297, lng: -76.5929 },
  { name: 'UCSF Medical Center', city: 'San Francisco, CA', lat: 37.7639, lng: -122.4581 },
  { name: 'Emory University Hospital', city: 'Atlanta, GA', lat: 33.792, lng: -84.322 },
  { name: 'Banner - University Medical', city: 'Phoenix, AZ', lat: 33.4754, lng: -112.0712 },
  { name: 'Jackson Memorial', city: 'Miami, FL', lat: 25.79, lng: -80.212 },
]

const PHARMACIES = [
  { name: 'CVS Pharmacy #1024', city: 'Seattle, WA', lat: 47.6062, lng: -122.3321 },
  { name: 'Walgreens #5582', city: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
  { name: 'Rite Aid Downtown', city: 'Portland, OR', lat: 45.5152, lng: -122.6784 },
  { name: 'CVS Pharmacy #770', city: 'Dallas, TX', lat: 32.7767, lng: -96.797 },
  { name: 'Walgreens Midtown', city: 'Nashville, TN', lat: 36.1627, lng: -86.7816 },
  { name: 'CVS Pharmacy #2210', city: 'Philadelphia, PA', lat: 39.9526, lng: -75.1652 },
  { name: 'Walgreens #1188', city: 'Las Vegas, NV', lat: 36.1699, lng: -115.1398 },
  { name: 'Rite Aid Capitol', city: 'Sacramento, CA', lat: 38.5816, lng: -121.4944 },
  { name: 'CVS Pharmacy #4401', city: 'Charlotte, NC', lat: 35.2271, lng: -80.8431 },
  { name: 'Walgreens #889', city: 'Indianapolis, IN', lat: 39.7684, lng: -86.1581 },
  { name: 'CVS Pharmacy #9087', city: 'Salt Lake City, UT', lat: 40.7608, lng: -111.891 },
  { name: 'Walgreens #3321', city: 'St. Louis, MO', lat: 38.627, lng: -90.1994 },
]

export function GISMap({ selectedLocation = 'All' }: GISMapProps) {
  const [activeEmergencies, setActiveEmergencies] = useState<any[]>([])
  const [impactedUsers, setImpactedUsers] = useState<any[]>([])
  const [responders, setResponders] = useState<any[]>([])
  const [subAdmins, setSubAdmins] = useState<any[]>([])
  const [dynamicInfra, setDynamicInfra] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearchingInfra, setIsSearchingInfra] = useState(false)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 37.0902, lng: -95.7129 }) // Center of USA
  const [mapZoom, setMapZoom] = useState(4)
  const [activeTab, setActiveTab] = useState<'Citizens' | 'Responders' | 'Leaders' | 'Infrastructure'>('Citizens')
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showHospitals, setShowHospitals] = useState(true)
  const [showPharmacies, setShowPharmacies] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      try {
        const [activeRes, impactedRes, subAdminsRes, respondersRes] = await Promise.all([
          fetch('/api/active-emergencies'),
          fetch('/api/ready2go-users-impacted'),
          fetch('/api/admin/users?role=sub-admin'),
          fetch('/api/responders')
        ])

        const [activeData, impactedData, subAdminsData, respondersData] = await Promise.all([
          activeRes.ok ? activeRes.json() : [],
          impactedRes.ok ? impactedRes.json() : [],
          subAdminsRes.ok ? subAdminsRes.json() : { users: [] },
          respondersRes.ok ? respondersRes.json() : []
        ])

        // Process Impacted Users
        const userMarkersArray = Array.isArray(impactedData) ? impactedData : impactedData?.users || []
        const userMarkers = await Promise.all((userMarkersArray || []).map(async (item: any) => {
          // Use stored coordinates if available, otherwise geocode
          let pos = (item.lat && item.lng)
            ? { lat: Number(item.lat), lng: Number(item.lng) }
            : await geocodeAddress(item.location || 'USA');

          // Add small jitter ONLY if it's a generic fallback to prevent hiding markers
          if (pos.lat === 37.0902 && pos.lng === -95.7129) {
            pos = {
              lat: pos.lat + (Math.random() - 0.5) * 0.5,
              lng: pos.lng + (Math.random() - 0.5) * 0.5
            }
          }
          return {
            id: item._id || Math.random().toString(),
            position: pos,
            title: item.name || 'Impacted User',
            type: 'user',
            isSafe: false,
            status: item.status || 'At Risk',
            location: item.location || item.city,
            subAdminName: item.subAdminName,
            description: `Affected Zone: ${item.location || item.city || 'Unknown'}`
          }
        }))
        setImpactedUsers(userMarkers)

        // Process Responders
        const respondersArray = Array.isArray(respondersData) ? respondersData : []
        const responderMarkers = await Promise.all((respondersArray || []).map(async (item: any) => {
          const pos = item.coordinates || await geocodeAddress(item.location || 'USA')
          return {
            id: item._id || Math.random().toString(),
            position: pos,
            title: item.name,
            type: 'incident',
            status: item.status,
            location: item.location,
            description: `${item.type} Unit - ${item.location}`,
            color: item.type === 'Fire' ? '#EF4444' : item.type === 'Police' ? '#3B82F6' : '#10B981',
            icon: item.type === 'Police' ? 'police' : item.type === 'Fire' ? 'fire' : 'medical'
          }
        }))
        setResponders(responderMarkers)

        // Process Leaders
        const adminMarkersArray = Array.isArray(subAdminsData.users) ? subAdminsData.users : []
        const adminMarkers = await Promise.all((adminMarkersArray || []).map(async (user: any) => {
          const pos = await geocodeAddress(user.city || user.country || 'USA')
          return {
            id: user._id || Math.random().toString(),
            position: pos,
            title: user.name,
            type: 'admin',
            status: 'Online',
            location: user.city || user.country,
            description: `Sub-Admin: ${user.city || ''} ${user.country || ''}`
          }
        }))
        setSubAdmins(adminMarkers)

      } catch (error) {
        console.error('Error fetching GIS data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  // Auto-zoom and center when selection changes
  useEffect(() => {
    if (selectedLocation === 'All') {
      setMapCenter({ lat: 37.0902, lng: -95.7129 });
      setMapZoom(4);
    } else {
      // 1. Find the admin's coordinates (for fallback)
      const rawAdmin = subAdmins.find(u => u.name === selectedLocation);
      const adminPos = rawAdmin && rawAdmin.lat && rawAdmin.lng 
        ? { lat: Number(rawAdmin.lat), lng: Number(rawAdmin.lng) }
        : null;

      // 2. Filter impacted users for this admin
      const filteredUsers = impactedUsers.filter(u => u.subAdminName === selectedLocation);

      if (filteredUsers.length > 0) {
        // 3. Calculate center of users
        const lats = filteredUsers.map(u => u.position.lat);
        const lngs = filteredUsers.map(u => u.position.lng);
        const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

        // 4. Calculate appropriate zoom level based on spread
        const latSpan = Math.max(...lats) - Math.min(...lats);
        const lngSpan = Math.max(...lngs) - Math.min(...lngs);
        const maxSpan = Math.max(latSpan, lngSpan);

        // Heuristic: Zoom levels roughly correlate to span
        // Zoom 12 is city level (~0.1 deg span)
        // Zoom 6 is state level (~5.0 deg span)
        let dynamicZoom = 12;
        if (maxSpan > 5) dynamicZoom = 5;
        else if (maxSpan > 2) dynamicZoom = 6;
        else if (maxSpan > 1) dynamicZoom = 7;
        else if (maxSpan > 0.5) dynamicZoom = 9;
        else if (maxSpan > 0.1) dynamicZoom = 11;
        
        setMapCenter({ lat: avgLat, lng: avgLng });
        setMapZoom(dynamicZoom);
      } else if (adminPos) {
        // Fallback to admin city if no users found
        setMapCenter(adminPos);
        setMapZoom(12);
      }
    }
  }, [selectedLocation, subAdmins, impactedUsers]);

  // Fetch Infrastructure when the "Infrastructure" tab is activated
  useEffect(() => {
    if (activeTab !== 'Infrastructure' || impactedUsers.length === 0) return;

    // Avoid refetching if we already have results (optional, but good for performance)
    // If you want to refresh every time, remove the next line:
    if (dynamicInfra.length > 0) return;

    async function fetchNearbyInfra() {
      setIsSearchingInfra(true)
      try {
        const types = ['hospital', 'pharmacy', 'gas_station', 'community_center', 'school']
        const allResults: any[] = []
        const seenIds = new Set()

        // 1. Get unique search centers (unique user positions)
        const searchCenters: { lat: number, lng: number }[] = []
        for (const user of impactedUsers) {
          if (!user.position) continue;

          const isIdentical = searchCenters.some(center => {
            const dist = calculateDistance(user.position.lat, user.position.lng, center.lat, center.lng);
            return dist < 0.5;
          });

          if (!isIdentical) {
            searchCenters.push(user.position);
          }
        }

        console.log(`Searching infrastructure for ${searchCenters.length} locations...`);

        // 2. Fetch infrastructure for each type at each location
        await Promise.all(searchCenters.map(async (center) => {
          await Promise.all(types.map(async (type) => {
            try {
              const res = await fetch(`/api/places?lat=${center.lat}&lng=${center.lng}&type=${type}&radius=2000`)
              if (res.ok) {
                const data = await res.json()
                const results = data.results || []

                results.forEach((place: any) => {
                  if (!seenIds.has(place.place_id)) {
                    seenIds.add(place.place_id)

                    // Distinct styling based on type
                    let color = '#10B981'; // Green for hospital
                    let icon = 'medical';
                    if (type === 'pharmacy') {
                      color = '#3B82F6'; // Blue for pharmacy
                      icon = 'pharmacy';
                    } else if (type === 'gas_station') {
                      color = '#F59E0B'; // Amber for gas station
                      icon = 'gas';
                    } else if (type === 'community_center' || type === 'school') {
                      color = '#06B6D4'; // Cyan for shelters/community
                      icon = 'home';
                    }

                    const category = type === 'hospital' ? '🏥 Hospital' :
                      type === 'pharmacy' ? '💊 Pharmacy' :
                        type === 'gas_station' ? '⛽ Petrol Pump' :
                          (type === 'community_center' || type === 'school') ? '🏠 Shelter' : '🏢 Infrastructure';

                    allResults.push({
                      id: place.place_id,
                      position: place.geometry.location,
                      title: place.name,
                      type: 'infrastructure',
                      category: category,
                      status: (type === 'community_center' || type === 'school') ? 'Emergency Shelter' : `Verified ${type.replace('_', ' ')}`,
                      description: (type === 'community_center' || type === 'school')
                        ? 'Official Community Shelter Site'
                        : place.vicinity || 'Real-time infrastructure',
                      color: color,
                      icon: icon,
                      location: selectedLocation !== 'All' ? selectedLocation : 'USA'
                    })
                  }
                })
              }
            } catch (err) {
              console.warn(`Search failed for ${type} at ${center.lat},${center.lng}`, err);
            }
          }))
        }));

        // 3. Add Mock Data for Waivers and Evacuation Routes if in a specific area
        if (searchCenters.length > 0) {
          const mainCenter = searchCenters[0];

          // Add a Waiver
          allResults.push({
            id: 'waiver-1',
            position: { lat: mainCenter.lat + 0.005, lng: mainCenter.lng + 0.005 },
            title: 'Resource Allocation Waiver #442',
            type: 'infrastructure',
            category: '📜 Waiver',
            status: 'Active Waiver',
            description: 'Emergency waiver active for medical supply distribution.',
            color: '#6366F1', // Indigo
            icon: 'shield',
            location: selectedLocation !== 'All' ? selectedLocation : 'USA'
          });

          // Add an Evacuation Route Start
          allResults.push({
            id: 'evac-route-1',
            position: { lat: mainCenter.lat - 0.008, lng: mainCenter.lng - 0.002 },
            title: 'Evacuation Route 7 - Checkpoint',
            type: 'infrastructure',
            category: '📍 Evacuation Point',
            status: 'Route Active',
            description: 'Primary evacuation corridor to North shelters.',
            color: '#EC4899', // Pink
            icon: 'navigation',
            location: selectedLocation !== 'All' ? selectedLocation : 'USA'
          });
        }

        setDynamicInfra(allResults)
      } catch (error) {
        console.warn('Infra search error:', error)
      } finally {
        setIsSearchingInfra(false)
      }
    }

    fetchNearbyInfra()
  }, [activeTab, impactedUsers.length, dynamicInfra.length])

  const markers = useMemo(() => {
    let currentFiltered: any[] = []

    switch (activeTab) {
      case 'Citizens': currentFiltered = impactedUsers; break;
      case 'Responders': currentFiltered = responders; break;
      case 'Leaders': currentFiltered = subAdmins; break;
      case 'Infrastructure': currentFiltered = dynamicInfra; break;
      default: currentFiltered = [];
    }

    // Apply location filtering
    if (selectedLocation !== 'All') {
      currentFiltered = currentFiltered.filter(m =>
        m.subAdminName === selectedLocation ||
        m.location === selectedLocation ||
        (m.description && m.description.includes(selectedLocation)) ||
        (m.title && m.title.includes(selectedLocation))
      )
    }

    return currentFiltered
  }, [activeTab, impactedUsers, responders, subAdmins, dynamicInfra, selectedLocation])

  const hospitalMarkers = useMemo(
    () =>
      HOSPITALS.map((h) => ({
        id: `hospital-${h.name}`,
        position: { lat: h.lat, lng: h.lng },
        title: h.name,
        type: 'infrastructure' as const,
        status: 'Hospital · Shelter',
        description: h.city,
        icon: 'hospital',
        color: '#EF4444',
        location: h.city,
      })),
    [],
  )

  const pharmacyMarkers = useMemo(
    () =>
      PHARMACIES.map((p) => ({
        id: `pharmacy-${p.name}`,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        type: 'infrastructure' as const,
        status: 'Pharmacy · Supply',
        description: p.city,
        icon: 'pharmacy',
        color: '#10B981',
        location: p.city,
      })),
    [],
  )

  const heatPoints = useMemo(() => {
    const base = [...impactedUsers, ...responders, ...dynamicInfra]
      .filter((m: any) => m?.position && Number.isFinite(m.position.lat) && Number.isFinite(m.position.lng))
      .map((m: any, i: number) => ({
        lat: m.position.lat,
        lng: m.position.lng,
        weight:
          m.type === 'incident'
            ? 0.95
            : m.isSafe === false
              ? 0.85
              : m.type === 'infrastructure'
                ? 0.55
                : 0.45 + ((i % 4) * 0.08),
      }))
    // Keep count close to the reference panel value.
    return base.slice(0, 24)
  }, [impactedUsers, responders, dynamicInfra])

  const mapMarkers = useMemo(() => {
    const overlays = [
      ...(showHospitals ? hospitalMarkers : []),
      ...(showPharmacies ? pharmacyMarkers : []),
    ]
    return [...overlays, ...markers]
  }, [showHospitals, showPharmacies, hospitalMarkers, pharmacyMarkers, markers])

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm h-[700px] flex flex-col">
      <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tighter uppercase shrink-0">GIS Impact Map</h2>
        </div>

        <div className="flex bg-slate-50 p-1 rounded-2xl gap-0.5 overflow-x-auto no-scrollbar">
          {(['Citizens', 'Responders', 'Leaders', 'Infrastructure'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 sm:px-6 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap",
                activeTab === tab
                  ? "bg-white text-blue-600 shadow-sm border border-slate-100"
                  : "text-slate-400 hover:text-slate-900"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative">
        <GoogleMap markers={mapMarkers} zoom={mapZoom} center={mapCenter} heatPoints={heatPoints} showHeatmap={showHeatmap} />
        <div className="absolute right-4 top-4 z-40 w-64 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm">
          <div className="mb-3 border-b border-slate-100 pb-2">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Map Layers</h4>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shelters</p>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="hospital-layer"
                className="flex flex-1 cursor-pointer items-center gap-2 text-xs font-bold text-slate-700"
              >
                <span className="text-red-500">🏥</span>
                Hospitals
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                  {hospitalMarkers.length}
                </span>
              </label>
              <Switch id="hospital-layer" checked={showHospitals} onCheckedChange={setShowHospitals} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="pharmacy-layer"
                className="flex flex-1 cursor-pointer items-center gap-2 text-xs font-bold text-slate-700"
              >
                <span className="text-emerald-500">💊</span>
                Pharmacies
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                  {pharmacyMarkers.length}
                </span>
              </label>
              <Switch id="pharmacy-layer" checked={showPharmacies} onCheckedChange={setShowPharmacies} />
            </div>
            <div className="my-2 h-px bg-slate-100" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Risk Overlays</p>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="incident-heatmap"
                className="flex flex-1 cursor-pointer items-center gap-2 text-xs font-bold text-slate-700"
              >
                <span className="text-amber-500">🔥</span>
                Incident Heatmap
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                  {heatPoints.length}
                </span>
              </label>
              <Switch id="incident-heatmap" checked={showHeatmap} onCheckedChange={setShowHeatmap} />
            </div>
            {showHeatmap && (
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Intensity</p>
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-blue-500 via-yellow-400 via-orange-500 to-red-700" />
                <div className="flex justify-between text-[9px] font-bold text-slate-400">
                  <span>Low</span>
                  <span>Critical</span>
                </div>
              </div>
            )}
          </div>
        </div>
        {isSearchingInfra && (
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl border border-slate-100 flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Locating Facilities...</span>
          </div>
        )}
      </div>
    </div>
  )
}
