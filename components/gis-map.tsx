'use client'

import React, { useState, useEffect, useMemo, useId } from 'react'
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
  Radar,
  CloudRain,
  Waves,
  Home as HomeIcon,
  PlusSquare,
  Construction,
  Droplets,
  Boxes,
  AlertOctagon,
  X,
} from 'lucide-react'
import { GoogleMap, type CoverageCircleSpec, type MapStateBounds } from '@/components/google-map'
import type { UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap'
import { cn } from '@/lib/utils'
import { getUsStateBbox } from '@/lib/constants/us-state-bounding-boxes'
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps'
import { ShieldCheck, Truck, Siren, Building2, MapPin } from 'lucide-react'
import { geocodeAddress, calculateDistance } from '@/lib/services/mock-map-service'
import { Switch } from '@/components/ui/switch'

interface MapLayerDef {
  id: string
  label: string
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>
  color: string
}

const DEFAULT_MAP_LAYERS: MapLayerDef[] = [
  { id: 'weather', label: 'Weather Radar', Icon: CloudRain, color: '#3B82F6' },
  { id: 'risk', label: 'Risk Areas', Icon: AlertTriangle, color: '#0EA5E9' },
  { id: 'flood', label: 'Flood Zones', Icon: Waves, color: '#A41E22' },
  { id: 'shelters', label: 'Shelters', Icon: HomeIcon, color: '#16A34A' },
  { id: 'hospitals', label: 'Hospitals', Icon: PlusSquare, color: '#22A9A1' },
  { id: 'roads', label: 'Road Closures', Icon: Construction, color: '#DC2626' },
  { id: 'power', label: 'Power Outages', Icon: Zap, color: '#EAB308' },
  { id: 'water', label: 'Water Issues', Icon: Droplets, color: '#0EA5E9' },
  { id: 'resources', label: 'Resource Sites', Icon: Boxes, color: '#16A34A' },
  { id: 'incidents', label: 'Incident Reports', Icon: AlertOctagon, color: '#DC2626' },
]

interface GISMapProps {
  selectedLocation?: string
  /** When set, map can center on this US state even if `selectedLocation` is `All` (e.g. sub-admin home state). */
  focusState?: string
  /** Override the panel header title. Defaults to `GIS Impact Map`. */
  title?: string
  /** Hide the Citizens / Responders / Leaders / Infrastructure tabs. */
  hideTabs?: boolean
  /** Show the floating Map Layers panel on the left of the map. */
  showLayersPanel?: boolean
}

export function GISMap({
  selectedLocation = 'All',
  focusState,
  title = 'GIS Impact Map',
  hideTabs = false,
  showLayersPanel = false,
}: GISMapProps) {
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
  const [unifiedIncidents, setUnifiedIncidents] = useState<UnifiedEventHeatPoint[]>([])
  const [incidentHeatCount, setIncidentHeatCount] = useState(0)
  const [coverageCircle, setCoverageCircle] = useState<CoverageCircleSpec | null>(null)
  const [situationalLoading, setSituationalLoading] = useState(false)
  const [mapLayers, setMapLayers] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_MAP_LAYERS.map((layer) => [layer.id, true])),
  )
  const [layersPanelOpen, setLayersPanelOpen] = useState(true)
  const heatSwitchId = useId()

  const stateBoundsRestriction = useMemo((): MapStateBounds | null => {
    const st = (focusState || '').trim()
    if (!st) return null
    const usps = normalizeStateToUsps(st)
    if (!usps) return null
    const bbox = getUsStateBbox(usps)
    if (!bbox) return null
    const [west, south, east, north] = bbox
    return { west, south, east, north }
  }, [focusState])

  useEffect(() => {
    let cancelled = false

    async function fetchSituational() {
      setSituationalLoading(true)
      try {
        const res = await fetch('/api/admin/situational-map')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setUnifiedIncidents(Array.isArray(data.incidents) ? data.incidents : [])
        setIncidentHeatCount(
          typeof data.incidentCount === 'number'
            ? data.incidentCount
            : Array.isArray(data.incidents)
              ? data.incidents.length
              : 0
        )
        if (
          showLayersPanel &&
          data.coverage?.center &&
          data.coverage?.radiusMeters
        ) {
          const mile = data.coverage.radiusMile
          setCoverageCircle({
            center: data.coverage.center,
            radiusMeters: data.coverage.radiusMeters,
            label:
              typeof mile === 'number'
                ? `License coverage · ${mile} mi`
                : 'License coverage',
          })
          if (
            Number.isFinite(data.coverage.center.lat) &&
            Number.isFinite(data.coverage.center.lng)
          ) {
            setMapCenter(data.coverage.center)
          }
        } else {
          setCoverageCircle(null)
        }
      } catch (e) {
        console.error('Situational map feed:', e)
      } finally {
        if (!cancelled) setSituationalLoading(false)
      }
    }

    void fetchSituational()
    const interval = setInterval(fetchSituational, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [showLayersPanel])

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
          const geoQuery = [user.city, user.state, user.country || 'USA'].filter(Boolean).join(', ') || 'USA'
          const pos = await geocodeAddress(geoQuery)
          return {
            id: user._id || Math.random().toString(),
            position: pos,
            title: user.name,
            type: 'admin',
            status: 'Online',
            location: user.city || user.country,
            city: user.city,
            state: user.state,
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

  // Auto-zoom and center when selection changes (USA vs sub-admin state / metro)
  useEffect(() => {
    let cancelled = false

    async function applyCenter() {
      // Sub-admin: full state view is handled by GoogleMap fitBounds — do not zoom to city/metro
      if (stateBoundsRestriction) {
        const { west, south, east, north } = stateBoundsRestriction
        if (!cancelled) {
          setMapCenter({ lat: (south + north) / 2, lng: (west + east) / 2 })
        }
        return
      }

      if (selectedLocation === 'All') {
        const stAll = (focusState || '').trim()
        if (stAll) {
          const geo = await geocodeAddress(`${stAll}, USA`)
          if (
            !cancelled &&
            geo &&
            Number.isFinite(geo.lat) &&
            Number.isFinite(geo.lng) &&
            !(geo.lat === 37.0902 && geo.lng === -95.7129)
          ) {
            setMapCenter(geo)
            setMapZoom(8)
            return
          }
        }
        setMapCenter({ lat: 37.0902, lng: -95.7129 })
        setMapZoom(4)
        return
      }

      const rawAdmin = subAdmins.find((u) => u.title === selectedLocation)
      const adminPos =
        rawAdmin?.position &&
          Number.isFinite(rawAdmin.position.lat) &&
          Number.isFinite(rawAdmin.position.lng)
          ? rawAdmin.position
          : null

      const filteredUsers = impactedUsers.filter((u) => u.subAdminName === selectedLocation)

      if (filteredUsers.length > 0) {
        const lats = filteredUsers.map((u) => u.position.lat)
        const lngs = filteredUsers.map((u) => u.position.lng)
        const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length
        const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length

        const latSpan = Math.max(...lats) - Math.min(...lats)
        const lngSpan = Math.max(...lngs) - Math.min(...lngs)
        const maxSpan = Math.max(latSpan, lngSpan)

        let dynamicZoom = 12
        if (maxSpan > 5) dynamicZoom = 5
        else if (maxSpan > 2) dynamicZoom = 6
        else if (maxSpan > 1) dynamicZoom = 7
        else if (maxSpan > 0.5) dynamicZoom = 9
        else if (maxSpan > 0.1) dynamicZoom = 11

        if (!cancelled) {
          setMapCenter({ lat: avgLat, lng: avgLng })
          setMapZoom(dynamicZoom)
        }
        return
      }

      const st = (focusState || '').trim()
      if (st) {
        const geo = await geocodeAddress(`${st}, USA`)
        if (
          !cancelled &&
          geo &&
          Number.isFinite(geo.lat) &&
          Number.isFinite(geo.lng) &&
          !(geo.lat === 37.0902 && geo.lng === -95.7129)
        ) {
          setMapCenter(geo)
          setMapZoom(8)
          return
        }
      }

      if (adminPos && !cancelled) {
        setMapCenter(adminPos)
        setMapZoom(12)
      }
    }

    void applyCenter()
    return () => {
      cancelled = true
    }
  }, [selectedLocation, focusState, subAdmins, impactedUsers, stateBoundsRestriction])

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
                    let color = '#10B981'; // Green for hospital (glyph uses red for icon hospital)
                    let icon = 'hospital';
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

  const heatPoints = useMemo(() => {
    if (unifiedIncidents.length > 0) {
      return unifiedIncidents.map((inc) => ({
        lat: inc.lat,
        lng: inc.lng,
        weight: inc.weight,
      }))
    }

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
    return base.slice(0, 24)
  }, [showLayersPanel, unifiedIncidents, impactedUsers, responders, dynamicInfra])

  const situationalMarkers = useMemo(() => {
    if (!showLayersPanel) return []
    return unifiedIncidents.map((inc) => ({
      id: `unified-${inc.id}`,
      position: { lat: inc.lat, lng: inc.lng },
      title: inc.name,
      type: 'weather' as const,
      description: `${inc.severity} severity · ${inc.category || inc.source || 'unified event'}`,
      status: inc.severity,
    }))
  }, [showLayersPanel, unifiedIncidents])

  const mapMarkers = useMemo(
    () => (showLayersPanel ? [...markers, ...situationalMarkers] : markers),
    [showLayersPanel, markers, situationalMarkers]
  )

  const displayHeatCount =
    unifiedIncidents.length > 0 ? incidentHeatCount : heatPoints.length
  const usesUnifiedHeat = unifiedIncidents.length > 0

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm h-[700px] flex flex-col">
      <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-start gap-4 min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tighter uppercase shrink-0 pt-0.5">
            {title}
          </h2>
          <GisHeatMapHeaderPanel
            heatSwitchId={heatSwitchId}
            showHeatmap={showHeatmap}
            onShowHeatmapChange={setShowHeatmap}
            displayHeatCount={displayHeatCount}
            situationalLoading={situationalLoading}
            coverageLabel={showLayersPanel ? coverageCircle?.label : undefined}
            usesUnifiedHeat={usesUnifiedHeat}
          />
        </div>

        {!hideTabs && (
          <div className="flex bg-slate-50 p-1 rounded-2xl gap-0.5 overflow-x-auto no-scrollbar shrink-0">
            {(['Citizens', 'Responders', 'Leaders', 'Infrastructure'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-3 sm:px-6 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap",
                  activeTab === tab
                    ? "bg-white text-[#33375D] shadow-sm border border-slate-100"
                    : "text-slate-400 hover:text-slate-900"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 relative min-h-0">
        <GoogleMap
          markers={mapMarkers}
          zoom={mapZoom}
          center={mapCenter}
          heatPoints={heatPoints}
          showHeatmap={showHeatmap}
          stateBounds={stateBoundsRestriction}
          coverageCircle={showLayersPanel ? coverageCircle : null}
        />

        {isSearchingInfra && (
          <div className="absolute right-4 top-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl border border-slate-100 flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
            <Loader2 className="w-4 h-4 text-[#33375D] animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Locating Facilities...</span>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

function GisHeatMapHeaderPanel({
  heatSwitchId,
  showHeatmap,
  onShowHeatmapChange,
  displayHeatCount,
  situationalLoading,
  coverageLabel,
  usesUnifiedHeat,
}: {
  heatSwitchId: string
  showHeatmap: boolean
  onShowHeatmapChange: (v: boolean) => void
  displayHeatCount: number
  situationalLoading: boolean
  coverageLabel?: string
  usesUnifiedHeat: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 min-w-[220px] max-w-sm shadow-sm">
      <div className="mb-2 border-b border-slate-200/80 pb-2">
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={heatSwitchId}
            className="flex flex-1 cursor-pointer items-center gap-2 text-xs font-bold text-slate-700"
          >
            <span className="text-amber-500" aria-hidden>🔥</span>
            Incident Heatmap
            <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-600 border border-slate-200">
              {displayHeatCount}
            </span>
          </label>
          <Switch id={heatSwitchId} checked={showHeatmap} onCheckedChange={onShowHeatmapChange} />
        </div>
        {showHeatmap && (
          <div className="space-y-1 border-t border-slate-200/80 pt-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              {usesUnifiedHeat ? 'Severity' : 'Intensity'}
            </p>
            <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-[#33375D] via-yellow-400 via-orange-500 to-red-700" />
            <div className="flex justify-between text-[9px] font-bold text-slate-400">
              <span>Low</span>
              <span>Critical</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
