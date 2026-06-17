'use client'

import React, { useState, useEffect, useMemo, useId, useCallback } from 'react'
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
import { GoogleMap, type CoverageCircleSpec, type MapPolylineSpec, type MapStateBounds } from '@/components/google-map'
import type { UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap'
import { cn } from '@/lib/utils'
import { getUsStateBbox, pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes'
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps'
import { intersectBounds } from '@/lib/gis/infrastructure-search-grid'
import { CONUS_MAP_BOUNDS, clampBoundsToUsa, viewportCenterInUsa, pointInUsaBounds } from '@/lib/constants/usa-map-bounds'
import { ShieldCheck, Truck, Siren, Building2, MapPin } from 'lucide-react'
import { geocodeAddress, calculateDistance } from '@/lib/services/mock-map-service'
import { mapZoomForRadiusMiles, pointInCoverageCircle } from '@/lib/geo/license-coverage-radius'
import { Switch } from '@/components/ui/switch'

import { MapLayersDropdown } from '@/components/gis/map-layers-dropdown'
import {
  GIS_FILTER_MAP_LAYERS,
  buildDefaultMapLayerState,
  buildDemoMapLayerState,
} from '@/lib/gis/map-layer-config'
import { gisFilterLayerByResultType, gisFilterLayerById } from '@/lib/gis/gis-filter-layers'
import type { GisFilterLayerDef } from '@/lib/gis/gis-filter-layers'
import { filterDemoGisFilterPlaces, pointInPaddedBounds } from '@/lib/demo/data/demo-gis-filter-places'
import { DEMO_CRITICAL_INFRA_MARKERS } from '@/lib/demo/critical-infrastructure-markers'
import { rankPlacesForViewport } from '@/lib/gis/viewport-place-ranking'
import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch'
import { CRITICAL_INFRASTRUCTURE_SECTORS, criticalSectorById } from '@/lib/gis/critical-infrastructure-sectors'
import {
  disasterZonesToMapCircles,
  zoneLabelPosition,
} from '@/lib/demo/disaster-zones-lrk'
import type { MapDisasterZoneCircleSpec } from '@/components/google-map'

type GisMapTab = 'Citizens' | 'Responders' | 'Leaders'

const ALL_GIS_TABS: GisMapTab[] = ['Citizens', 'Responders', 'Leaders']
const SUB_ADMIN_GIS_TABS: GisMapTab[] = ['Citizens', 'Responders']

function centerOfBounds(bounds: MapStateBounds): { lat: number; lng: number } {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  }
}

function boundsFromStateHint(hint?: string | null): MapStateBounds | null {
  const trimmed = hint?.trim()
  if (!trimmed) return null
  const usps =
    trimmed.length === 2 ? trimmed.toUpperCase() : normalizeStateToUsps(trimmed)
  if (!usps) return null
  const bbox = getUsStateBbox(usps)
  if (!bbox) return null
  const [west, south, east, north] = bbox
  return { west, south, east, north }
}

function readScopedStateHint(focusState?: string, scopeState?: string): string | undefined {
  const direct = (focusState || scopeState || '').trim()
  if (direct) return direct
  if (typeof window === 'undefined') return undefined
  return localStorage.getItem('userState')?.trim() || undefined
}

function initialMapCenterForProps(focusState?: string, scopeState?: string, stateScoped?: boolean) {
  const hint =
    readScopedStateHint(focusState, scopeState) ||
    (stateScoped ? readScopedStateHint() : undefined)
  const bounds = boundsFromStateHint(hint)
  if (bounds) return centerOfBounds(bounds)
  return { lat: 37.0902, lng: -95.7129 }
}

function isHelpCitizenMarker(m: { isSafe?: boolean; status?: string }) {
  if (m.isSafe === false) return true
  const s = (m.status ?? '').toLowerCase()
  return s === 'help' || s === 'needs_assistance' || s === 'danger'
}

function markerNearPoint(
  position: { lat: number; lng: number },
  lat: number,
  lng: number,
  maxMiles = 22,
) {
  return calculateDistance(position.lat, position.lng, lat, lng) <= maxMiles
}

interface GISMapProps {
  selectedLocation?: string
  /** When set, map can center on this US state even if `selectedLocation` is `All` (e.g. sub-admin home state). */
  focusState?: string
  /** Override the panel header title. Defaults to `GIS Impact Map`. */
  title?: string
  /** Hide all entity tabs (legacy). Prefer `visibleTabs`. */
  hideTabs?: boolean
  /** Which tabs to show. Sub-admin: Citizens, Responders, Infrastructure. */
  visibleTabs?: GisMapTab[]
  /** Show the floating Map Layers panel on the left of the map. */
  showLayersPanel?: boolean
  /** Use session-scoped situational-map API for citizens/responders (sub-admin). */
  stateScoped?: boolean
  /** Super-admin optional state filter when drilling into one sub-admin territory. */
  scopeState?: string
  /** Load unified incident heat + map markers from `/api/admin/situational-map`. */
  unifiedMapFeed?: boolean
  /** CISA 16 critical infrastructure sectors in layer filter (Dashboard A + B). */
  showCriticalInfraLayers?: boolean
  /** Demo — disaster zones A/B/C layer option (both dashboards). */
  showDisasterZones?: boolean
}

export function GISMap({
  selectedLocation = 'All',
  focusState,
  title = 'GIS Impact Map',
  hideTabs = false,
  visibleTabs,
  showLayersPanel = false,
  stateScoped = false,
  scopeState,
  unifiedMapFeed = false,
  showCriticalInfraLayers = false,
  showDisasterZones = false,
}: GISMapProps) {
  const tabs = useMemo(() => {
    if (hideTabs) return [] as GisMapTab[]
    if (visibleTabs?.length) return visibleTabs
    if (stateScoped || showLayersPanel) return SUB_ADMIN_GIS_TABS
    return ALL_GIS_TABS
  }, [hideTabs, visibleTabs, stateScoped, showLayersPanel])
  const [activeEmergencies, setActiveEmergencies] = useState<any[]>([])
  const [impactedUsers, setImpactedUsers] = useState<any[]>([])
  const [responders, setResponders] = useState<any[]>([])
  const [subAdmins, setSubAdmins] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearchingInfra, setIsSearchingInfra] = useState(false)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(() =>
    initialMapCenterForProps(focusState, scopeState, stateScoped),
  )
  const [mapZoom, setMapZoom] = useState(4)
  const [activeTab, setActiveTab] = useState<GisMapTab>('Citizens')
  const [selectedDemoHeat, setSelectedDemoHeat] = useState<UnifiedEventHeatPoint | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [unifiedIncidents, setUnifiedIncidents] = useState<UnifiedEventHeatPoint[]>([])
  const [incidentHeatCount, setIncidentHeatCount] = useState(0)
  const [coverageCircle, setCoverageCircle] = useState<CoverageCircleSpec | null>(null)
  const [coverageMeta, setCoverageMeta] = useState<{
    coverageType: 'state' | 'radius'
    stateWide?: boolean
    radiusMile?: number
    stateCode?: string
  } | null>(null)
  /** Fallback when user profile `focusState` is not hydrated yet (from situational-map coverage). */
  const [apiCoverageState, setApiCoverageState] = useState<string | null>(null)
  const [mapViewportBounds, setMapViewportBounds] = useState<MapStateBounds | null>(null)
  const [tornadoPolylines, setTornadoPolylines] = useState<MapPolylineSpec[]>([])
  const [roadClosurePolylines, setRoadClosurePolylines] = useState<MapPolylineSpec[]>([])
  const [operationalAlertPolylines, setOperationalAlertPolylines] = useState<MapPolylineSpec[]>([])
  const [operationalIncidentMarkers, setOperationalIncidentMarkers] = useState<any[]>([])
  const [isLoadingRoadClosures, setIsLoadingRoadClosures] = useState(false)
  const [situationalLoading, setSituationalLoading] = useState(false)
  const [mapLayers, setMapLayers] = useState<Record<string, boolean>>(() =>
    buildDefaultMapLayerState({
      includeCriticalInfra: showCriticalInfraLayers,
      includeDisasterZones: showDisasterZones,
    }),
  )
  const [demoModeActive, setDemoModeActive] = useState(false)
  const [scenarioDemo, setScenarioDemo] = useState(false)
  const [tornadoPathPoints, setTornadoPathPoints] = useState<{ lat: number; lng: number }[]>([])
  const [criticalInfraMarkers, setCriticalInfraMarkers] = useState<any[]>([])
  const [isLoadingCriticalInfra, setIsLoadingCriticalInfra] = useState(false)

  const infraCacheRef = React.useRef<Map<string, any>>(new Map())
  const infraScopeKeyRef = React.useRef<string>('')
  const [cacheTrigger, setCacheTrigger] = useState(0)
  const heatSwitchId = useId()

  const licensedStateHint = useMemo(() => {
    const fromProps = (focusState || scopeState || '').trim()
    if (fromProps) return fromProps
    if (apiCoverageState?.trim()) return apiCoverageState.trim()
    if (coverageMeta?.stateCode?.trim()) return coverageMeta.stateCode.trim()
    if (stateScoped || showLayersPanel) {
      return readScopedStateHint(focusState, scopeState)
    }
    return undefined
  }, [
    focusState,
    scopeState,
    apiCoverageState,
    coverageMeta?.stateCode,
    stateScoped,
    showLayersPanel,
  ])

  const stateBoundsRestriction = useMemo(
    (): MapStateBounds | null => boundsFromStateHint(licensedStateHint),
    [licensedStateHint],
  )

  /** Super-admin nationwide (no state drill-down): USA-only data and map pan limit. */
  const restrictToUsa = unifiedMapFeed && !stateScoped && !stateBoundsRestriction

  const clampFetchBounds = useCallback(
    (bounds: MapStateBounds | null): MapStateBounds | null => {
      if (!bounds) return null
      if (!restrictToUsa) return bounds
      return clampBoundsToUsa(bounds)
    },
    [restrictToUsa],
  )

  /** GIS filter data only when the map center is inside the US. */
  const viewportInUsa = useMemo(() => {
    if (!restrictToUsa) return true
    if (!mapViewportBounds) return true
    return viewportCenterInUsa(mapViewportBounds)
  }, [restrictToUsa, mapViewportBounds])

  const inUsaView = useCallback(
    (lat: number, lng: number) => !restrictToUsa || pointInUsaBounds(lat, lng),
    [restrictToUsa],
  )

  const lockToCoverageCircle = useMemo(() => {
    if (!showLayersPanel || !coverageCircle) return false
    if (coverageMeta?.stateWide) return false
    if (coverageMeta?.coverageType === 'state') return false
    return true
  }, [showLayersPanel, coverageCircle, coverageMeta])

  const licensedStateMapBounds = useMemo((): MapStateBounds | null => {
    if (lockToCoverageCircle) return null
    return stateBoundsRestriction
  }, [lockToCoverageCircle, stateBoundsRestriction])

  useEffect(() => {
    if (!unifiedMapFeed && !stateScoped) return
    let cancelled = false
    fetch('/api/demo/mode', { cache: 'no-store', credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setDemoModeActive(Boolean(data.enabled))
      })
      .catch(() => {
        if (!cancelled) setDemoModeActive(false)
      })
    return () => {
      cancelled = true
    }
  }, [unifiedMapFeed, stateScoped])

  useEffect(() => {
    if (scenarioDemo || demoModeActive) {
      setShowHeatmap(true)
    }
  }, [scenarioDemo, demoModeActive])

  const markerInCoverage = useCallback(
    (position?: { lat: number; lng: number } | null) => {
      if (!position) return false

      const stateCode =
        coverageMeta?.stateCode ||
        (licensedStateHint
          ? licensedStateHint.length === 2
            ? licensedStateHint.toUpperCase()
            : normalizeStateToUsps(licensedStateHint)
          : null)

      if (coverageMeta?.coverageType === 'state' && stateCode) {
        return pointInUsStateBBox(position.lng, position.lat, stateCode)
      }

      if (!lockToCoverageCircle || !coverageCircle) return true
      return pointInCoverageCircle(
        position.lat,
        position.lng,
        coverageCircle.center,
        coverageCircle.radiusMeters,
      )
    },
    [lockToCoverageCircle, coverageCircle, coverageMeta, licensedStateHint],
  )

  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(activeTab)) {
      setActiveTab(tabs[0])
    }
  }, [tabs, activeTab])

  const isDemoSimulation = scenarioDemo || demoModeActive

  const mapStateBounds = useMemo((): MapStateBounds | null => {
    if (licensedStateMapBounds) return licensedStateMapBounds
    if (isDemoSimulation && (unifiedMapFeed || stateScoped)) {
      return boundsFromStateHint('AR')
    }
    return null
  }, [licensedStateMapBounds, isDemoSimulation, unifiedMapFeed, stateScoped])

  useEffect(() => {
    if (!mapStateBounds) return
    setMapCenter(centerOfBounds(mapStateBounds))
  }, [mapStateBounds])

  useEffect(() => {
    setSelectedDemoHeat(null)
  }, [activeTab])

  const handleHeatIncidentSelect = useCallback(
    (incident: UnifiedEventHeatPoint) => {
      if (isDemoSimulation && activeTab === 'Citizens') {
        setSelectedDemoHeat(incident)
      }
    },
    [isDemoSimulation, activeTab],
  )

  useEffect(() => {
    let cancelled = false

    async function fetchSituational() {
      if (!stateScoped && !showLayersPanel && !unifiedMapFeed) return
      setSituationalLoading(true)
      try {
        const qs = scopeState?.trim()
          ? `?scopeState=${encodeURIComponent(scopeState.trim())}`
          : ''
        const res = await fetch(`/api/admin/situational-map${qs}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setScenarioDemo(data.demo === true)
        const incidents = Array.isArray(data.incidents) ? data.incidents : []
        setUnifiedIncidents(
          restrictToUsa
            ? incidents.filter(
                (inc: { lat?: number; lng?: number }) =>
                  Number.isFinite(inc.lat) &&
                  Number.isFinite(inc.lng) &&
                  pointInUsaBounds(inc.lat as number, inc.lng as number),
              )
            : incidents,
        )
        setIncidentHeatCount(
          typeof data.alignedEventCount === 'number'
            ? data.alignedEventCount
            : typeof data.incidentCount === 'number'
              ? data.incidentCount
              : Array.isArray(data.incidents)
                ? data.incidents.length
                : 0
        )

        const usaOnly = <T extends { lat: number; lng: number }>(rows: T[] | undefined): T[] =>
          restrictToUsa
            ? (rows ?? []).filter((row) => pointInUsaBounds(row.lat, row.lng))
            : (rows ?? [])

        const mapCitizens = (
          rows: Array<{
            id: string
            lat: number
            lng: number
            title: string
            isSafe?: boolean
            status?: string
            location?: string
            description?: string
          }> | undefined,
        ) =>
          usaOnly(rows).map((c) => ({
            id: c.id,
            position: { lat: c.lat, lng: c.lng },
            title: c.title,
            type: 'user',
            isSafe: c.isSafe,
            status: c.status,
            location: c.location,
            description: c.description,
          }))

        const mapResponders = (
          rows: Array<{
            id: string
            lat: number
            lng: number
            title: string
            status?: string
            location?: string
            description?: string
            color?: string
            icon?: string
          }> | undefined,
        ) =>
          usaOnly(rows).map((r) => ({
            id: r.id,
            position: { lat: r.lat, lng: r.lng },
            title: r.title,
            type: 'responder',
            status: r.status,
            location: r.location,
            description: r.description,
            color: r.color,
            icon: r.icon,
          }))

        const mapLeaders = (
          rows: Array<{
            id: string
            lat: number
            lng: number
            title: string
            status?: string
            location?: string
            description?: string
          }> | undefined,
        ) =>
          usaOnly(rows).map((l) => ({
            id: l.id,
            position: { lat: l.lat, lng: l.lng },
            title: l.title,
            type: 'admin',
            status: l.status,
            location: l.location,
            description: l.description,
          }))

        if (stateScoped && Array.isArray(data.citizens)) {
          setImpactedUsers(mapCitizens(data.citizens))
        } else if (unifiedMapFeed && Array.isArray(data.citizens)) {
          setImpactedUsers(mapCitizens(data.citizens))
        }

        if (stateScoped && Array.isArray(data.responders)) {
          setResponders(mapResponders(data.responders))
        } else if (unifiedMapFeed && Array.isArray(data.responders)) {
          setResponders(mapResponders(data.responders))
        }

        if (unifiedMapFeed && Array.isArray(data.leaders)) {
          setSubAdmins(mapLeaders(data.leaders))
        }

        let coverageIsState = false

        if ((showLayersPanel || stateScoped) && data.coverage?.center) {
          const mile = data.coverage.radiusMile
          const isDemoStateWide = data.demo === true && data.coverage?.stateWide === true
          const isStateCoverage =
            data.coverage.coverageType === 'state' || isDemoStateWide
          coverageIsState = isStateCoverage
          if (isStateCoverage) {
            const coverageState =
              typeof data.coverage.state === 'string'
                ? data.coverage.state
                : typeof data.coverage.stateCode === 'string'
                  ? data.coverage.stateCode
                  : null
            if (coverageState?.trim()) {
              setApiCoverageState(coverageState.trim())
            }
          }
          setCoverageMeta({
            coverageType: isStateCoverage ? 'state' : 'radius',
            stateWide: isDemoStateWide,
            radiusMile: typeof mile === 'number' ? mile : undefined,
            stateCode:
              typeof data.coverage.stateCode === 'string'
                ? data.coverage.stateCode
                : focusState
                  ? normalizeStateToUsps(focusState) ?? undefined
                  : undefined,
          })
          if (isStateCoverage) {
            setCoverageCircle(null)
          } else if (data.coverage?.radiusMeters) {
            setCoverageCircle({
              center: data.coverage.center,
              radiusMeters: data.coverage.radiusMeters,
              label:
                typeof mile === 'number'
                  ? `License coverage · ${mile} mi`
                  : 'License coverage',
            })
          } else {
            setCoverageCircle(null)
          }
          if (
            Number.isFinite(data.coverage.center.lat) &&
            Number.isFinite(data.coverage.center.lng) &&
            !data.tornadoPath?.coordinates?.length
          ) {
            if (!isStateCoverage) {
              setMapCenter(data.coverage.center)
              if (typeof mile === 'number') {
                setMapZoom(mapZoomForRadiusMiles(mile))
              }
            }
          }
        } else {
          setCoverageCircle(null)
          setCoverageMeta(null)
          if (data.coverage) {
            coverageIsState =
              data.coverage.coverageType === 'state' ||
              (data.demo === true && data.coverage?.stateWide === true)
            if (coverageIsState) {
              const coverageState =
                typeof data.coverage.state === 'string'
                  ? data.coverage.state
                  : typeof data.coverage.stateCode === 'string'
                    ? data.coverage.stateCode
                    : null
              if (coverageState?.trim()) {
                setApiCoverageState(coverageState.trim())
              }
            }
          }
        }

        const tornadoPath = data.tornadoPath as
          | { type?: string; coordinates?: [number, number][] }
          | undefined
        if (tornadoPath?.coordinates && tornadoPath.coordinates.length >= 2) {
          const path = tornadoPath.coordinates.map(([lng, lat]) => ({ lat, lng }))
          setTornadoPathPoints(path)
          setTornadoPolylines([
            {
              path,
              strokeColor: '#DC2626',
              strokeWeight: 5,
              strokeOpacity: 0.92,
              label: typeof data.scenarioTitle === 'string' ? data.scenarioTitle : 'Tornado path',
            },
          ])
          // State-scoped dashboards keep the full-state viewport; only draw the path overlay.
          if (!stateScoped && !coverageIsState) {
            const lats = path.map((p) => p.lat)
            const lngs = path.map((p) => p.lng)
            setMapCenter({
              lat: (Math.min(...lats) + Math.max(...lats)) / 2,
              lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
            })
            setMapZoom(10)
          }
        } else {
          setTornadoPathPoints([])
          setTornadoPolylines([])
        }
      } catch (e) {
        console.error('Situational map feed:', e)
      } finally {
        if (!cancelled) {
          setSituationalLoading(false)
          if (unifiedMapFeed || stateScoped) setIsLoading(false)
        }
      }
    }

    void fetchSituational()
    const interval = setInterval(fetchSituational, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [showLayersPanel, stateScoped, unifiedMapFeed, scopeState, restrictToUsa, focusState])

  useEffect(() => {
    if (stateScoped || unifiedMapFeed) return

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
  }, [stateScoped, unifiedMapFeed])

  // Auto-zoom and center when selection changes (USA vs sub-admin state / metro)
  useEffect(() => {
    let cancelled = false

    async function applyCenter() {
      if (lockToCoverageCircle && coverageCircle) {
        const mile =
          coverageMeta?.radiusMile ?? coverageCircle.radiusMeters / 1609.34
        if (!cancelled) {
          setMapCenter(coverageCircle.center)
          setMapZoom(mapZoomForRadiusMiles(mile))
        }
        return
      }

      // Sub-admin state license: full state view is handled by GoogleMap fitBounds
      if (mapStateBounds) {
        const { west, south, east, north } = mapStateBounds
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
  }, [selectedLocation, focusState, subAdmins, impactedUsers, mapStateBounds, lockToCoverageCircle, coverageCircle, coverageMeta])

  const enabledGisFilterLayerIds = useMemo(() => {
    return GIS_FILTER_MAP_LAYERS.filter((layer) => mapLayers[layer.id]).map((layer) => layer.id)
  }, [mapLayers])

  const infraTypesKey = useMemo(
    () => enabledGisFilterLayerIds.sort().join(','),
    [enabledGisFilterLayerIds],
  )

  const infraFetchBounds = useMemo((): MapStateBounds | null => {
    if (restrictToUsa && mapViewportBounds && !viewportCenterInUsa(mapViewportBounds)) {
      return null
    }
    let bounds: MapStateBounds | null = null
    if (isDemoSimulation && stateBoundsRestriction) {
      bounds = stateBoundsRestriction
    } else if (mapViewportBounds) {
      bounds = mapViewportBounds
    } else if (stateBoundsRestriction) {
      bounds = stateBoundsRestriction
    } else if (mapStateBounds) {
      bounds = mapStateBounds
    } else if (mapZoom <= 7) {
      bounds = CONUS_MAP_BOUNDS
    } else {
      return null
    }
    return clampFetchBounds(bounds)
  }, [
    mapViewportBounds,
    stateBoundsRestriction,
    mapStateBounds,
    mapZoom,
    clampFetchBounds,
    restrictToUsa,
    isDemoSimulation,
  ])

  const infraFetchScopeKey = useMemo(() => {
    if (infraFetchBounds) {
      const b = infraFetchBounds
      return `viewport:${b.west.toFixed(2)},${b.south.toFixed(2)},${b.east.toFixed(2)},${b.north.toFixed(2)}|${infraTypesKey}`
    }
    return `pending|${infraTypesKey}`
  }, [infraTypesKey, infraFetchBounds])

  const handleMapBoundsChange = useCallback((bounds: MapStateBounds) => {
    setMapViewportBounds((prev) => {
      if (!prev) return bounds
      const delta =
        Math.abs(prev.west - bounds.west) +
        Math.abs(prev.east - bounds.east) +
        Math.abs(prev.south - bounds.south) +
        Math.abs(prev.north - bounds.north)
      if (delta < 0.03) return prev
      return bounds
    })
  }, [])

  const infraTypesKeyRef = React.useRef<string>('')

  const demoModeRef = React.useRef(false)
  const demoLayersInitializedRef = React.useRef(false)

  useEffect(() => {
    if (isDemoSimulation === demoModeRef.current) return
    demoModeRef.current = isDemoSimulation
    infraCacheRef.current.clear()
    infraTypesKeyRef.current = ''
    setCacheTrigger((t) => t + 1)
    if (!isDemoSimulation) {
      demoLayersInitializedRef.current = false
      setCriticalInfraMarkers([])
    }
  }, [isDemoSimulation])

  // Arkansas presentation demo — enable every infrastructure layer so each filter shows fixtures.
  useEffect(() => {
    if (!isDemoSimulation) return
    if (demoLayersInitializedRef.current) return
    demoLayersInitializedRef.current = true
    setMapLayers(
      buildDemoMapLayerState({
        includeCriticalInfra: showCriticalInfraLayers,
        includeDisasterZones: showDisasterZones,
      }),
    )
  }, [isDemoSimulation, showCriticalInfraLayers, showDisasterZones])

  const applyDemoInfraToCache = useCallback(
    (results: InfrastructurePlaceResult[], opts?: { skipCoverageFilter?: boolean }) => {
      const fetchedResultTypes = new Set(
        enabledGisFilterLayerIds
          .map((id) => gisFilterLayerById(id)?.resultType)
          .filter(Boolean) as string[],
      )
      for (const [cacheId, cached] of infraCacheRef.current.entries()) {
        if (fetchedResultTypes.has(cached.placeType)) {
          infraCacheRef.current.delete(cacheId)
        }
      }

      for (const place of results) {
        if (
          !Number.isFinite(place.lat) ||
          !Number.isFinite(place.lng) ||
          !inUsaView(place.lat, place.lng)
        ) {
          continue
        }
        const layerDef =
          gisFilterLayerByResultType(place.placeType) ??
          GIS_FILTER_MAP_LAYERS.find((l) => l.resultType === place.placeType)
        if (!layerDef) continue

        const placePos = { lat: place.lat, lng: place.lng }
        if (!opts?.skipCoverageFilter && !markerInCoverage(placePos)) continue

        if (!infraCacheRef.current.has(place.place_id)) {
          infraCacheRef.current.set(place.place_id, {
            id: place.place_id,
            position: placePos,
            title: place.name,
            type: 'infrastructure',
            placeType: place.placeType,
            category: layerDef.label,
            status: `Verified ${layerDef.label}`,
            location: place.vicinity || 'Address not available',
            color: layerDef.color,
            icon: layerDef.markerIcon ?? 'hospital',
            rating: place.rating,
            user_ratings_total: place.user_ratings_total,
          })
        }
      }
      setCacheTrigger((prev) => prev + 1)
    },
    [enabledGisFilterLayerIds, inUsaView, markerInCoverage],
  )

  // Google Places — grid search with backend cache; merge markers as the map moves
  useEffect(() => {
    let cancelled = false

    if (enabledGisFilterLayerIds.length === 0 || !infraFetchBounds || !viewportInUsa) {
      if (!viewportInUsa && restrictToUsa) {
        infraCacheRef.current.clear()
        setCacheTrigger((t) => t + 1)
      }
      return
    }

    async function fetchScopedInfra() {
      if (infraTypesKeyRef.current !== infraTypesKey) {
        infraCacheRef.current.clear()
        infraTypesKeyRef.current = infraTypesKey
      }
      infraScopeKeyRef.current = infraFetchScopeKey

      setIsSearchingInfra(true)
      try {
        if (isDemoSimulation) {
          const layerDefs = enabledGisFilterLayerIds
            .map((id) => gisFilterLayerById(id))
            .filter((layer): layer is GisFilterLayerDef => Boolean(layer))
          const results = filterDemoGisFilterPlaces(layerDefs, {
            stateCode: coverageMeta?.stateCode ?? licensedStateHint ?? 'AR',
          })
          if (!cancelled) {
            applyDemoInfraToCache(results, { skipCoverageFilter: true })
          }
          return
        }

        const body: Record<string, unknown> = {
          layers: enabledGisFilterLayerIds,
          bounds: infraFetchBounds,
        }
        if (scopeState?.trim()) {
          body.scopeState = scopeState.trim()
        }

        const res = await fetch('/api/admin/infrastructure-places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })

        if (!res.ok || cancelled) return

        const data = await res.json()
        const results = Array.isArray(data.results) ? data.results : []

        if (!cancelled) {
          applyDemoInfraToCache(results)
        }
      } catch (error) {
        console.warn('Scoped infra search error:', error)
      } finally {
        if (!cancelled) {
          setIsSearchingInfra(false)
        }
      }
    }

    const timer = window.setTimeout(() => {
      void fetchScopedInfra()
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    enabledGisFilterLayerIds,
    infraFetchScopeKey,
    infraTypesKey,
    markerInCoverage,
    infraFetchBounds,
    inUsaView,
    viewportInUsa,
    restrictToUsa,
    isDemoSimulation,
    applyDemoInfraToCache,
    coverageMeta?.stateCode,
    licensedStateHint,
  ])

  useEffect(() => {
    let cancelled = false

    if (!mapLayers.roads || !viewportInUsa) {
      if (!viewportInUsa) setRoadClosurePolylines([])
      return
    }

    async function fetchRoadClosures() {
      setIsLoadingRoadClosures(true)
      try {
        const body: Record<string, unknown> = {}
        if (scopeState?.trim()) {
          body.scopeState = scopeState.trim()
        }
        const bounds = clampFetchBounds(
          mapViewportBounds ?? stateBoundsRestriction ?? mapStateBounds ?? null,
        )
        if (bounds) {
          body.bounds = bounds
        }

        const res = await fetch('/api/admin/road-closures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })

        if (!res.ok || cancelled) return

        const data = await res.json()
        const closures = Array.isArray(data.closures) ? data.closures : []

        const polylines: MapPolylineSpec[] = []
        for (const raw of closures) {
          const path = Array.isArray(raw.path)
            ? raw.path.filter(
                (p: { lat?: number; lng?: number }) =>
                  Number.isFinite(p.lat) && Number.isFinite(p.lng),
              )
            : []
          if (path.length < 2) continue
          if (restrictToUsa && !path.some((p: { lat?: number; lng?: number }) => inUsaView(p.lat as number, p.lng as number))) {
            continue
          }

          const status = String(raw.status ?? 'Unknown')
          const strokeColor =
            status === 'Closed'
              ? '#DC2626'
              : status === 'Restricted'
                ? '#F59E0B'
                : '#EAB308'

          polylines.push({
            id: `closure-shadow-${String(raw.id)}`,
            path,
            strokeColor: '#7F1D1D',
            strokeWeight: 11,
            strokeOpacity: 0.35,
            kind: 'road_closure',
          })
          polylines.push({
            id: String(raw.id),
            path,
            strokeColor,
            strokeWeight: 7,
            strokeOpacity: 0.92,
            kind: 'road_closure',
            label: String(raw.roadName ?? 'Road closure'),
            closure: {
              roadName: String(raw.roadName ?? 'Road closure'),
              status,
              reason: raw.reason ? String(raw.reason) : undefined,
              startLocation: raw.startLocation ? String(raw.startLocation) : undefined,
              endLocation: raw.endLocation ? String(raw.endLocation) : undefined,
              updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
              source: raw.source ? String(raw.source) : undefined,
            },
          })
        }

        if (!cancelled) {
          setRoadClosurePolylines(polylines)
        }
      } catch (error) {
        console.warn('Road closures fetch error:', error)
        if (!cancelled) setRoadClosurePolylines([])
      } finally {
        if (!cancelled) setIsLoadingRoadClosures(false)
      }
    }

    void fetchRoadClosures()
    const interval = window.setInterval(fetchRoadClosures, 5 * 60 * 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [
    mapLayers.roads,
    scopeState,
    mapViewportBounds,
    stateBoundsRestriction,
    mapStateBounds,
    clampFetchBounds,
    restrictToUsa,
    inUsaView,
    viewportInUsa,
  ])

  const operationalAlertLayersKey = useMemo(() => {
    const keys = ['weather', 'risk', 'flood'].filter((id) => mapLayers[id])
    return keys.sort().join(',')
  }, [mapLayers.weather, mapLayers.risk, mapLayers.flood])

  const operationalIncidentLayersKey = useMemo(() => {
    const keys = ['power', 'water'].filter((id) => mapLayers[id])
    return keys.sort().join(',')
  }, [mapLayers.power, mapLayers.water])

  useEffect(() => {
    let cancelled = false

    if (!operationalAlertLayersKey || !viewportInUsa) {
      if (!viewportInUsa) setOperationalAlertPolylines([])
      return
    }

    async function fetchOperationalAlerts() {
      try {
        const categories = operationalAlertLayersKey.split(',')
        const bounds = clampFetchBounds(
          mapViewportBounds ??
            stateBoundsRestriction ??
            mapStateBounds ??
            infraFetchBounds ??
            null,
        )
        const polylines: MapPolylineSpec[] = []

        for (const category of categories) {
          const body: Record<string, unknown> = {
            category,
            format: 'features',
          }
          if (scopeState?.trim()) body.scopeState = scopeState.trim()
          if (bounds) body.bounds = bounds

          const res = await fetch('/api/map/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          })
          if (!res.ok || cancelled) continue

          const data = await res.json()
          const alerts = Array.isArray(data.alerts) ? data.alerts : []
          const strokeColor =
            category === 'flood' ? '#A41E22' : category === 'risk' ? '#0EA5E9' : '#3B82F6'

          for (const alert of alerts) {
            const paths = Array.isArray(alert.paths) ? alert.paths : []
            for (let idx = 0; idx < paths.length; idx += 1) {
              const path = paths[idx].filter(
                (p: { lat?: number; lng?: number }) =>
                  Number.isFinite(p.lat) && Number.isFinite(p.lng),
              )
              if (path.length < 2) continue
              if (
                restrictToUsa &&
                !path.some((p: { lat?: number; lng?: number }) =>
                  inUsaView(p.lat as number, p.lng as number),
                )
              ) {
                continue
              }
              polylines.push({
                id: `alert-${String(alert.id)}-${idx}`,
                path,
                strokeColor,
                strokeWeight: 4,
                strokeOpacity: 0.75,
                kind: 'route',
                label: String(alert.headline ?? alert.event ?? 'Weather alert'),
              })
            }
          }
        }

        if (!cancelled) setOperationalAlertPolylines(polylines)
      } catch (error) {
        console.warn('Operational alerts fetch error:', error)
        if (!cancelled) setOperationalAlertPolylines([])
      }
    }

    void fetchOperationalAlerts()
    const interval = window.setInterval(fetchOperationalAlerts, 5 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [
    operationalAlertLayersKey,
    scopeState,
    mapViewportBounds,
    stateBoundsRestriction,
    mapStateBounds,
    infraFetchBounds,
    clampFetchBounds,
    restrictToUsa,
    inUsaView,
    viewportInUsa,
  ])

  useEffect(() => {
    let cancelled = false

    if (!operationalIncidentLayersKey || !viewportInUsa) {
      if (!viewportInUsa) setOperationalIncidentMarkers([])
      return
    }

    async function fetchOperationalIncidents() {
      try {
        const filters = operationalIncidentLayersKey.split(',')
        const bounds = clampFetchBounds(
          mapViewportBounds ??
            stateBoundsRestriction ??
            mapStateBounds ??
            infraFetchBounds ??
            null,
        )
        const markers: any[] = []

        for (const filter of filters) {
          const body: Record<string, unknown> = {
            filter,
            format: 'markers',
          }
          if (bounds) body.bounds = bounds

          const res = await fetch('/api/map/incidents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          })
          if (!res.ok || cancelled) continue

          const data = await res.json()
          const incidents = Array.isArray(data.incidents) ? data.incidents : []
          for (const inc of incidents) {
            if (!Number.isFinite(inc.lat) || !Number.isFinite(inc.lng)) continue
            const pos = { lat: inc.lat, lng: inc.lng }
            if (!markerInCoverage(pos)) continue
            if (!inUsaView(pos.lat, pos.lng)) continue
            markers.push({
              id: `ops-${filter}-${inc.id}`,
              position: pos,
              title: inc.title,
              type: 'incident' as const,
              category: filter === 'power' ? 'Power Outages' : 'Water Issues',
              status: inc.status,
              location: inc.location,
              description: inc.description,
              color: filter === 'power' ? '#EAB308' : '#0EA5E9',
              icon: filter === 'power' ? 'generator' : 'water_crew',
            })
          }
        }

        if (!cancelled) setOperationalIncidentMarkers(markers)
      } catch (error) {
        console.warn('Operational incidents fetch error:', error)
        if (!cancelled) setOperationalIncidentMarkers([])
      }
    }

    void fetchOperationalIncidents()
    const interval = window.setInterval(fetchOperationalIncidents, 2 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [
    operationalIncidentLayersKey,
    mapViewportBounds,
    stateBoundsRestriction,
    mapStateBounds,
    infraFetchBounds,
    markerInCoverage,
    clampFetchBounds,
    inUsaView,
    viewportInUsa,
  ])

  const combinedPolylines = useMemo(
    () =>
      viewportInUsa
        ? [...tornadoPolylines, ...roadClosurePolylines, ...operationalAlertPolylines]
        : [...tornadoPolylines],
    [tornadoPolylines, roadClosurePolylines, operationalAlertPolylines, viewportInUsa],
  )

  const enabledCriticalSectors = useMemo(() => {
    if (!showCriticalInfraLayers) return [] as string[]
    return CRITICAL_INFRASTRUCTURE_SECTORS.filter((s) => mapLayers[s.id]).map((s) => s.id)
  }, [showCriticalInfraLayers, mapLayers])

  /** Super-admin: viewport BBOX. Sub-admin radius license: lat/lng/radius circle. */
  const ciFetchScope = useMemo(() => {
    if (isDemoSimulation) {
      const ar = getUsStateBbox('AR')
      if (ar) {
        const [west, south, east, north] = ar
        return {
          mode: 'bounds' as const,
          bounds: { west, south, east, north },
          key: 'demo-ar-state',
        }
      }
    }

    if (
      lockToCoverageCircle &&
      coverageCircle &&
      coverageMeta?.coverageType === 'radius'
    ) {
      return {
        mode: 'radius' as const,
        lat: coverageCircle.center.lat,
        lng: coverageCircle.center.lng,
        radius: coverageCircle.radiusMeters,
        key: `radius:${coverageCircle.center.lat.toFixed(3)},${coverageCircle.center.lng.toFixed(3)}:${Math.round(coverageCircle.radiusMeters)}`,
      }
    }

    let bounds: MapStateBounds | null = mapViewportBounds
    if (bounds && stateBoundsRestriction) {
      bounds = intersectBounds(bounds, stateBoundsRestriction) ?? stateBoundsRestriction
    } else if (!bounds) {
      bounds = stateBoundsRestriction
    }
    if (restrictToUsa) {
      if (mapViewportBounds && !viewportCenterInUsa(mapViewportBounds)) {
        return null
      }
      if (bounds) {
        bounds = clampBoundsToUsa(bounds)
        if (!bounds) return null
      } else {
        bounds = CONUS_MAP_BOUNDS
      }
    }

    if (!bounds) return null

    return {
      mode: 'bounds' as const,
      bounds,
      key: `bbox:${bounds.west.toFixed(1)},${bounds.south.toFixed(1)},${bounds.east.toFixed(1)},${bounds.north.toFixed(1)}`,
    }
  }, [
    isDemoSimulation,
    lockToCoverageCircle,
    coverageCircle,
    coverageMeta?.coverageType,
    mapViewportBounds,
    stateBoundsRestriction,
    restrictToUsa,
  ])

  useEffect(() => {
    if (!showCriticalInfraLayers || enabledCriticalSectors.length === 0 || !ciFetchScope) {
      setCriticalInfraMarkers([])
      return
    }

    if (!viewportInUsa) {
      setCriticalInfraMarkers([])
      return
    }

    let cancelled = false
    const controller = new AbortController()

    async function fetchCriticalInfra() {
      setIsLoadingCriticalInfra(true)
      try {
        if (isDemoSimulation) {
          const markers = DEMO_CRITICAL_INFRA_MARKERS.filter((m) =>
            enabledCriticalSectors.includes(m.sectorId),
          )
          if (!cancelled) setCriticalInfraMarkers(markers)
          return
        }

        const body: Record<string, unknown> = {
          sectors: enabledCriticalSectors,
        }

        if (ciFetchScope!.mode === 'bounds') {
          body.bounds = ciFetchScope!.bounds
        } else {
          body.lat = ciFetchScope!.lat
          body.lng = ciFetchScope!.lng
          body.radius = ciFetchScope!.radius
        }

        const res = await fetch('/api/admin/critical-infrastructure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok || cancelled) return

        const data = await res.json()
        if (!cancelled && Array.isArray(data.markers)) {
          const markers = restrictToUsa
            ? data.markers.filter(
                (m: { lat?: number; lng?: number }) =>
                  Number.isFinite(m.lat) &&
                  Number.isFinite(m.lng) &&
                  inUsaView(m.lat as number, m.lng as number),
              )
            : data.markers
          setCriticalInfraMarkers(markers)
        }
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) {
          return
        }
        if (!cancelled) setCriticalInfraMarkers([])
      } finally {
        if (!cancelled) setIsLoadingCriticalInfra(false)
      }
    }

    const timer = window.setTimeout(() => {
      void fetchCriticalInfra()
    }, 800)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [showCriticalInfraLayers, enabledCriticalSectors.join(','), ciFetchScope?.key, restrictToUsa, inUsaView, viewportInUsa, isDemoSimulation])

  const markers = useMemo(() => {
    let currentFiltered: any[] = []

    switch (activeTab) {
      case 'Citizens':
        currentFiltered = impactedUsers
        if (isDemoSimulation) {
          currentFiltered = currentFiltered.filter(isHelpCitizenMarker)
          if (selectedDemoHeat) {
            currentFiltered = currentFiltered.filter((m) =>
              markerNearPoint(m.position, selectedDemoHeat.lat, selectedDemoHeat.lng, 30),
            )
          }
        }
        break
      case 'Responders':
        currentFiltered = responders
        break
      case 'Leaders':
        currentFiltered = subAdmins
        break
      default:
        currentFiltered = []
    }

    // Sub-admin: citizens/responders already scoped by situational-map API (radius/state).
    if (selectedLocation !== 'All' && !isDemoSimulation && !stateScoped) {
      currentFiltered = currentFiltered.filter(m =>
        m.subAdminName === selectedLocation ||
        m.location === selectedLocation ||
        (m.description && m.description.includes(selectedLocation)) ||
        (m.title && m.title.includes(selectedLocation))
      )
    }

    if (lockToCoverageCircle) {
      currentFiltered = currentFiltered.filter((m) => markerInCoverage(m.position))
    }

    if (restrictToUsa) {
      currentFiltered = currentFiltered.filter(
        (m) =>
          m?.position &&
          Number.isFinite(m.position.lat) &&
          Number.isFinite(m.position.lng) &&
          inUsaView(m.position.lat, m.position.lng),
      )
    }

    return currentFiltered
  }, [
    activeTab,
    impactedUsers,
    responders,
    subAdmins,
    selectedLocation,
    lockToCoverageCircle,
    markerInCoverage,
    isDemoSimulation,
    selectedDemoHeat,
    stateScoped,
    restrictToUsa,
    inUsaView,
  ])

  /** Operational dashboards always show incidents/heatmap; Filter checkbox is optional elsewhere. */
  const incidentsVisible = unifiedMapFeed || stateScoped || mapLayers.incidents

  const heatPoints = useMemo(() => {
    if (!showHeatmap || !incidentsVisible) return []
    if (restrictToUsa && !viewportInUsa) return []

    const inCoverage = (lat: number, lng: number) => {
      if (!inUsaView(lat, lng)) return false
      if (!lockToCoverageCircle || !coverageCircle) return true
      return pointInCoverageCircle(lat, lng, coverageCircle.center, coverageCircle.radiusMeters)
    }

    if (unifiedIncidents.length > 0) {
      return unifiedIncidents
        .filter((inc) => inCoverage(inc.lat, inc.lng))
        .map((inc) => ({
          lat: inc.lat,
          lng: inc.lng,
          weight: inc.weight,
        }))
    }

    const base = [...impactedUsers, ...responders]
      .filter(
        (m: any) =>
          m?.position &&
          Number.isFinite(m.position.lat) &&
          Number.isFinite(m.position.lng) &&
          inCoverage(m.position.lat, m.position.lng),
      )
      .map((m: any, i: number) => ({
        lat: m.position.lat,
        lng: m.position.lng,
        weight:
          m.type === 'incident'
            ? 0.95
            : m.isSafe === false
              ? 0.85
              : 0.45 + ((i % 4) * 0.08),
      }))
    return base.slice(0, 24)
  }, [
    showHeatmap,
    incidentsVisible,
    unifiedIncidents,
    impactedUsers,
    responders,
    lockToCoverageCircle,
    coverageCircle,
    inUsaView,
    restrictToUsa,
    viewportInUsa,
  ])

  const situationalMarkers = useMemo(() => {
    if (!incidentsVisible) return []
    return unifiedIncidents
      .filter((inc) => {
        if (!inUsaView(inc.lat, inc.lng)) return false
        if (!lockToCoverageCircle || !coverageCircle) return true
        return pointInCoverageCircle(
          inc.lat,
          inc.lng,
          coverageCircle.center,
          coverageCircle.radiusMeters,
        )
      })
      .map((inc) => ({
        id: `unified-${inc.id}`,
        position: { lat: inc.lat, lng: inc.lng },
        title: inc.name,
        type: 'weather' as const,
        description: `${inc.severity} severity · ${inc.category || inc.source || 'unified event'}`,
        status: inc.severity,
        location: inc.location,
        category: inc.category,
        incidentId: inc.id,
        riskReportHref: `/ai-risk-assessment?incident=${encodeURIComponent(inc.id)}`,
      }))
  }, [incidentsVisible, unifiedIncidents, lockToCoverageCircle, coverageCircle, inUsaView])

  const viewportRankBounds = useMemo(
    (): MapStateBounds | null => mapViewportBounds ?? infraFetchBounds,
    [mapViewportBounds, infraFetchBounds],
  )

  const mapMarkers = useMemo(() => {
    const activeTabMarkers = markers
    const enabledLayerMarkers: any[] = []
    const showFilterLayers = !restrictToUsa || viewportInUsa

    // Unified heat feed: incidents show on heatmap only (click for details), not as blue pins.
    if (showFilterLayers && incidentsVisible && unifiedIncidents.length === 0) {
      enabledLayerMarkers.push(...situationalMarkers)
    }

    // 2. Google Places sub-layers — viewport-ranked like Google Maps
    if (showFilterLayers) {
    GIS_FILTER_MAP_LAYERS.forEach((layer) => {
      if (!mapLayers[layer.id]) return

      const markersForLayer = Array.from(infraCacheRef.current.values())
        .filter((m: any) => m.placeType === layer.resultType)
        .filter((m: any) => inUsaView(m.position.lat, m.position.lng))
        .filter((m: any) => markerInCoverage(m.position))

      if (markersForLayer.length === 0) return

      if (isDemoSimulation) {
        if (!viewportRankBounds) {
          enabledLayerMarkers.push(...markersForLayer)
          return
        }
        const visible = markersForLayer.filter((m: any) =>
          pointInPaddedBounds(m.position.lat, m.position.lng, viewportRankBounds, 0.35),
        )
        enabledLayerMarkers.push(...(visible.length > 0 ? visible : markersForLayer))
        return
      }

      if (!viewportRankBounds) {
        enabledLayerMarkers.push(...markersForLayer)
        return
      }

      const asPlaces: InfrastructurePlaceResult[] = markersForLayer.map((m: any) => ({
        place_id: m.id,
        name: m.title,
        placeType: m.placeType,
        lat: m.position.lat,
        lng: m.position.lng,
        vicinity: m.location,
        rating: m.rating,
        user_ratings_total: m.user_ratings_total,
      }))
      const rankedIds = new Set(
        rankPlacesForViewport(asPlaces, viewportRankBounds).map((p) => p.place_id),
      )
      enabledLayerMarkers.push(...markersForLayer.filter((m: any) => rankedIds.has(m.id)))
    })
    }

    // 3. CISA critical infrastructure (Dashboard A + B)
    if (showFilterLayers && showCriticalInfraLayers) {
      CRITICAL_INFRASTRUCTURE_SECTORS.forEach((sector) => {
        if (mapLayers[sector.id]) {
          const sectorMarkers = criticalInfraMarkers
            .filter((m) => m.sectorId === sector.id)
            .filter((m) => inUsaView(m.lat, m.lng))
            .filter((m) => markerInCoverage({ lat: m.lat, lng: m.lng }))
            .map((m) => {
              const sector = criticalSectorById(m.sectorId)
              return {
                id: m.id,
                position: { lat: m.lat, lng: m.lng },
                title: m.title,
                type: 'infrastructure' as const,
                category: sector?.label ?? m.sectorId,
                status: m.status,
                location: m.location,
                description: m.description,
                color: sector?.color ?? '#6366F1',
                glyph: sector?.markerGlyph,
              }
            })
          enabledLayerMarkers.push(...sectorMarkers)
        }
      })
    }

    if (showFilterLayers && operationalIncidentMarkers.length > 0) {
      enabledLayerMarkers.push(...operationalIncidentMarkers)
    }

    return [...activeTabMarkers, ...enabledLayerMarkers]
  }, [
    markers,
    mapLayers,
    situationalMarkers,
    cacheTrigger,
    markerInCoverage,
    showCriticalInfraLayers,
    criticalInfraMarkers,
    unifiedIncidents,
    incidentsVisible,
    viewportRankBounds,
    operationalIncidentMarkers,
    restrictToUsa,
    viewportInUsa,
    inUsaView,
    isDemoSimulation,
  ])

  const disasterZonesVisible = useMemo(() => {
    const layerOn = mapLayers.disaster_zones || scenarioDemo
    if (!layerOn) return false
    if (scenarioDemo || demoModeActive) return true
    if (showDisasterZones && tornadoPathPoints.length >= 2) return true
    return false
  }, [
    mapLayers.disaster_zones,
    scenarioDemo,
    demoModeActive,
    showDisasterZones,
    tornadoPathPoints.length,
  ])

  const disasterZoneCircles = useMemo((): MapDisasterZoneCircleSpec[] => {
    if (!disasterZonesVisible) return []
    const path = tornadoPathPoints.length >= 2 ? tornadoPathPoints : undefined
    const zones = disasterZonesToMapCircles(path)
    return zones.map((z) => ({
      id: z.id,
      center: z.center,
      radiusMeters: z.radiusMeters,
      fillColor: z.fillColor,
      fillOpacity: z.fillOpacity,
      strokeColor: z.strokeColor,
      strokeWeight: z.strokeWeight,
      label: z.label,
      labelPosition: zoneLabelPosition(z),
    }))
  }, [disasterZonesVisible, tornadoPathPoints])

  const heatIncidentsForMap = useMemo(() => {
    if (unifiedIncidents.length === 0) return undefined
    if (restrictToUsa && !viewportInUsa) return []
    if (restrictToUsa) {
      return unifiedIncidents.filter((inc) => pointInUsaBounds(inc.lat, inc.lng))
    }
    return unifiedIncidents
  }, [unifiedIncidents, restrictToUsa, viewportInUsa])

  const displayHeatCount = useMemo(() => {
    if (restrictToUsa && !viewportInUsa) return 0
    if (unifiedIncidents.length > 0) {
      return incidentsVisible ? incidentHeatCount : 0
    }
    return heatPoints.length
  }, [
    restrictToUsa,
    viewportInUsa,
    unifiedIncidents.length,
    incidentsVisible,
    incidentHeatCount,
    heatPoints.length,
  ])

  const usesUnifiedHeat = unifiedIncidents.length > 0

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm h-[700px] flex flex-col">
      <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-start gap-8 min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tighter uppercase shrink-0 pt-0.5">
            {title}
          </h2>
          <GisHeatMapHeaderPanel
            heatSwitchId={heatSwitchId}
            showHeatmap={showHeatmap}
            onShowHeatmapChange={setShowHeatmap}
            displayHeatCount={displayHeatCount}
            situationalLoading={situationalLoading}
            coverageLabel={
              showLayersPanel
                ? coverageMeta?.coverageType === 'state'
                  ? focusState
                    ? `${focusState} statewide`
                    : 'Statewide coverage'
                  : coverageCircle?.label
                : undefined
            }
            usesUnifiedHeat={usesUnifiedHeat}
          />
        </div>

        {!hideTabs && tabs.length > 0 && (
          <div className="flex bg-slate-50 p-1 rounded-2xl gap-0.5 overflow-x-auto no-scrollbar shrink-0 items-center">
            {tabs.map((tab) => (
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
            {showLayersPanel && (
              <MapLayersDropdown
                layers={mapLayers}
                onChange={setMapLayers}
                showCriticalInfra={showCriticalInfraLayers}
                showDisasterZones={showDisasterZones}
                demoPresentation={isDemoSimulation}
              />
            )}
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
          stateBounds={mapStateBounds}
          fitStateOnLoad={Boolean(mapStateBounds)}
          coverageCircle={showLayersPanel && coverageMeta?.coverageType !== 'state' ? coverageCircle : null}
          lockToCoverage={lockToCoverageCircle}
          polylines={combinedPolylines}
          disasterZoneCircles={disasterZoneCircles}
          heatIncidents={usesUnifiedHeat ? heatIncidentsForMap : undefined}
          heatClickOnly={usesUnifiedHeat}
          onHeatIncidentSelect={isDemoSimulation ? handleHeatIncidentSelect : undefined}
          onBoundsChanged={showLayersPanel ? handleMapBoundsChange : undefined}
          clusterInfrastructure={showLayersPanel && !isDemoSimulation}
          allowZoomOut={stateScoped}
        />

        {(isSearchingInfra || isLoadingCriticalInfra || isLoadingRoadClosures) && (
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
    <div className="flex rounded-2xl border border-slate-100 bg-white px-3 py-1 w-fit flex-col gap-1">
      {/* Label, Badge, and Switch Row */}
      <div className="flex items-center gap-2 shrink-0 w-fit">
        <div className="flex items-center gap-2">
        <label
          htmlFor={heatSwitchId}
          className="flex items-center gap-2 text-sm font-black text-slate-800 tracking-tight"
        >
          <span className="text-base" aria-hidden="true">🔥</span>
          Incident Heatmap
        </label>
        
        <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-black text-slate-700 border border-slate-200/60 min-w-[28px] text-center">
          {displayHeatCount}
        </span>
        </div>
        <Switch 
          id={heatSwitchId} 
          checked={showHeatmap} 
          onCheckedChange={onShowHeatmapChange} 
        />
      </div>

      {/* Inline Intensity Bar - Collapses gracefully if unchecked */}
      {showHeatmap && (
        <div className="flex items-center gap-3 flex-1 w-fit border-l border-slate-100 animate-in fade-in slide-in-from-left-2 duration-200">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">
            Low
          </span>
          
          <div className="relative min-w-[200px] flex-1 h-2 rounded-full bg-gradient-to-r from-[#2A2E4F] via-yellow-400 via-orange-500 to-red-600" />
          
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">
            Critical
          </span>
        </div>
      )}
    </div>
  )
}
