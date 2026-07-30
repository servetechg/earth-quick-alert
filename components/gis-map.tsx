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
import {
  SituationalLeafletMap,
  type CoverageCircleSpec,
  type MapPolygonSpec,
  type MapPolylineSpec,
  type MapStateBounds,
  type MapDisasterZoneCircleSpec,
} from '@/components/situational-leaflet-map'
import type { UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap'
import { cn } from '@/lib/utils'
import { getUsStateBbox, pointInUsStateBBox, inferUspsStateFromLatLng } from '@/lib/constants/us-state-bounding-boxes'
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps'
import { radiusBounds } from '@/lib/gis/geojson-map-utils'
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
  DAMS_MAP_LAYER,
  FUEL_SITES_MAP_LAYER,
  PHARMACIES_MAP_LAYER,
  POLICE_STATIONS_MAP_LAYER,
  MEALS_READY_MAP_LAYER,
  GENERATORS_MAP_LAYER,
  VOLUNTEERS_MAP_LAYER,
  RESOURCE_SITES_MAP_LAYER,
  IT_INFRASTRUCTURE_MAP_LAYER,
  ROAD_CLOSURES_MAP_LAYER,
  FINANCIAL_SITES_MAP_LAYER,
  HIFLD_NEXT_IMPLEMENTED_SECTOR_IDS,
  HIFLD_OPERATIONAL_MAP_LAYERS,
  SHELTERS_MAP_LAYER,
  criticalInfraSectorMarkerIcon,
  resolveInfrastructureClusterMode,
} from '@/lib/gis/map-layer-config'
import {
  enabledHifldOperationalLayers,
  hifldSectorsForOperationalLayers,
} from '@/lib/gis/hifld-operational-layers'
import { gisFilterLayerByResultType, gisFilterLayerById } from '@/lib/gis/gis-filter-layers'
import type { GisFilterLayerDef } from '@/lib/gis/gis-filter-layers'
import { filterDemoGisFilterPlaces, pointInPaddedBounds } from '@/lib/demo/data/demo-gis-filter-places'
import { rankPlacesForViewport } from '@/lib/gis/viewport-place-ranking'
import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch'
import { criticalSectorById } from '@/lib/gis/critical-infrastructure-sectors'
import {
  disasterZonesToMapCircles,
  zoneLabelPosition,
} from '@/lib/demo/disaster-zones-lrk'
import {
  useInfrastructurePlaces,
  useMapLayerDams,
  useMapLayerFinancialSites,
  useMapLayerFuelSites,
  useMapLayerHifldSites,
  useMapLayerPharmacies,
  useMapLayerPoliceStations,
  useMapLayerFoodDistributionCenters,
  useMapLayerGeneratorLocations,
  useMapLayerVolunteerCenters,
  useMapLayerEmergencyResourceSites,
  useMapLayerItInfrastructure,
  useMapLayerShelters,
  usePowerOutages,
  useRoadClosures,
  useSituationalMap,
  useSituationalMapMarkerEnrich,
} from '@/lib/hooks/admin-map-queries'
import {
  ODIN_OUTAGE_FILL_COLOR,
  ODIN_OUTAGE_STROKE_COLOR,
} from '@/lib/gis/odin/odin-outages-config'
import { isWeatherRadarAvailableForScope, type WeatherRadarMapScope } from '@/lib/gis/weather-radar-config'
import { useDebouncedMapBounds } from '@/lib/hooks/use-debounced-map-bounds'
import { quantizeLayerFetchBounds, isConusSizedViewport } from '@/lib/gis/layers/map-layer-bounds-utils'

type GisMapTab = 'Citizens' | 'Responders' | 'Leaders'

const ALL_GIS_TABS: GisMapTab[] = ['Citizens', 'Responders', 'Leaders']
const SUB_ADMIN_GIS_TABS: GisMapTab[] = ['Citizens', 'Responders']

/** GIS filter/layers UI + Google Places layer fetches disabled (free OSM map only). */
const GIS_MAP_FILTER_LAYERS_ENABLED = false

/** Open-source map layers (NID dams, FEMA shelters, NREL fuel, EPA chemical, FDIC financial). */
const OPEN_SOURCE_MAP_LAYERS_ENABLED = true

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

type OpenSourceLayerFetchScope = {
  stateKey?: string
  bounds?: MapStateBounds | null
} | null

