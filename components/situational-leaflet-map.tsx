'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Circle,
    Polyline,
    Polygon,
    useMap,
    useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import 'leaflet.heat';

import { IncidentDetailDialog } from '@/components/incident/incident-detail-dialog';
import type {
    CoverageCircleSpec,
    MapDisasterZoneCircleSpec,
    MapPolygonSpec,
    MapPolylineSpec,
    MapStateBounds,
    SituationalMapMarker,
    SituationalMapProps,
} from '@/lib/gis/situational-map-types';
import {
    boundsToLeafletLatLngBounds,
    coverageToMapBounds,
    DEFAULT_MAP_CENTER,
    findNearestHeatIncident,
    leafletBoundsToMapState,
    SUB_ADMIN_MIN_ZOOM,
    viewportExceedsBounds,
} from '@/lib/gis/situational-map-utils';
import { buildLeafletMarkerIcon, chemicalClusterIcon, clusterIcon, criticalInfraClusterIcon, damClusterIcon, financialClusterIcon, fuelClusterIcon, generatorClusterIcon, heatIncidentPinIcon, itClusterIcon, mealsClusterIcon, pharmacyClusterIcon, policeClusterIcon, resourceClusterIcon, roadClosureClusterIcon, roadClosedIconMarker, shelterClusterIcon, volunteerClusterIcon } from '@/lib/gis/situational-map-marker-icons';
import type { InfrastructureClusterMode } from '@/lib/gis/map-layer-config';
import type { UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap';
import {
    NEXRAD_LEAFLET_WMS_OPTIONS,
    NEXRAD_WMS,
    nexradWmsTilePixelSize,
    type WeatherRadarMapScope,
} from '@/lib/gis/weather-radar-config';
import { WeatherRadarLegend } from '@/components/weather-radar-legend';

export type {
    CoverageCircleSpec,
    MapDisasterZoneCircleSpec,
    MapPolygonSpec,
    MapPolylineSpec,
    MapStateBounds,
    SituationalMapMarker,
};

if (typeof window !== 'undefined' && !(L.Icon.Default.prototype as { _fixed?: boolean })._fixed) {
    L.Icon.Default.mergeOptions({
        iconRetinaUrl:
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
    (L.Icon.Default.prototype as { _fixed?: boolean })._fixed = true;
}

function formatMarkerStatus(status?: string, isSafe?: boolean): string {
    if (status === 'help' || status === 'needs_assistance') return 'Help';
    if (status === 'safe') return 'Safe';
    if (isSafe === false) return 'Help';
    if (isSafe === true) return 'Safe';
    return status ?? 'Unknown';
}

function isHelpStatus(status?: string, isSafe?: boolean): boolean {
    if (isSafe === false) return true;
    const s = (status ?? '').toLowerCase();
    return s === 'help' || s === 'needs_assistance' || s === 'danger';
}

function MapBoundsReporter({
    onBoundsChanged,
}: {
    onBoundsChanged?: (b: MapStateBounds, zoom?: number) => void;
}) {
    const map = useMap();
    useEffect(() => {
        if (!onBoundsChanged) return;
        const emit = () => {
            const b = map.getBounds();
            if (b) onBoundsChanged(leafletBoundsToMapState(b), map.getZoom());
        };
        emit();
        map.on('moveend', emit);
        map.on('zoomend', emit);
        return () => {
            map.off('moveend', emit);
            map.off('zoomend', emit);
        };
    }, [map, onBoundsChanged]);
    return null;
}

function MapRestrictionController({
    stateBounds,
    coverageBounds,
    fitStateOnLoad,
    allowZoomOut,
    lockToCoverage,
}: {
    stateBounds: MapStateBounds | null;
    coverageBounds: MapStateBounds | null;
    fitStateOnLoad: boolean;
    allowZoomOut: boolean;
    lockToCoverage: boolean;
}) {
    const map = useMap();
    const fittedRef = useRef({ state: false, coverage: false });

    useEffect(() => {
        fittedRef.current = { state: false, coverage: false };
    }, [
        stateBounds?.west,
        stateBounds?.south,
        stateBounds?.east,
        stateBounds?.north,
        coverageBounds?.west,
        coverageBounds?.south,
        coverageBounds?.east,
        coverageBounds?.north,
    ]);

    useEffect(() => {
        if (coverageBounds && lockToCoverage) {
            const latLngBounds = L.latLngBounds(boundsToLeafletLatLngBounds(coverageBounds));
            map.setMaxBounds(latLngBounds.pad(0.02));
            if (!fittedRef.current.coverage) {
                map.fitBounds(latLngBounds, { padding: [24, 24] });
                fittedRef.current.coverage = true;
            }
            return;
        }

        if (stateBounds) {
            const latLngBounds = L.latLngBounds(boundsToLeafletLatLngBounds(stateBounds));
            if (allowZoomOut) {
                map.setMaxBounds(undefined);
                map.setMinZoom(SUB_ADMIN_MIN_ZOOM);
                if (fitStateOnLoad && !fittedRef.current.state) {
                    map.fitBounds(latLngBounds, { padding: [40, 40] });
                    fittedRef.current.state = true;
                }
            } else {
                map.setMaxBounds(latLngBounds.pad(0.01));
                if (!fittedRef.current.state) {
                    map.fitBounds(latLngBounds, { padding: [40, 40] });
                    fittedRef.current.state = true;
                }
            }
            return;
        }

        map.setMaxBounds(undefined);
        if (allowZoomOut) map.setMinZoom(SUB_ADMIN_MIN_ZOOM);
        else map.setMinZoom(0);
    }, [map, stateBounds, coverageBounds, fitStateOnLoad, allowZoomOut, lockToCoverage]);

    useEffect(() => {
        const limit = coverageBounds ?? (allowZoomOut ? null : stateBounds);
        if (!limit) return;

        const enforce = () => {
            const current = leafletBoundsToMapState(map.getBounds());
            if (viewportExceedsBounds(current, limit)) {
                map.fitBounds(L.latLngBounds(boundsToLeafletLatLngBounds(limit)), { padding: [24, 24] });
            }
        };
        map.on('moveend', enforce);
        return () => {
            map.off('moveend', enforce);
        };
    }, [map, stateBounds, coverageBounds, allowZoomOut]);

    return null;
}

function HeatmapLayer({
    points,
    show,
}: {
    points: { lat: number; lng: number; weight?: number }[];
    show: boolean;
}) {
    const map = useMap();
    const layerRef = useRef<L.HeatLayer | null>(null);

    useEffect(() => {
        if (layerRef.current) {
            map.removeLayer(layerRef.current);
            layerRef.current = null;
        }

        if (!show || points.length === 0) return;

        const data: [number, number, number][] = points.map((p) => [
            p.lat,
            p.lng,
            Math.max(0.15, Math.min(1.2, p.weight ?? 0.6)),
        ]);

        const layer = L.heatLayer(data, {
            radius: 28,
            blur: 22,
            maxZoom: 14,
            minOpacity: 0.35,
            gradient: {
                0.0: 'rgba(59,130,246,0)',
                0.2: 'rgba(59,130,246,0.55)',
                0.45: 'rgba(250,204,21,0.7)',
                0.65: 'rgba(251,146,60,0.8)',
                0.85: 'rgba(239,68,68,0.9)',
                1.0: 'rgba(185,28,28,1)',
            },
        }) as L.HeatLayer;

        layer.addTo(map);
        layerRef.current = layer;

        return () => {
            if (layerRef.current) {
                map.removeLayer(layerRef.current);
                layerRef.current = null;
            }
        };
    }, [map, points, show]);

    return null;
}

const WEATHER_RADAR_PANE = 'weatherRadarPane';
const WEATHER_RADAR_FREE_SCOPE: WeatherRadarMapScope = { mode: 'free' };

function weatherRadarScopeKey(scope: WeatherRadarMapScope): string {
    if (scope.mode === 'free') return 'free';
    if (scope.mode === 'state') {
        const b = scope.bounds;
        return `state:${b.west},${b.south},${b.east},${b.north}`;
    }
    return `radius:${scope.center.lat},${scope.center.lng},${scope.radiusMeters}`;
}

function scopeToLeafletBounds(scope: WeatherRadarMapScope): L.LatLngBounds | undefined {
    if (scope.mode === 'free') return undefined;
    const { west, south, east, north } = scope.bounds;
    return L.latLngBounds([south, west], [north, east]);
}

/**
 * Clip the radar pane to the license radius in the pane's local pixel space.
 *
 * The weather pane lives under `.leaflet-map-pane`, which Leaflet CSS-translates
 * while panning. Using raw `latLngToContainerPoint` for `clip-path` double-counts
 * that transform and makes the radar drift outside the coverage circle after pan.
 * Subtract the map-pane offset so the clip stays locked to the same lat/lng as `L.Circle`.
 */
function applyRadiusClip(
    map: L.Map,
    pane: HTMLElement | undefined,
    scope: WeatherRadarMapScope,
) {
    if (!pane) return;
    if (scope.mode !== 'radius') {
        pane.style.clipPath = '';
        (pane.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = '';
        return;
    }

    const center = L.latLng(scope.center.lat, scope.center.lng);
    // Match Leaflet Circle: geodesic meters → screen pixels at current zoom.
    const earthCircumference = 40_075_016.686;
    const metersPerPixel =
        (earthCircumference * Math.cos((center.lat * Math.PI) / 180)) /
        Math.pow(2, map.getZoom() + 8);
    const radiusPx = Math.max(1, scope.radiusMeters / Math.max(metersPerPixel, 1e-6));

    const centerContainer = map.latLngToContainerPoint(center);
    const mapPaneEl = map.getPane('mapPane');
    const mapPanePos = mapPaneEl ? L.DomUtil.getPosition(mapPaneEl) : L.point(0, 0);
    const x = centerContainer.x - mapPanePos.x;
    const y = centerContainer.y - mapPanePos.y;

    const clip = `circle(${radiusPx}px at ${x}px ${y}px)`;
    pane.style.clipPath = clip;
    (pane.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = clip;
}

function WeatherRadarWmsLayer({
    show,
    scope = WEATHER_RADAR_FREE_SCOPE,
}: {
    show: boolean;
    scope?: WeatherRadarMapScope;
}) {
    const map = useMap();
    const layerRef = useRef<L.TileLayer.WMS | null>(null);
    const scopeKey = weatherRadarScopeKey(scope);

    useEffect(() => {
        if (layerRef.current) {
            map.removeLayer(layerRef.current);
            layerRef.current = null;
        }

        const pane = map.getPane(WEATHER_RADAR_PANE) ?? (() => {
            map.createPane(WEATHER_RADAR_PANE);
            const created = map.getPane(WEATHER_RADAR_PANE);
            if (created) {
                created.style.zIndex = '250';
                // Smooth browser downscale of higher-res WMS tiles (avoid crisp-edges/pixelated).
                created.style.setProperty('image-rendering', 'auto');
            }
            return created;
        })();

        if (!show) {
            applyRadiusClip(map, pane ?? undefined, { mode: 'free' });
            return;
        }

        const leafletBounds = scopeToLeafletBounds(scope);
        const layer = L.tileLayer.wms(NEXRAD_WMS.baseUrl, {
            ...NEXRAD_LEAFLET_WMS_OPTIONS,
            uppercase: true,
            pane: WEATHER_RADAR_PANE,
            bounds: leafletBounds,
            updateWhenIdle: false,
            updateWhenZooming: true,
        });
        // Force 2×–3× GetMap resolution for every display (same layer / bbox / colors).
        const wmsPx = nexradWmsTilePixelSize();
        layer.wmsParams.width = wmsPx;
        layer.wmsParams.height = wmsPx;
        layer.setParams({ _t: Date.now() } as unknown as L.WMSParams);
        layer.addTo(map);
        layerRef.current = layer;

        // Ensure tile <img> elements use smooth interpolation when scaled to the map.
        const applyTileSmoothing = () => {
            const imgs = pane?.querySelectorAll('img.weather-radar-tile, img.leaflet-tile');
            imgs?.forEach((img) => {
                const el = img as HTMLImageElement;
                el.style.imageRendering = 'auto';
                el.decoding = 'async';
            });
        };
        layer.on('load', applyTileSmoothing);
        applyTileSmoothing();

        const syncClip = () => applyRadiusClip(map, pane ?? undefined, scope);
        syncClip();

        const refresh = window.setInterval(() => {
            layer.setParams({ _t: Date.now() } as unknown as L.WMSParams);
            syncClip();
        }, NEXRAD_WMS.refreshIntervalMs);

        map.on('move', syncClip);
        map.on('moveend', syncClip);
        map.on('zoom', syncClip);
        map.on('zoomend', syncClip);
        map.on('resize', syncClip);
        map.on('viewreset', syncClip);

        return () => {
            window.clearInterval(refresh);
            layer.off('load', applyTileSmoothing);
            map.off('move', syncClip);
            map.off('moveend', syncClip);
            map.off('zoom', syncClip);
            map.off('zoomend', syncClip);
            map.off('resize', syncClip);
            map.off('viewreset', syncClip);
            applyRadiusClip(map, pane ?? undefined, { mode: 'free' });
            if (layerRef.current) {
                map.removeLayer(layerRef.current);
                layerRef.current = null;
            }
        };
    }, [map, show, scope, scopeKey]);

    return null;
}

function InfrastructureClusterLayer({
    markers,
    enabled,
    onSelect,
    clusterMode = 'default',
    cluster = true,
}: {
    markers: SituationalMapMarker[];
    enabled: boolean;
    onSelect: (m: SituationalMapMarker) => void;
    clusterMode?: InfrastructureClusterMode;
    /** When false, every marker shows individually (no count badges). */
    cluster?: boolean;
}) {
    const map = useMap();
    const groupRef = useRef<L.MarkerClusterGroup | null>(null);

    useEffect(() => {
        if (groupRef.current) {
            map.removeLayer(groupRef.current);
            groupRef.current = null;
        }
        if (!enabled || markers.length === 0) return;

        const isDams = clusterMode === 'dams';
        const isRoads = clusterMode === 'roads';
        const isShelters = clusterMode === 'shelters';
        const isFuel = clusterMode === 'fuel';
        const isPharmacies = clusterMode === 'pharmacies';
        const isPolice = clusterMode === 'police';
        const isMeals = clusterMode === 'meals';
        const isGenerators = clusterMode === 'generators';
        const isVolunteers = clusterMode === 'volunteers';
        const isResources = clusterMode === 'resources';
        const isIt = clusterMode === 'it';
        const isChemical = clusterMode === 'chemical';
        const isFinancial = clusterMode === 'financial';
        const isCriticalInfra = clusterMode === 'critical-infra';
        const isFacilities =
            isDams ||
            isRoads ||
            isShelters ||
            isFuel ||
            isPharmacies ||
            isPolice ||
            isMeals ||
            isGenerators ||
            isVolunteers ||
            isResources ||
            isIt ||
            isChemical ||
            isFinancial ||
            isCriticalInfra;

        const group = L.markerClusterGroup({
            showCoverageOnHover: false,
            // cluster=false → tiny radius so markers only merge when icons overlap.
            // Road closures: wide radius at national zoom so count badges stay visible
            // (e.g. Denver) instead of vanishing until the user zooms in.
            maxClusterRadius: !cluster
                ? 16
                : isRoads
                  ? 80
                  : isFacilities
                    ? 45
                    : 58,
            disableClusteringAtZoom: isRoads ? 10 : isFacilities ? 9 : 11,
            spiderfyOnMaxZoom: isFacilities || isRoads,
            chunkedLoading: true,
            iconCreateFunction: !cluster
                ? () => roadClosedIconMarker()
                : isDams
                ? (cluster) => damClusterIcon(cluster.getChildCount())
                : isRoads
                  ? (cluster) => roadClosureClusterIcon(cluster.getChildCount())
                : isShelters
                  ? (cluster) => shelterClusterIcon(cluster.getChildCount())
                  : isFuel
                    ? (cluster) => fuelClusterIcon(cluster.getChildCount())
                    : isPharmacies
                      ? (cluster) => pharmacyClusterIcon(cluster.getChildCount())
                      : isPolice
                        ? (cluster) => policeClusterIcon(cluster.getChildCount())
                        : isMeals
                          ? (cluster) => mealsClusterIcon(cluster.getChildCount())
                          : isGenerators
                            ? (cluster) => generatorClusterIcon(cluster.getChildCount())
                            : isVolunteers
                              ? (cluster) => volunteerClusterIcon(cluster.getChildCount())
                              : isResources
                                ? (cluster) => resourceClusterIcon(cluster.getChildCount())
                              : isIt
                                ? (cluster) => itClusterIcon(cluster.getChildCount())
                                : isChemical
                                  ? (cluster) => chemicalClusterIcon(cluster.getChildCount())
                                  : isFinancial
                                    ? (cluster) => financialClusterIcon(cluster.getChildCount())
                                    : isCriticalInfra
                                      ? (cluster) => criticalInfraClusterIcon(cluster.getChildCount())
                                      : () => clusterIcon(),
        });

        for (const marker of markers) {
            const lm = L.marker([marker.position.lat, marker.position.lng], {
                icon: buildLeafletMarkerIcon(marker),
                title: marker.title,
            });
            lm.on('click', () => onSelect(marker));
            group.addLayer(lm);
        }

        group.addTo(map);
        groupRef.current = group;

        return () => {
            if (groupRef.current) {
                map.removeLayer(groupRef.current);
                groupRef.current = null;
            }
        };
    }, [map, markers, enabled, onSelect, clusterMode, cluster]);

    return null;
}

function MapClickHeatHandler({
    heatClickOnly,
    showHeatmap,
    heatIncidents,
    onHeatIncidentSelect,
    onHeatSelect,
}: {
    heatClickOnly: boolean;
    showHeatmap: boolean;
    heatIncidents: UnifiedEventHeatPoint[];
    onHeatIncidentSelect?: (inc: UnifiedEventHeatPoint) => void;
    onHeatSelect: (inc: UnifiedEventHeatPoint | null) => void;
}) {
    useMapEvents({
        click(e) {
            if (!heatClickOnly || !showHeatmap || heatIncidents.length === 0) return;
            const hit = findNearestHeatIncident(e.latlng.lat, e.latlng.lng, heatIncidents);
            if (hit) {
                onHeatSelect(hit);
                onHeatIncidentSelect?.(hit);
            } else {
                onHeatSelect(null);
            }
        },
    });
    return null;
}

function MarkerPopupContent({
    marker,
    onViewDetails,
    onClose,
}: {
    marker: SituationalMapMarker;
    onViewDetails?: () => void;
    onClose?: () => void;
}) {
    const isHelp = isHelpStatus(marker.status, marker.isSafe);
    const statusLabel =
        marker.type === 'infrastructure' && marker.status
            ? marker.status
            : formatMarkerStatus(marker.status, marker.isSafe);

    return (
        <div className="p-4 pr-9 min-w-[240px] max-w-[320px] text-slate-900 font-sans">
            {marker.category && (
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    {marker.category}
                </p>
            )}
            <h3 className="font-bold text-sm tracking-tight text-slate-900 mb-1.5 leading-snug">
                {marker.title}
            </h3>

            {marker.description && (
                <p className="text-xs text-slate-600 mb-2 leading-relaxed font-normal">
                    {marker.description}
                </p>
            )}

            {marker.location && (
                <p className="text-xs text-slate-600 mb-2.5 leading-normal flex items-start gap-1">
                    <span className="font-semibold text-slate-700 shrink-0">Location:</span>
                    <span className="text-slate-600">{marker.location}</span>
                </p>
            )}

            {marker.phone && (
                <p className="text-xs text-slate-600 mb-2.5 leading-normal flex items-center gap-1">
                    <span className="font-semibold text-slate-700 shrink-0">Phone:</span>
                    <a
                        href={`tel:${marker.phone.replace(/[^\d+]/g, '')}`}
                        className="text-blue-600 font-medium hover:underline"
                    >
                        {marker.phone}
                    </a>
                </p>
            )}

            {(marker.status || marker.isSafe != null) && (
                <div className="mt-1 mb-2">
                    <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                            isHelp || marker.type === 'infrastructure'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200/80 shadow-sm'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-sm'
                        }`}
                    >
                        {statusLabel}
                    </span>
                </div>
            )}

            {marker.riskReportHref && (
                <a
                    href={marker.riskReportHref}
                    className="mt-2 block text-xs font-bold text-[#33375D] hover:text-blue-600 transition-colors"
                >
                    View in AI Risk Assessment →
                </a>
            )}

            {marker.incidentId && onViewDetails && (
                <button
                    type="button"
                    className="mt-2 block text-xs font-bold text-[#33375D] hover:text-blue-600 transition-colors text-left"
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails();
                    }}
                >
                    View details →
                </button>
            )}

            {onClose && (
                <button
                    type="button"
                    className="mt-3 text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                >
                    Close
                </button>
            )}
        </div>
    );
}


type IncidentDialogPayload = { eventIds: string[]; bulletText: string };

export function SituationalLeafletMap({
    markers = [],
    center,
    zoom = 10,
    heatPoints = [],
    showHeatmap = false,
    stateBounds = null,
    coverageCircle = null,
    lockToCoverage = false,
    polylines = [],
    polygons = [],
    disasterZoneCircles = [],
    heatIncidents = [],
    heatClickOnly = false,
    onHeatIncidentSelect,
    onBoundsChanged,
    clusterInfrastructure = false,
    showWeatherRadar = false,
    weatherRadarScope = null,
    infrastructureClusterMode = 'default',
    fitStateOnLoad = false,
    allowZoomOut = false,
    layersLoading = false,
}: SituationalMapProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [selectedMarker, setSelectedMarker] = useState<SituationalMapMarker | null>(null);
    const [selectedRoadClosure, setSelectedRoadClosure] = useState<MapPolylineSpec | null>(null);
    const [closureCoordsCopied, setClosureCoordsCopied] = useState(false);
    const [selectedPowerOutage, setSelectedPowerOutage] = useState<MapPolygonSpec | null>(null);
    const [selectedHeatIncident, setSelectedHeatIncident] = useState<UnifiedEventHeatPoint | null>(
        null,
    );
    const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
    const [incidentDialogPayload, setIncidentDialogPayload] = useState<IncidentDialogPayload | null>(
        null,
    );
    const [mapVariant, setMapVariant] = useState<'standard' | 'satellite'>('standard');

    const openIncidentDetails = useCallback((payload: IncidentDialogPayload) => {
        setIncidentDialogPayload(payload);
        setSelectedHeatIncident(null);
        setSelectedMarker(null);
        setIncidentDialogOpen(true);
    }, []);

    const handleIncidentDialogOpenChange = useCallback((open: boolean) => {
        setIncidentDialogOpen(open);
        if (!open) setIncidentDialogPayload(null);
    }, []);

    const copyClosureCoords = useCallback(async (line: MapPolylineSpec) => {
        const text = line.path
            .map((p) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`)
            .join('\n');
        try {
            await navigator.clipboard.writeText(text);
            setClosureCoordsCopied(true);
            window.setTimeout(() => setClosureCoordsCopied(false), 1600);
        } catch {
            setClosureCoordsCopied(false);
        }
    }, []);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const mapCenter = useMemo(() => {
        if (center) return center;
        if (stateBounds) {
            return {
                lat: (stateBounds.south + stateBounds.north) / 2,
                lng: (stateBounds.west + stateBounds.east) / 2,
            };
        }
        return DEFAULT_MAP_CENTER;
    }, [center, stateBounds]);

    const coverageMapBounds = useMemo((): MapStateBounds | null => {
        if (allowZoomOut || !lockToCoverage || !coverageCircle) return null;
        if (
            !Number.isFinite(coverageCircle.center.lat) ||
            !Number.isFinite(coverageCircle.center.lng) ||
            !(coverageCircle.radiusMeters > 0)
        ) {
            return null;
        }
        return coverageToMapBounds(coverageCircle);
    }, [allowZoomOut, lockToCoverage, coverageCircle]);

    const validMarkers = useMemo(
        () =>
            markers.filter(
                (m) =>
                    m.position &&
                    Number.isFinite(m.position.lat) &&
                    Number.isFinite(m.position.lng),
            ),
        [markers],
    );

    const renderedMarkers = useMemo(() => {
        const base = clusterInfrastructure
            ? validMarkers.filter((m) => m.type !== 'infrastructure')
            : validMarkers;
        // Road closures render in their own clustered layer (count badges when zoomed out).
        return base.filter((m) => m.icon !== 'road_closure');
    }, [validMarkers, clusterInfrastructure]);

    const infrastructureMarkers = useMemo(() => {
        if (!clusterInfrastructure) return [];
        // Road closures have a dedicated clustered layer — keep them out of the generic group.
        return validMarkers.filter(
            (m) => m.type === 'infrastructure' && m.icon !== 'road_closure',
        );
    }, [validMarkers, clusterInfrastructure]);

    const roadClosureMarkers = useMemo(
        () => validMarkers.filter((m) => m.icon === 'road_closure'),
        [validMarkers],
    );

    const validHeatPoints = useMemo(
        () => heatPoints.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
        [heatPoints],
    );

    const validPolylines = useMemo(() => {
        return polylines.flatMap((line, idx) => {
            const path = line.path.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
            if (path.length < 2) return [];
            const first = path[0];
            const last = path[path.length - 1];
            const key =
                line.id ??
                `polyline-${idx}-${path.length}-${first.lat.toFixed(5)}-${first.lng.toFixed(5)}-${last.lat.toFixed(5)}-${last.lng.toFixed(5)}`;
            return [{ ...line, path, key }];
        });
    }, [polylines]);

    const validPolygons = useMemo(() => {
        return polygons.flatMap((poly, idx) => {
            const paths = poly.paths
                .map((path) => path.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)))
                .filter((path) => path.length >= 3);
            if (paths.length === 0) return [];
            const key = poly.id ?? `polygon-${idx}`;
            return [{ ...poly, paths, key }];
        });
    }, [polygons]);

    const showCoverageCircle =
        coverageCircle != null &&
        Number.isFinite(coverageCircle.center.lat) &&
        Number.isFinite(coverageCircle.center.lng) &&
        coverageCircle.radiusMeters > 0;

    const handleInfraSelect = useCallback((m: SituationalMapMarker) => {
        setSelectedHeatIncident(null);
        setSelectedRoadClosure(null);
        setSelectedPowerOutage(null);
        setSelectedMarker(m);
    }, []);

    useEffect(() => {
        if (selectedMarker && !markers.find((m) => m.id === selectedMarker.id)) {
            setSelectedMarker(null);
        }
    }, [markers, selectedMarker]);

    if (!isMounted) {
        return (
            <div className="w-full h-full min-h-[400px] bg-slate-100 animate-pulse flex items-center justify-center rounded-xl border border-slate-200">
                <p className="text-slate-400 text-xs font-black uppercase tracking-widest">
                    Loading map…
                </p>
            </div>
        );
    }

    const tileUrl =
        mapVariant === 'satellite'
            ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const tileAttribution =
        mapVariant === 'satellite'
            ? 'Tiles &copy; Esri'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    return (
        <>
        <div className="w-full h-full min-h-[400px] rounded-xl overflow-hidden shadow-inner border border-slate-200 relative">
            <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-1.5">
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => setMapVariant('standard')}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-md border ${
                            mapVariant === 'standard'
                                ? 'bg-white text-[#33375D] border-slate-200'
                                : 'bg-white/80 text-slate-400 border-slate-100'
                        }`}
                    >
                        Map
                    </button>
                    <button
                        type="button"
                        onClick={() => setMapVariant('satellite')}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-md border ${
                            mapVariant === 'satellite'
                                ? 'bg-white text-[#33375D] border-slate-200'
                                : 'bg-white/80 text-slate-400 border-slate-100'
                        }`}
                    >
                        Satellite
                    </button>
                </div>
                {layersLoading && (
                    <div
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/95 px-2.5 py-1 shadow-md backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200"
                        role="status"
                        aria-live="polite"
                        aria-label="Loading map data"
                    >
                        <span
                            className="h-3 w-3 shrink-0 rounded-full border-2 border-slate-300 border-t-[#33375D] animate-spin"
                            aria-hidden
                        />
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-600 whitespace-nowrap">
                            Loading data
                        </span>
                    </div>
                )}
            </div>

            <WeatherRadarLegend visible={showWeatherRadar} />

            <MapContainer
                center={[mapCenter.lat, mapCenter.lng]}
                zoom={zoom}
                className="h-full w-full outline-none"
                scrollWheelZoom
                style={{ minHeight: 400, height: '100%', width: '100%' }}
            >
                <TileLayer url={tileUrl} attribution={tileAttribution} />
                <WeatherRadarWmsLayer
                    show={showWeatherRadar}
                    scope={weatherRadarScope ?? WEATHER_RADAR_FREE_SCOPE}
                />
                <MapBoundsReporter onBoundsChanged={onBoundsChanged} />
                <MapRestrictionController
                    stateBounds={stateBounds}
                    coverageBounds={coverageMapBounds}
                    fitStateOnLoad={fitStateOnLoad}
                    allowZoomOut={allowZoomOut}
                    lockToCoverage={lockToCoverage}
                />
                <HeatmapLayer points={validHeatPoints} show={showHeatmap} />
                <InfrastructureClusterLayer
                    markers={infrastructureMarkers}
                    enabled={clusterInfrastructure}
                    onSelect={handleInfraSelect}
                    clusterMode={infrastructureClusterMode}
                />
                <InfrastructureClusterLayer
                    markers={roadClosureMarkers}
                    enabled={roadClosureMarkers.length > 0}
                    onSelect={handleInfraSelect}
                    clusterMode="roads"
                    cluster
                />
                <MapClickHeatHandler
                    heatClickOnly={heatClickOnly}
                    showHeatmap={showHeatmap}
                    heatIncidents={heatIncidents}
                    onHeatIncidentSelect={onHeatIncidentSelect}
                    onHeatSelect={setSelectedHeatIncident}
                />

                {showCoverageCircle && coverageCircle && (
                    <Circle
                        center={[coverageCircle.center.lat, coverageCircle.center.lng]}
                        radius={coverageCircle.radiusMeters}
                        pathOptions={{
                            color: '#33375D',
                            weight: 2,
                            fillOpacity: 0,
                        }}
                    />
                )}

                {disasterZoneCircles.map((zone) => (
                    <React.Fragment key={`dz-${zone.id}`}>
                        <Circle
                            center={[zone.center.lat, zone.center.lng]}
                            radius={zone.radiusMeters}
                            pathOptions={{
                                color: zone.strokeColor ?? '#991B1B',
                                fillColor: zone.fillColor ?? '#DC2626',
                                fillOpacity: zone.fillOpacity ?? 0.2,
                                weight: zone.strokeWeight ?? 2,
                            }}
                        />
                        <Marker
                            position={[zone.labelPosition.lat, zone.labelPosition.lng]}
                            icon={L.divIcon({ className: 'dz-label', html: '', iconSize: [0, 0] })}
                        >
                            <Popup closeButton={false}>
                                <span className="text-sm font-bold text-slate-700">{zone.label}</span>
                            </Popup>
                        </Marker>
                    </React.Fragment>
                ))}

                {validPolygons.map((poly) =>
                    poly.paths.map((path, ringIdx) => (
                        <Polygon
                            key={`${poly.key}-${ringIdx}`}
                            positions={path.map((p) => [p.lat, p.lng] as [number, number])}
                            pathOptions={{
                                color: poly.strokeColor ?? '#15803D',
                                fillColor: poly.fillColor ?? '#22C55E',
                                fillOpacity: poly.fillOpacity ?? 0.35,
                                weight: poly.strokeWeight ?? 2,
                            }}
                            eventHandlers={{
                                click: () => {
                                    if (poly.outage) {
                                        setSelectedHeatIncident(null);
                                        setSelectedMarker(null);
                                        setSelectedRoadClosure(null);
                                        setSelectedPowerOutage(poly);
                                    }
                                },
                            }}
                        />
                    )),
                )}

                {validPolylines.map((line) => (
                    <Polyline
                        key={line.key}
                        positions={line.path.map((p) => [p.lat, p.lng] as [number, number])}
                        pathOptions={{
                            color: line.strokeColor ?? '#DC2626',
                            opacity: line.strokeOpacity ?? 0.9,
                            weight: line.strokeWeight ?? (line.kind === 'road_closure' ? 7 : 4),
                        }}
                        eventHandlers={{
                            click: () => {
                                if (line.closure) {
                                    setSelectedHeatIncident(null);
                                    setSelectedMarker(null);
                                    setClosureCoordsCopied(false);
                                    setSelectedRoadClosure(line);
                                }
                            },
                        }}
                    />
                ))}

                {renderedMarkers.map((marker) => (
                    <React.Fragment key={marker.id}>
                        <Marker
                            position={[marker.position.lat, marker.position.lng]}
                            icon={buildLeafletMarkerIcon(marker)}
                            eventHandlers={{
                                click: () => {
                                    setSelectedHeatIncident(null);
                                    setSelectedMarker(marker);
                                },
                            }}
                        >
                            <Popup>
                                <MarkerPopupContent
                                    marker={marker}
                                    onViewDetails={
                                        marker.incidentId
                                            ? () =>
                                                  openIncidentDetails({
                                                      eventIds: [marker.incidentId!],
                                                      bulletText: `${marker.title}${marker.description ? ` — ${marker.description}` : ''}`,
                                                  })
                                            : undefined
                                    }
                                />
                            </Popup>
                        </Marker>
                        {(marker.type === 'earthquake' || marker.type === 'weather') && marker.radius && (
                            <Circle
                                center={[marker.position.lat, marker.position.lng]}
                                radius={marker.radius}
                                pathOptions={{
                                    color: marker.type === 'earthquake' ? '#FF8C00' : '#4169E1',
                                    fillColor: marker.type === 'earthquake' ? '#FF8C00' : '#4169E1',
                                    fillOpacity: 0.35,
                                    weight: 2,
                                }}
                            />
                        )}
                    </React.Fragment>
                ))}

                {selectedHeatIncident && (
                    <Marker
                        position={[selectedHeatIncident.lat, selectedHeatIncident.lng]}
                        icon={heatIncidentPinIcon()}
                    >
                        <Popup>
                            <div className="p-2 min-w-[200px] max-w-[300px]">
                                <h3 className="font-extrabold text-sm mb-1 uppercase">Incident</h3>
                                <div className="font-bold text-lg mb-1">{selectedHeatIncident.name}</div>
                                {selectedHeatIncident.severity && (
                                    <p className="text-xs text-slate-600 mb-1">
                                        Severity: {selectedHeatIncident.severity}
                                    </p>
                                )}
                                {selectedHeatIncident.location && (
                                    <p className="text-xs text-slate-500">{selectedHeatIncident.location}</p>
                                )}
                                <button
                                    type="button"
                                    className="mt-2 text-xs font-bold text-[#33375D] hover:underline"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openIncidentDetails({
                                            eventIds: [selectedHeatIncident.id],
                                            bulletText: `${selectedHeatIncident.name} — ${selectedHeatIncident.severity} severity${selectedHeatIncident.location ? ` · ${selectedHeatIncident.location}` : ''}`,
                                        });
                                    }}
                                >
                                    View details →
                                </button>
                            </div>
                        </Popup>
                    </Marker>
                )}
            </MapContainer>

            {selectedPowerOutage?.outage && (
                <div className="absolute left-4 bottom-4 z-[500] max-w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                        Power Outage
                    </p>
                    <div className="font-bold text-base mb-1">{selectedPowerOutage.outage.name}</div>
                    <p className="text-xs text-slate-600 mb-1">
                        {selectedPowerOutage.outage.county}, {selectedPowerOutage.outage.state}
                    </p>
                    <p className="text-sm font-semibold text-emerald-700 mb-2">
                        {selectedPowerOutage.outage.metersAffected.toLocaleString()} meters affected
                    </p>
                    {selectedPowerOutage.outage.reportedStartTime ? (
                        <p className="text-xs text-slate-600 mb-1">
                            Started:{' '}
                            {new Date(selectedPowerOutage.outage.reportedStartTime).toLocaleString()}
                        </p>
                    ) : null}
                    {selectedPowerOutage.outage.estimatedRestorationTime ? (
                        <p className="text-xs text-slate-600 mb-1">
                            Est. restoration:{' '}
                            {new Date(
                                selectedPowerOutage.outage.estimatedRestorationTime,
                            ).toLocaleString()}
                        </p>
                    ) : null}
                    {selectedPowerOutage.outage.communityDescriptor ? (
                        <p className="text-xs text-slate-500 mb-1">
                            Community: {selectedPowerOutage.outage.communityDescriptor}
                        </p>
                    ) : null}
                    {selectedPowerOutage.outage.cause ? (
                        <p className="text-xs text-slate-600 mb-1">
                            Cause: {selectedPowerOutage.outage.cause}
                        </p>
                    ) : null}
                    {selectedPowerOutage.outage.source ? (
                        <p className="text-[10px] text-slate-400 mt-2">{selectedPowerOutage.outage.source}</p>
                    ) : null}
                    <button
                        type="button"
                        className="text-xs font-bold text-slate-500 mt-2"
                        onClick={() => setSelectedPowerOutage(null)}
                    >
                        Close
                    </button>
                </div>
            )}

            {selectedRoadClosure?.closure && selectedRoadClosure.path.length >= 2 && (
                <div className="absolute left-4 bottom-4 z-[500] max-w-[300px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                        Road Closure
                    </p>
                    <div className="font-bold text-base mb-2">{selectedRoadClosure.closure.roadName}</div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white mb-2">
                        {selectedRoadClosure.closure.status === 'Closed'
                            ? 'Road Closed'
                            : selectedRoadClosure.closure.status}
                    </span>
                    {selectedRoadClosure.closure.reason && (
                        <p className="text-xs text-slate-600 mb-2">{selectedRoadClosure.closure.reason}</p>
                    )}
                    {(selectedRoadClosure.closure.startLocation ||
                        selectedRoadClosure.closure.endLocation) && (
                        <p className="text-[11px] text-slate-500 mb-2">
                            {selectedRoadClosure.closure.startLocation}
                            {selectedRoadClosure.closure.endLocation
                                ? ` → ${selectedRoadClosure.closure.endLocation}`
                                : ''}
                        </p>
                    )}
                    <p className="text-[10px] text-slate-400 mb-2 tabular-nums">
                        {selectedRoadClosure.path[0].lat.toFixed(5)},{' '}
                        {selectedRoadClosure.path[0].lng.toFixed(5)}
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="text-xs font-bold text-blue-600"
                            onClick={() => copyClosureCoords(selectedRoadClosure)}
                        >
                            {closureCoordsCopied ? 'Copied!' : 'Copy coordinates'}
                        </button>
                        <button
                            type="button"
                            className="text-xs font-bold text-slate-500"
                            onClick={() => setSelectedRoadClosure(null)}
                        >
                            Close
                        </button>
                    </div>
                    {selectedRoadClosure.closure.source && (
                        <p className="text-[10px] text-slate-400 mt-2">
                            Source: {selectedRoadClosure.closure.source}
                        </p>
                    )}
                </div>
            )}

            {selectedMarker?.type === 'infrastructure' && clusterInfrastructure && (
                <div className="absolute left-4 bottom-4 z-[500] max-w-[320px] rounded-xl border border-slate-200 bg-white shadow-xl">
                    <MarkerPopupContent
                        marker={selectedMarker}
                        onClose={() => setSelectedMarker(null)}
                    />
                </div>
            )}

        </div>

        <IncidentDetailDialog
            elevated
            open={incidentDialogOpen}
            onOpenChange={handleIncidentDialogOpenChange}
            eventIds={incidentDialogPayload?.eventIds ?? []}
            bulletText={incidentDialogPayload?.bulletText ?? ''}
        />
        </>
    );
}

/** Drop-in alias so gis-map can swap off Google without renaming every call site. */
export const SituationalMap = SituationalLeafletMap;