function buildOpenSourceLayerFetchScope(
  layerEnabled: boolean,
  opts: {
    lockToCoverageCircle: boolean
    coverageCircle: CoverageCircleSpec | null
    stateScoped: boolean
    stateBoundsRestriction: MapStateBounds | null
    licensedStateKey: string | null
    /** When nationwide super-admin is zoomed into a state, load that full state (parity with sub-admin). */
    viewportStateKey?: string | null
    restrictToUsa: boolean
    fetchBounds: MapStateBounds | null
    scopeState?: string
    focusState?: string
  },
): OpenSourceLayerFetchScope {
  if (!layerEnabled) return null

  if (opts.lockToCoverageCircle && opts.coverageCircle) {
    const bounds = radiusBounds(
      opts.coverageCircle.center.lat,
      opts.coverageCircle.center.lng,
      opts.coverageCircle.radiusMeters * 1.08,
    )
    return { bounds }
  }

  // Sub-admin / explicit state drill-down: full state dataset.
  const stateScopedView = Boolean(opts.stateScoped || opts.stateBoundsRestriction)
  const hasStateScope = Boolean(
    opts.licensedStateKey &&
      (stateScopedView || opts.scopeState?.trim() || opts.focusState?.trim()),
  )

  if (hasStateScope && opts.licensedStateKey) {
    return { stateKey: opts.licensedStateKey }
  }

  // Nationwide city/regional zoom (e.g. Amarillo): dense geo query of the visible
  // viewport — guarantees local FEMA shelters appear (DB has them; CONUS sample does not).
  if (opts.fetchBounds && !isConusSizedViewport(opts.fetchBounds)) {
    return { bounds: opts.fetchBounds }
  }

  // Broader state overview without tight bounds: full state key.
  if (opts.viewportStateKey) {
    return { stateKey: opts.viewportStateKey }
  }

  if (opts.licensedStateKey) return { stateKey: opts.licensedStateKey }

  if (opts.restrictToUsa && opts.fetchBounds) {
    return { bounds: opts.fetchBounds }
  }

  if (opts.fetchBounds) return { bounds: opts.fetchBounds }
  return null
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
  const openSourceLayersUiActive = showLayersPanel && OPEN_SOURCE_MAP_LAYERS_ENABLED
  const interactiveMapLayersActive = openSourceLayersUiActive
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
  const [powerOutagePolygons, setPowerOutagePolygons] = useState<MapPolygonSpec[]>([])
  const [operationalAlertPolylines, setOperationalAlertPolylines] = useState<MapPolylineSpec[]>([])
  const [operationalIncidentMarkers, setOperationalIncidentMarkers] = useState<any[]>([])
  const [isLoadingRoadClosures, setIsLoadingRoadClosures] = useState(false)
  const [isLoadingPowerOutages, setIsLoadingPowerOutages] = useState(false)
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

  const infraCacheRef = React.useRef<Map<string, any>>(new Map())
  const infraScopeKeyRef = React.useRef<string>('')
  const [cacheTrigger, setCacheTrigger] = useState(0)
  const heatSwitchId = useId()

  const licensedStateHint = useMemo(() => {
    const fromProps = (focusState || scopeState || '').trim()
    if (fromProps) return fromProps
    if (apiCoverageState?.trim()) return apiCoverageState.trim()
    if (coverageMeta?.stateCode?.trim()) return coverageMeta.stateCode.trim()
    // Sub-admin only: fall back to profile/localStorage state. Never for nationwide super-admin.
    if (stateScoped) {
      return readScopedStateHint(focusState, scopeState)
    }
    return undefined
  }, [
    focusState,
    scopeState,
    apiCoverageState,
    coverageMeta?.stateCode,
    stateScoped,
  ])

  const damsStateKey = useMemo(() => {
    const hint = licensedStateHint?.trim()
    if (!hint) return null
    if (hint.length === 2) return hint.toUpperCase()
    return normalizeStateToUsps(hint)
  }, [licensedStateHint])

  const stateBoundsRestriction = useMemo(
    (): MapStateBounds | null => boundsFromStateHint(licensedStateHint),
    [licensedStateHint],
  )

  /** Super-admin nationwide (no state drill-down): USA-only data and map pan limit. */
  const restrictToUsa = unifiedMapFeed && !stateScoped && !stateBoundsRestriction

  /**
   * Nationwide super-admin zoomed into a state (e.g. Montana): load that full state
   * for shelters/CIS/etc. so density matches the Montana sub-admin dashboard.
   * Uses live viewport bounds (not React mapZoom) — zoom state often stays stale at 4.
   */
  const viewportStateKey = useMemo((): string | null => {
    if (!restrictToUsa) return null
    if (damsStateKey) return null
    if (!mapViewportBounds) return null
    const latSpan = mapViewportBounds.north - mapViewportBounds.south
    const lngSpan = mapViewportBounds.east - mapViewportBounds.west
    // Continental overview keeps nationwide sampling.
    if (latSpan > 18 || lngSpan > 35) return null
    const lat = (mapViewportBounds.south + mapViewportBounds.north) / 2
    const lng = (mapViewportBounds.west + mapViewportBounds.east) / 2
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (!pointInUsaBounds(lat, lng)) return null
    return inferUspsStateFromLatLng(lat, lng)
  }, [restrictToUsa, damsStateKey, mapViewportBounds])

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

  /** Only re-center when navigation context changes — not on situational poll refreshes. */
  const mapViewAnchorKey = useMemo(() => {
    const coverageKey =
      lockToCoverageCircle && coverageCircle
        ? `${coverageCircle.center.lat},${coverageCircle.center.lng},${coverageCircle.radiusMeters}`
        : ''
    const boundsKey = mapStateBounds
      ? `${mapStateBounds.west},${mapStateBounds.south},${mapStateBounds.east},${mapStateBounds.north}`
      : ''
    return [
      selectedLocation,
      (focusState || '').trim(),
      (scopeState || '').trim(),
      lockToCoverageCircle ? '1' : '0',
      coverageKey,
      boundsKey,
      coverageMeta?.coverageType ?? '',
      coverageMeta?.radiusMile ?? '',
    ].join('|')
  }, [
    selectedLocation,
    focusState,
    scopeState,
    lockToCoverageCircle,
    coverageCircle,
    mapStateBounds,
    coverageMeta?.coverageType,
    coverageMeta?.radiusMile,
  ])

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

  const situationalEnabled = stateScoped || showLayersPanel || unifiedMapFeed
  const situationalQuery = useSituationalMap({
    enabled: situationalEnabled,
    scopeState,
  })
  const markerEnrichQuery = useSituationalMapMarkerEnrich({
    enabled: situationalEnabled && situationalQuery.isSuccess,
    scopeState,
  })

  useEffect(() => {
    setSituationalLoading(situationalQuery.isFetching || markerEnrichQuery.isFetching)
    if (situationalQuery.isSuccess && (unifiedMapFeed || stateScoped)) {
      setIsLoading(false)
    }
  }, [
    situationalQuery.isFetching,
    situationalQuery.isSuccess,
    markerEnrichQuery.isFetching,
    unifiedMapFeed,
    stateScoped,
  ])

  useEffect(() => {
    const data = situationalQuery.data
    if (!data || !situationalEnabled) return

    try {
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
    }
  }, [
    situationalQuery.data,
    situationalEnabled,
    showLayersPanel,
    stateScoped,
    unifiedMapFeed,
    scopeState,
    restrictToUsa,
    focusState,
  ])

  // Second pass: geocode users without stored lat/lng so Citizens/Responders/Leaders pins appear.
  useEffect(() => {
    const data = markerEnrichQuery.data
    if (!data || !situationalEnabled) return
    if (!(stateScoped || unifiedMapFeed)) return

    const usaOnly = <T extends { lat: number; lng: number }>(rows: T[] | undefined): T[] =>
      restrictToUsa
        ? (rows ?? []).filter((row) => pointInUsaBounds(row.lat, row.lng))
        : (rows ?? [])

    if (Array.isArray(data.citizens)) {
      setImpactedUsers(
        usaOnly(
          data.citizens as Array<{
            id: string
            lat: number
            lng: number
            title: string
            isSafe?: boolean
            status?: string
            location?: string
            description?: string
          }>,
        ).map((c) => ({
          id: c.id,
          position: { lat: c.lat, lng: c.lng },
          title: c.title,
          type: 'user',
          isSafe: c.isSafe,
          status: c.status,
          location: c.location,
          description: c.description,
        })),
      )
    }

    if (Array.isArray(data.responders)) {
      setResponders(
        usaOnly(
          data.responders as Array<{
            id: string
            lat: number
            lng: number
            title: string
            status?: string
            location?: string
            description?: string
            color?: string
            icon?: string
          }>,
        ).map((r) => ({
          id: r.id,
          position: { lat: r.lat, lng: r.lng },
          title: r.title,
          type: 'responder',
          status: r.status,
          location: r.location,
          description: r.description,
          color: r.color,
          icon: r.icon,
        })),
      )
    }

    if (unifiedMapFeed && Array.isArray(data.leaders)) {
      setSubAdmins(
        usaOnly(
          data.leaders as Array<{
            id: string
            lat: number
            lng: number
            title: string
            status?: string
            location?: string
            description?: string
          }>,
        ).map((l) => ({
          id: l.id,
          position: { lat: l.lat, lng: l.lng },
          title: l.title,
          type: 'admin',
          status: l.status,
          location: l.location,
          description: l.description,
        })),
      )
    }
  }, [
    markerEnrichQuery.data,
    situationalEnabled,
    stateScoped,
    unifiedMapFeed,
    restrictToUsa,
  ])

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

      // Sub-admin state license / demo: GoogleMap fitBounds owns the viewport
      if (mapStateBounds) return

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
  }, [mapViewAnchorKey])

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

  const debouncedViewportBounds = useDebouncedMapBounds(mapViewportBounds, 250)

  /** Quantized + debounced bounds for open-source layer API fetches (dams, shelters, fuel). */
  const openSourceLayerFetchBounds = useMemo((): MapStateBounds | null => {
    if (restrictToUsa && debouncedViewportBounds && !viewportCenterInUsa(debouncedViewportBounds)) {
      return null
    }
    let bounds: MapStateBounds | null = null
    if (debouncedViewportBounds) {
      bounds = quantizeLayerFetchBounds(debouncedViewportBounds, mapZoom)
    } else if (mapZoom <= 5) {
      bounds = CONUS_MAP_BOUNDS
    } else {
      return null
    }
    return clampFetchBounds(bounds)
  }, [debouncedViewportBounds, mapZoom, clampFetchBounds, restrictToUsa])

  const markerInLayerViewport = useCallback(
    (lat: number, lng: number) => {
      if (!mapViewportBounds) return true
      return pointInPaddedBounds(lat, lng, mapViewportBounds, 0.25)
    },
    [mapViewportBounds],
  )

  const infraPlacesQuery = useInfrastructurePlaces({
    enabled:
      GIS_MAP_FILTER_LAYERS_ENABLED &&
      !isDemoSimulation &&
      enabledGisFilterLayerIds.length > 0 &&
      Boolean(infraFetchBounds) &&
      viewportInUsa,
    layers: enabledGisFilterLayerIds,
    bounds: infraFetchBounds,
    scopeState: scopeState?.trim() || undefined,
  })

  /** Super-admin: viewport bbox across USA. Sub-admin / scoped state: full state. Sub-admin radius: circle bounds. */
  const { dams: damsFetchScope, shelters: sheltersFetchScope, fuel_sites: fuelSitesFetchScope, pharmacies: pharmaciesFetchScope, police: policeFetchScope, meals_ready: mealsReadyFetchScope, generators: generatorsFetchScope, volunteers: volunteersFetchScope, resources: resourceSitesFetchScope, ci_it: itInfrastructureFetchScope, ci_financial: financialSitesFetchScope, roads: roadsFetchScope, power: powerFetchScope } =
    useMemo(() => {
      const ctx = {
        lockToCoverageCircle,
        coverageCircle,
        stateScoped,
        stateBoundsRestriction,
        licensedStateKey: damsStateKey,
        viewportStateKey,
        restrictToUsa,
        fetchBounds: openSourceLayerFetchBounds,
        scopeState,
        focusState,
      }
      return {
        dams: buildOpenSourceLayerFetchScope(
          showCriticalInfraLayers && mapLayers.ci_dams,
          ctx,
        ),
        shelters: buildOpenSourceLayerFetchScope(mapLayers.shelters, ctx),
        fuel_sites: buildOpenSourceLayerFetchScope(mapLayers.fuel_sites, ctx),
        roads: buildOpenSourceLayerFetchScope(mapLayers.roads, ctx),
        power: buildOpenSourceLayerFetchScope(mapLayers.power, ctx),
        pharmacies: buildOpenSourceLayerFetchScope(mapLayers.pharmacies, ctx),
        police: buildOpenSourceLayerFetchScope(mapLayers.police, ctx),
        meals_ready: buildOpenSourceLayerFetchScope(mapLayers.meals_ready, ctx),
        generators: buildOpenSourceLayerFetchScope(mapLayers.generators, ctx),
        volunteers: buildOpenSourceLayerFetchScope(mapLayers.volunteers, ctx),
        resources: buildOpenSourceLayerFetchScope(mapLayers.resources, ctx),
        ci_it: buildOpenSourceLayerFetchScope(mapLayers.ci_it, ctx),
        ci_financial: buildOpenSourceLayerFetchScope(mapLayers.ci_financial, ctx),
      }
    }, [
      showCriticalInfraLayers,
      mapLayers.ci_dams,
      mapLayers.shelters,
      mapLayers.fuel_sites,
      mapLayers.roads,
      mapLayers.power,
      mapLayers.pharmacies,
      mapLayers.police,
      mapLayers.meals_ready,
      mapLayers.generators,
      mapLayers.volunteers,
      mapLayers.resources,
      mapLayers.ci_it,
      mapLayers.ci_financial,
      lockToCoverageCircle,
      coverageCircle,
      damsStateKey,
      viewportStateKey,
      stateScoped,
      stateBoundsRestriction,
      restrictToUsa,
      openSourceLayerFetchBounds,
      scopeState,
      focusState,
    ])

  const roadClosuresQuery = useRoadClosures({
    enabled:
      Boolean(roadsFetchScope) &&
      mapLayers.roads &&
      viewportInUsa,
    bounds: roadsFetchScope?.stateKey ? null : roadsFetchScope?.bounds ?? null,
    scopeState: roadsFetchScope?.stateKey ?? (scopeState?.trim() || undefined),
  })

  const powerOutagesQuery = usePowerOutages({
    enabled: Boolean(powerFetchScope) && mapLayers.power && viewportInUsa,
    bounds: powerFetchScope?.stateKey ? null : powerFetchScope?.bounds ?? null,
    scopeState: powerFetchScope?.stateKey ?? (scopeState?.trim() || undefined),
  })

  const damsLayerQuery = useMapLayerDams({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(damsFetchScope) &&
      viewportInUsa,
    stateKey: damsFetchScope?.stateKey ?? null,
    bounds: damsFetchScope?.stateKey ? null : damsFetchScope?.bounds ?? null,
  })

  const sheltersLayerQuery = useMapLayerShelters({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(sheltersFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: sheltersFetchScope?.stateKey ?? null,
    bounds: sheltersFetchScope?.stateKey ? null : sheltersFetchScope?.bounds ?? null,
  })

  const fuelSitesLayerQuery = useMapLayerFuelSites({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(fuelSitesFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: fuelSitesFetchScope?.stateKey ?? null,
    bounds: fuelSitesFetchScope?.stateKey ? null : fuelSitesFetchScope?.bounds ?? null,
  })

  const pharmaciesLayerQuery = useMapLayerPharmacies({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(pharmaciesFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: pharmaciesFetchScope?.stateKey ?? null,
    bounds: pharmaciesFetchScope?.stateKey ? null : pharmaciesFetchScope?.bounds ?? null,
  })

  const policeStationsLayerQuery = useMapLayerPoliceStations({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(policeFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: policeFetchScope?.stateKey ?? null,
    bounds: policeFetchScope?.stateKey ? null : policeFetchScope?.bounds ?? null,
  })

  const mealsReadyLayerQuery = useMapLayerFoodDistributionCenters({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(mealsReadyFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: mealsReadyFetchScope?.stateKey ?? null,
    bounds: mealsReadyFetchScope?.stateKey ? null : mealsReadyFetchScope?.bounds ?? null,
  })

  const generatorsLayerQuery = useMapLayerGeneratorLocations({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(generatorsFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: generatorsFetchScope?.stateKey ?? null,
    bounds: generatorsFetchScope?.stateKey ? null : generatorsFetchScope?.bounds ?? null,
  })

  const volunteersLayerQuery = useMapLayerVolunteerCenters({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(volunteersFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: volunteersFetchScope?.stateKey ?? null,
    bounds: volunteersFetchScope?.stateKey ? null : volunteersFetchScope?.bounds ?? null,
  })

  const resourceSitesLayerQuery = useMapLayerEmergencyResourceSites({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(resourceSitesFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: resourceSitesFetchScope?.stateKey ?? null,
    bounds: resourceSitesFetchScope?.stateKey ? null : resourceSitesFetchScope?.bounds ?? null,
  })

  const itInfrastructureLayerQuery = useMapLayerItInfrastructure({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(itInfrastructureFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: itInfrastructureFetchScope?.stateKey ?? null,
    bounds: itInfrastructureFetchScope?.stateKey ? null : itInfrastructureFetchScope?.bounds ?? null,
  })

  const financialSitesLayerQuery = useMapLayerFinancialSites({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      Boolean(financialSitesFetchScope) &&
      viewportInUsa &&
      !isDemoSimulation,
    stateKey: financialSitesFetchScope?.stateKey ?? null,
    bounds: financialSitesFetchScope?.stateKey ? null : financialSitesFetchScope?.bounds ?? null,
  })

  const enabledOperationalHifldLayers = useMemo(
    () => enabledHifldOperationalLayers(mapLayers),
    [mapLayers],
  )

  const enabledHifldMongoSectors = useMemo(() => {
    if (!showCriticalInfraLayers) return [] as (typeof HIFLD_NEXT_IMPLEMENTED_SECTOR_IDS)[number][]
    return HIFLD_NEXT_IMPLEMENTED_SECTOR_IDS.filter((id) => mapLayers[id])
  }, [showCriticalInfraLayers, mapLayers])

  const hifldSectorsForQuery = useMemo(() => {
    const sectors = new Set<(typeof HIFLD_NEXT_IMPLEMENTED_SECTOR_IDS)[number]>()
    for (const sectorId of enabledHifldMongoSectors) {
      sectors.add(sectorId)
    }
    for (const sectorId of hifldSectorsForOperationalLayers(mapLayers)) {
      sectors.add(sectorId)
    }
    return [...sectors]
  }, [enabledHifldMongoSectors, mapLayers])

  const hifldSitesFetchScope = useMemo(() => {
    if (hifldSectorsForQuery.length === 0) return null
    const ctx = {
      lockToCoverageCircle,
      coverageCircle,
      stateScoped,
      stateBoundsRestriction,
      licensedStateKey: damsStateKey,
      viewportStateKey,
      restrictToUsa,
      fetchBounds: openSourceLayerFetchBounds,
      scopeState,
      focusState,
    }
    return buildOpenSourceLayerFetchScope(true, ctx)
  }, [
    hifldSectorsForQuery.length,
    lockToCoverageCircle,
    coverageCircle,
    damsStateKey,
    viewportStateKey,
    stateScoped,
    stateBoundsRestriction,
    restrictToUsa,
    openSourceLayerFetchBounds,
    scopeState,
    focusState,
  ])

  const hifldSitesLayerQuery = useMapLayerHifldSites({
    enabled:
      OPEN_SOURCE_MAP_LAYERS_ENABLED &&
      hifldSectorsForQuery.length > 0 &&
      Boolean(hifldSitesFetchScope) &&
      viewportInUsa,
    sectors: hifldSectorsForQuery,
    stateKey: hifldSitesFetchScope?.stateKey ?? null,
    bounds: hifldSitesFetchScope?.stateKey ? null : hifldSitesFetchScope?.bounds ?? null,
  })

  const infraFetchScopeKey = useMemo(() => {
    if (infraFetchBounds) {
      const b = infraFetchBounds
      return `viewport:${b.west.toFixed(2)},${b.south.toFixed(2)},${b.east.toFixed(2)},${b.north.toFixed(2)}|${infraTypesKey}`
    }
    return `pending|${infraTypesKey}`
  }, [infraTypesKey, infraFetchBounds])

  const handleMapBoundsChange = useCallback((bounds: MapStateBounds, zoom?: number) => {
    if (typeof zoom === 'number' && Number.isFinite(zoom)) {
      setMapZoom((prev) => (Math.abs(prev - zoom) < 0.05 ? prev : zoom))
    }
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
            phone: place.phone || undefined,
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

  // Infrastructure layers — TanStack Query + backend Redis/Mongo cache
  useEffect(() => {
    if (!viewportInUsa && restrictToUsa) {
      infraCacheRef.current.clear()
      setCacheTrigger((t) => t + 1)
    }
  }, [viewportInUsa, restrictToUsa])

  useEffect(() => {
    if (infraTypesKeyRef.current !== infraTypesKey) {
      infraCacheRef.current.clear()
      infraTypesKeyRef.current = infraTypesKey
    }
    infraScopeKeyRef.current = infraFetchScopeKey
  }, [infraTypesKey, infraFetchScopeKey])

  useEffect(() => {
    if (!isDemoSimulation) return
    if (enabledGisFilterLayerIds.length === 0 || !infraFetchBounds || !viewportInUsa) return

    const layerDefs = enabledGisFilterLayerIds
      .map((id) => gisFilterLayerById(id))
      .filter((layer): layer is GisFilterLayerDef => Boolean(layer))
    const results = filterDemoGisFilterPlaces(layerDefs, {
      stateCode: coverageMeta?.stateCode ?? licensedStateHint ?? 'AR',
    })
    applyDemoInfraToCache(results, { skipCoverageFilter: true })
  }, [
    isDemoSimulation,
    enabledGisFilterLayerIds,
    infraFetchBounds,
    viewportInUsa,
    applyDemoInfraToCache,
    coverageMeta?.stateCode,
    licensedStateHint,
  ])

  useEffect(() => {
    if (isDemoSimulation) return
    if (!infraPlacesQuery.data) return
    applyDemoInfraToCache(infraPlacesQuery.data)
  }, [isDemoSimulation, infraPlacesQuery.data, applyDemoInfraToCache])

  useEffect(() => {
    if (isDemoSimulation) {
      setIsSearchingInfra(false)
      return
    }
    setIsSearchingInfra(infraPlacesQuery.isFetching)
  }, [isDemoSimulation, infraPlacesQuery.isFetching])

  useEffect(() => {
    if (!mapLayers.roads || !viewportInUsa) {
      setRoadClosurePolylines([])
      return
    }

    const closures = roadClosuresQuery.data?.closures ?? []
    const polylines: MapPolylineSpec[] = []
    for (const raw of closures) {
      const path = Array.isArray(raw.path)
        ? raw.path.filter(
            (p: { lat?: number; lng?: number }) =>
              Number.isFinite(p.lat) && Number.isFinite(p.lng),
          )
        : []
      if (path.length < 2) continue
      if (
        restrictToUsa &&
        !path.some((p: { lat?: number; lng?: number }) =>
          inUsaView(p.lat as number, p.lng as number),
        )
      ) {
        continue
      }
      if (
        mapViewportBounds &&
        !path.some((p: { lat?: number; lng?: number }) =>
          markerInLayerViewport(p.lat as number, p.lng as number),
        )
      ) {
        continue
      }

      const status = String(raw.status ?? 'Unknown')
      const strokeColor =
        status === 'Closed' ? '#DC2626' : status === 'Restricted' ? '#F59E0B' : '#EAB308'

      // Single dashed polyline (road-followed path). No thick solid shadow —
      // that made sparse 2-point chords look worse.
      polylines.push({
        id: String(raw.id),
        path,
        strokeColor,
        strokeWeight: 6,
        strokeOpacity: 0.95,
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

    setRoadClosurePolylines(polylines)
  }, [
    mapLayers.roads,
    roadClosuresQuery.data,
    restrictToUsa,
    inUsaView,
    viewportInUsa,
    mapViewportBounds,
    markerInLayerViewport,
  ])

  useEffect(() => {
    setIsLoadingRoadClosures(roadClosuresQuery.isFetching)
  }, [roadClosuresQuery.isFetching])

  useEffect(() => {
    if (!mapLayers.power || !viewportInUsa) {
      setPowerOutagePolygons([])
      return
    }

    const outages = powerOutagesQuery.data ?? []
    const polygons: MapPolygonSpec[] = []

    for (const outage of outages) {
      const paths = (outage.paths ?? []).filter((path) => path.length >= 3)
      if (paths.length === 0) continue
      if (lockToCoverageCircle && !markerInCoverage(outage.centroid)) continue
      if (
        mapViewportBounds &&
        !markerInLayerViewport(outage.centroid.lat, outage.centroid.lng)
      ) {
        continue
      }

      polygons.push({
        id: outage.id,
        paths,
        fillColor: ODIN_OUTAGE_FILL_COLOR,
        fillOpacity: 0.35,
        strokeColor: ODIN_OUTAGE_STROKE_COLOR,
        strokeWeight: 2,
        label: outage.name,
        outage: {
          name: outage.name,
          county: outage.county,
          state: outage.state,
          metersAffected: outage.metersAffected,
          reportedStartTime: outage.reportedStartTime,
          estimatedRestorationTime: outage.estimatedRestorationTime,
          cause: outage.cause,
          statusKind: outage.statusKind,
          communityDescriptor: outage.communityDescriptor,
          source: outage.source,
        },
      })
    }

    setPowerOutagePolygons(polygons)
  }, [
    mapLayers.power,
    powerOutagesQuery.data,
    viewportInUsa,
    mapViewportBounds,
    markerInLayerViewport,
    lockToCoverageCircle,
    markerInCoverage,
  ])

  useEffect(() => {
    setIsLoadingPowerOutages(powerOutagesQuery.isFetching)
  }, [powerOutagesQuery.isFetching])

  const operationalAlertLayersKey = useMemo(() => {
    const keys = ['flood'].filter((id) => mapLayers[id])
    return keys.join(',')
  }, [mapLayers.flood])

  const operationalIncidentLayersKey = useMemo(() => {
    const keys = ['water'].filter((id) => mapLayers[id])
    return keys.sort().join(',')
  }, [mapLayers.water])

  useEffect(() => {
    let cancelled = false

    if (!operationalAlertLayersKey || !viewportInUsa) {
      setOperationalAlertPolylines([])
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
              category: 'Water Issues',
              status: inc.status,
              location: inc.location,
              description: inc.description,
              color: '#0EA5E9',
              icon: 'water_crew',
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
    () => {
      const visibleRoadClosures = mapLayers.roads ? roadClosurePolylines : []
      return viewportInUsa
        ? [...tornadoPolylines, ...visibleRoadClosures, ...operationalAlertPolylines]
        : [...tornadoPolylines]
    },
    [tornadoPolylines, roadClosurePolylines, operationalAlertPolylines, viewportInUsa, mapLayers.roads],
  )

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

  /** Operational incident pins (separate from heat). */
  const incidentsVisible = unifiedMapFeed || stateScoped || mapLayers.incidents
  /** Incident heat — controlled by Risk Areas toggle (default on). */
  const riskHeatEnabled = mapLayers.risk

  const weatherRadarEnabled = useMemo(() => {
    if (!mapLayers.weather || !viewportInUsa) return false
    const scopedCode = normalizeStateToUsps(
      scopeState?.trim() || licensedStateHint?.trim() || '',
    )
    return isWeatherRadarAvailableForScope(scopedCode || null)
  }, [mapLayers.weather, viewportInUsa, scopeState, licensedStateHint])

  const weatherRadarScope = useMemo((): WeatherRadarMapScope | null => {
    if (!weatherRadarEnabled) return null

    if (lockToCoverageCircle && coverageCircle) {
      return {
        mode: 'radius',
        center: coverageCircle.center,
        radiusMeters: coverageCircle.radiusMeters,
        bounds: radiusBounds(
          coverageCircle.center.lat,
          coverageCircle.center.lng,
          coverageCircle.radiusMeters * 1.08,
        ),
      }
    }

    const shouldScopeState =
      stateScoped ||
      showLayersPanel ||
      coverageMeta?.coverageType === 'state' ||
      Boolean(scopeState?.trim())

    if (shouldScopeState && stateBoundsRestriction) {
      return { mode: 'state', bounds: stateBoundsRestriction }
    }

    if (shouldScopeState && mapStateBounds) {
      return { mode: 'state', bounds: mapStateBounds }
    }

    return { mode: 'free' }
  }, [
    weatherRadarEnabled,
    lockToCoverageCircle,
    coverageCircle,
    stateScoped,
    showLayersPanel,
    coverageMeta?.coverageType,
    scopeState,
    stateBoundsRestriction,
    mapStateBounds,
  ])

  const heatPoints = useMemo(() => {
    if (!showHeatmap || !riskHeatEnabled) return []
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
    riskHeatEnabled,
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
    const showFilterLayers =
      (GIS_MAP_FILTER_LAYERS_ENABLED || isDemoSimulation) && (!restrictToUsa || viewportInUsa)

    // Nationwide city/regional zoom already queried by viewport — show all returned pins.
    // Exception: sub-admin license radius — fetch uses a square bbox around the circle, so
    // we must still clip to the circle (otherwise Missoula/Cody etc. leak outside the ring).
    const regionalBoundsFetch =
      Boolean(openSourceLayerFetchBounds) &&
      !isConusSizedViewport(openSourceLayerFetchBounds)
    const skipCoverageFilter =
      restrictToUsa &&
      !stateBoundsRestriction &&
      !lockToCoverageCircle &&
      !viewportStateKey &&
      !regionalBoundsFetch
    const trustViewportLayerMarkers = regionalBoundsFetch && !lockToCoverageCircle

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

    if (showFilterLayers && operationalIncidentMarkers.length > 0) {
      enabledLayerMarkers.push(...operationalIncidentMarkers)
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.ci_dams && damsLayerQuery.data?.length) {
      const damSector = criticalSectorById('ci_dams')
      for (const dam of damsLayerQuery.data) {
        if (!inUsaView(dam.lat, dam.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: dam.lat, lng: dam.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(dam.lat, dam.lng)) continue
        const parts = [`ID: ${dam.federalId}`, `Hazard: ${dam.hazardClass}`, `Condition: ${dam.condition}`]
        if (dam.maxStorage != null) parts.push(`Max storage: ${dam.maxStorage} ac-ft`)
        if (dam.damHeight != null) parts.push(`Height: ${dam.damHeight} ft`)
        enabledLayerMarkers.push({
          id: dam.id,
          position: { lat: dam.lat, lng: dam.lng },
          title: dam.title,
          type: 'infrastructure' as const,
          category: damSector?.label ?? DAMS_MAP_LAYER.label,
          status: `${dam.hazardClass} hazard`,
          location: dam.location,
          description: parts.join(' · '),
          color: damSector?.color ?? DAMS_MAP_LAYER.color,
          icon: DAMS_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.shelters && sheltersLayerQuery.data?.length) {
      for (const shelter of sheltersLayerQuery.data) {
        if (!inUsaView(shelter.lat, shelter.lng)) continue
        // Always honor license radius / state coverage (square bbox fetch can include outside points).
        if (!markerInCoverage({ lat: shelter.lat, lng: shelter.lng })) continue
        if (trustViewportLayerMarkers || skipCoverageFilter) {
          if (!markerInLayerViewport(shelter.lat, shelter.lng)) continue
        }
        const parts = [
          `Status: ${shelter.status}`,
          `Usage: ${shelter.facilityUsage}`,
        ]
        if (shelter.evacuationCapacity != null) {
          parts.push(`Evac capacity: ${shelter.evacuationCapacity}`)
        }
        if (shelter.postImpactCapacity != null) {
          parts.push(`Post-impact capacity: ${shelter.postImpactCapacity}`)
        }
        if (shelter.wheelchairAccessible && shelter.wheelchairAccessible !== 'Unknown') {
          parts.push(`Wheelchair: ${shelter.wheelchairAccessible}`)
        }
        if (shelter.address) {
          parts.push(shelter.address)
        }
        if (shelter.organization) {
          parts.push(shelter.organization)
        }
        enabledLayerMarkers.push({
          id: shelter.id,
          position: { lat: shelter.lat, lng: shelter.lng },
          title: shelter.title,
          type: 'infrastructure' as const,
          category: SHELTERS_MAP_LAYER.label,
          status: shelter.status,
          location: shelter.location,
          phone: shelter.organizationPhone || undefined,
          description: parts.join(' · '),
          color: SHELTERS_MAP_LAYER.color,
          icon: SHELTERS_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.fuel_sites && fuelSitesLayerQuery.data?.length) {
      for (const site of fuelSitesLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts = [
          `Fuel: ${site.fuelType}`,
          `Access: ${site.access}`,
          `Status: ${site.status}`,
        ]
        if (site.accessHours) parts.push(site.accessHours)
        if (site.address) parts.push(site.address)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: FUEL_SITES_MAP_LAYER.label,
          status: site.status,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · '),
          color: FUEL_SITES_MAP_LAYER.color,
          icon: FUEL_SITES_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.pharmacies && pharmaciesLayerQuery.data?.length) {
      for (const site of pharmaciesLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts: string[] = []
        if (site.address) parts.push(site.address)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: PHARMACIES_MAP_LAYER.label,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · ') || site.location,
          color: PHARMACIES_MAP_LAYER.color,
          icon: PHARMACIES_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.police && policeStationsLayerQuery.data?.length) {
      for (const site of policeStationsLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts: string[] = []
        if (site.address) parts.push(site.address)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: POLICE_STATIONS_MAP_LAYER.label,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · ') || site.location,
          color: POLICE_STATIONS_MAP_LAYER.color,
          icon: POLICE_STATIONS_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.meals_ready && mealsReadyLayerQuery.data?.length) {
      for (const site of mealsReadyLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts: string[] = []
        if (site.address) parts.push(site.address)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: MEALS_READY_MAP_LAYER.label,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · ') || site.location,
          color: MEALS_READY_MAP_LAYER.color,
          icon: MEALS_READY_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.generators && generatorsLayerQuery.data?.length) {
      for (const site of generatorsLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts: string[] = []
        if (site.address) parts.push(site.address)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: GENERATORS_MAP_LAYER.label,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · ') || site.location,
          color: GENERATORS_MAP_LAYER.color,
          icon: GENERATORS_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.volunteers && volunteersLayerQuery.data?.length) {
      for (const site of volunteersLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts: string[] = []
        if (site.address) parts.push(site.address)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: VOLUNTEERS_MAP_LAYER.label,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · ') || site.location,
          color: VOLUNTEERS_MAP_LAYER.color,
          icon: VOLUNTEERS_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.resources && resourceSitesLayerQuery.data?.length) {
      for (const site of resourceSitesLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts: string[] = []
        if (site.address) parts.push(site.address)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: RESOURCE_SITES_MAP_LAYER.label,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · ') || site.location,
          color: RESOURCE_SITES_MAP_LAYER.color,
          icon: RESOURCE_SITES_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.ci_it && itInfrastructureLayerQuery.data?.length) {
      for (const site of itInfrastructureLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts: string[] = []
        if (site.address) parts.push(site.address)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: IT_INFRASTRUCTURE_MAP_LAYER.label,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · ') || site.location,
          color: IT_INFRASTRUCTURE_MAP_LAYER.color,
          icon: IT_INFRASTRUCTURE_MAP_LAYER.markerIcon,
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.ci_financial && financialSitesLayerQuery.data?.length) {
      for (const site of financialSitesLayerQuery.data) {
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        const parts = [`FDIC ID: ${site.locationId}`]
        if (site.address) parts.push(site.address)
        if (site.zip) parts.push(site.zip)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: FINANCIAL_SITES_MAP_LAYER.label,
          status: 'Bank Branch',
          location: site.location,
          description: parts.join(' · '),
          color: FINANCIAL_SITES_MAP_LAYER.color,
          icon: FINANCIAL_SITES_MAP_LAYER.markerIcon,
        })
      }
    }

    const renderedHifldSiteIds = new Set<string>()

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && enabledOperationalHifldLayers.length > 0 && hifldSitesLayerQuery.data?.length) {
      for (const layerDef of enabledOperationalHifldLayers) {
        const datasetSet = new Set(layerDef.datasetSlugs)
        for (const site of hifldSitesLayerQuery.data) {
          if (site.sectorId !== layerDef.sectorId) continue
          if (site.datasetSlug && !datasetSet.has(site.datasetSlug)) continue
          if (!inUsaView(site.lat, site.lng)) continue
          if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
          if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
          if (renderedHifldSiteIds.has(site.id)) continue
          renderedHifldSiteIds.add(site.id)
          const parts = [site.status]
          if (site.address) parts.push(site.address)
          if (site.city) parts.push(site.city)
          if (site.zip) parts.push(site.zip)
          enabledLayerMarkers.push({
            id: site.id,
            position: { lat: site.lat, lng: site.lng },
            title: site.title,
            type: 'infrastructure' as const,
            category: layerDef.label,
            status: site.status,
            location: site.location,
            phone: site.phone || undefined,
            description: parts.join(' · '),
            color: layerDef.color,
            icon: layerDef.markerIcon,
          })
        }
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && hifldSitesLayerQuery.data?.length) {
      for (const site of hifldSitesLayerQuery.data) {
        if (!showCriticalInfraLayers || !mapLayers[site.sectorId]) continue
        if (renderedHifldSiteIds.has(site.id)) continue
        if (!inUsaView(site.lat, site.lng)) continue
        if (!skipCoverageFilter && !markerInCoverage({ lat: site.lat, lng: site.lng })) continue
        if (skipCoverageFilter && !markerInLayerViewport(site.lat, site.lng)) continue
        renderedHifldSiteIds.add(site.id)
        const sectorDef = criticalSectorById(site.sectorId)
        const markerIcon = criticalInfraSectorMarkerIcon(site.sectorId)
        const parts = [site.status]
        if (site.address) parts.push(site.address)
        if (site.city) parts.push(site.city)
        if (site.zip) parts.push(site.zip)
        enabledLayerMarkers.push({
          id: site.id,
          position: { lat: site.lat, lng: site.lng },
          title: site.title,
          type: 'infrastructure' as const,
          category: sectorDef?.label ?? site.sectorId,
          status: site.status,
          location: site.location,
          phone: site.phone || undefined,
          description: parts.join(' · '),
          color: sectorDef?.color ?? '#6366F1',
          ...(markerIcon ? { icon: markerIcon } : { glyph: sectorDef?.markerGlyph }),
        })
      }
    }

    if (OPEN_SOURCE_MAP_LAYERS_ENABLED && mapLayers.roads && roadClosuresQuery.data?.closures?.length) {
      for (const closure of roadClosuresQuery.data.closures) {
        const path = Array.isArray(closure.path)
          ? closure.path.filter(
              (p: { lat?: number; lng?: number }) =>
                Number.isFinite(p.lat) && Number.isFinite(p.lng),
            )
          : []
        if (path.length < 2) continue
        const ends = [path[0]!, path[path.length - 1]!]
        const uniqueEnds =
          ends[0].lat === ends[1].lat && ends[0].lng === ends[1].lng
            ? [ends[0]]
            : ends
        let endIdx = 0
        for (const pt of uniqueEnds) {
          if (!inUsaView(pt.lat, pt.lng)) continue
          if (!skipCoverageFilter && !markerInCoverage({ lat: pt.lat, lng: pt.lng })) continue
          if (skipCoverageFilter && !markerInLayerViewport(pt.lat, pt.lng)) continue
          const parts = [closure.status]
          if (closure.reason) parts.push(closure.reason)
          if (closure.source) parts.push(`Source: ${closure.source}`)
          enabledLayerMarkers.push({
            id: `road-closure-marker-${closure.id}-${endIdx}`,
            position: { lat: pt.lat, lng: pt.lng },
            title: closure.roadName,
            type: 'infrastructure' as const,
            category: ROAD_CLOSURES_MAP_LAYER.label,
            status: closure.status,
            location: closure.startLocation ?? closure.roadName,
            description: parts.join(' · '),
            color: ROAD_CLOSURES_MAP_LAYER.color,
            icon: ROAD_CLOSURES_MAP_LAYER.markerIcon,
          })
          endIdx += 1
        }
      }
    }

    return [...activeTabMarkers, ...enabledLayerMarkers]
  }, [
    markers,
    mapLayers,
    situationalMarkers,
    cacheTrigger,
    markerInCoverage,
    unifiedIncidents,
    incidentsVisible,
    viewportRankBounds,
    operationalIncidentMarkers,
    restrictToUsa,
    viewportInUsa,
    inUsaView,
    isDemoSimulation,
    damsLayerQuery.data,
    sheltersLayerQuery.data,
    fuelSitesLayerQuery.data,
    pharmaciesLayerQuery.data,
    policeStationsLayerQuery.data,
    mealsReadyLayerQuery.data,
    generatorsLayerQuery.data,
    volunteersLayerQuery.data,
    resourceSitesLayerQuery.data,
    itInfrastructureLayerQuery.data,
    financialSitesLayerQuery.data,
    hifldSitesLayerQuery.data,
    enabledOperationalHifldLayers,
    showCriticalInfraLayers,
    markerInLayerViewport,
    roadClosuresQuery.data,
    viewportStateKey,
    stateBoundsRestriction,
    lockToCoverageCircle,
    openSourceLayerFetchBounds,
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

  /** Compact badge under Map/Satellite — only when a checked filter layer is fetching. */
  const mapLayersLoading = useMemo(() => {
    if (GIS_MAP_FILTER_LAYERS_ENABLED && isSearchingInfra) return true
    if (mapLayers.roads && isLoadingRoadClosures) return true
    if (mapLayers.power && isLoadingPowerOutages) return true
    if (!OPEN_SOURCE_MAP_LAYERS_ENABLED) return false

    return (
      (mapLayers.ci_dams && damsLayerQuery.isFetching) ||
      (mapLayers.shelters && sheltersLayerQuery.isFetching) ||
      (mapLayers.fuel_sites && fuelSitesLayerQuery.isFetching) ||
      (mapLayers.pharmacies && pharmaciesLayerQuery.isFetching) ||
      (mapLayers.police && policeStationsLayerQuery.isFetching) ||
      (mapLayers.meals_ready && mealsReadyLayerQuery.isFetching) ||
      (mapLayers.generators && generatorsLayerQuery.isFetching) ||
      (mapLayers.volunteers && volunteersLayerQuery.isFetching) ||
      (mapLayers.resources && resourceSitesLayerQuery.isFetching) ||
      (mapLayers.ci_it && itInfrastructureLayerQuery.isFetching) ||
      (mapLayers.ci_financial && financialSitesLayerQuery.isFetching) ||
      (hifldSectorsForQuery.length > 0 && hifldSitesLayerQuery.isFetching)
    )
  }, [
    isSearchingInfra,
    isLoadingRoadClosures,
    isLoadingPowerOutages,
    mapLayers,
    hifldSectorsForQuery.length,
    damsLayerQuery.isFetching,
    sheltersLayerQuery.isFetching,
    fuelSitesLayerQuery.isFetching,
    pharmaciesLayerQuery.isFetching,
    policeStationsLayerQuery.isFetching,
    mealsReadyLayerQuery.isFetching,
    generatorsLayerQuery.isFetching,
    volunteersLayerQuery.isFetching,
    resourceSitesLayerQuery.isFetching,
    itInfrastructureLayerQuery.isFetching,
    financialSitesLayerQuery.isFetching,
    hifldSitesLayerQuery.isFetching,
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
    if (!riskHeatEnabled) return undefined
    if (unifiedIncidents.length === 0) return undefined
    if (restrictToUsa && !viewportInUsa) return []
    if (restrictToUsa) {
      return unifiedIncidents.filter((inc) => pointInUsaBounds(inc.lat, inc.lng))
    }
    return unifiedIncidents
  }, [unifiedIncidents, restrictToUsa, viewportInUsa, riskHeatEnabled])

  const displayHeatCount = useMemo(() => {
    if (!riskHeatEnabled) return 0
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

  const usesUnifiedHeat = unifiedIncidents.length > 0 && riskHeatEnabled

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
            {openSourceLayersUiActive && (
              <MapLayersDropdown
                layers={mapLayers}
                onChange={setMapLayers}
                showCriticalInfra={showCriticalInfraLayers}
                showDisasterZones={showDisasterZones}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {mapLayers.roads && roadClosuresQuery.data?.warning && (
          <div
            className="mx-1 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900"
            role="status"
          >
            <span className="font-bold">Road Closures: </span>
            {roadClosuresQuery.data.warning}
          </div>
        )}
        <div className="flex-1 relative min-h-0">
        <SituationalLeafletMap
          markers={mapMarkers}
          zoom={mapZoom}
          center={mapCenter}
          heatPoints={heatPoints}
          showHeatmap={showHeatmap && riskHeatEnabled}
          showWeatherRadar={Boolean(weatherRadarScope)}
          weatherRadarScope={weatherRadarScope}
          stateBounds={mapStateBounds}
          fitStateOnLoad={Boolean(mapStateBounds)}
          coverageCircle={showLayersPanel && coverageMeta?.coverageType !== 'state' ? coverageCircle : null}
          lockToCoverage={lockToCoverageCircle}
          polylines={combinedPolylines}
          polygons={mapLayers.power ? powerOutagePolygons : []}
          disasterZoneCircles={disasterZoneCircles}
          heatIncidents={usesUnifiedHeat ? heatIncidentsForMap : undefined}
          heatClickOnly={usesUnifiedHeat}
          onHeatIncidentSelect={isDemoSimulation ? handleHeatIncidentSelect : undefined}
          onBoundsChanged={interactiveMapLayersActive ? handleMapBoundsChange : undefined}
          clusterInfrastructure={interactiveMapLayersActive && !isDemoSimulation}
          infrastructureClusterMode={resolveInfrastructureClusterMode(mapLayers)}
          allowZoomOut={stateScoped}
          layersLoading={mapLayersLoading}
        />
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
