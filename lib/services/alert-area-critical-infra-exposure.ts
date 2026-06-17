import { resolveAlertRowsForCensusExposure } from '@/lib/services/alert-area-census-exposure';
import {
  coordinatesInJurisdiction,
  extractAlertRowCoordinates,
  type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { geocodeLocation } from '@/lib/services/location-matching';
import {
  fetchGoogleCriticalInfraMarkers,
  type CiGoogleSearchScope,
} from '@/lib/gis/critical-infra-google-fetch';
import {
  buildCriticalInfraAtRiskSummary,
  type CriticalInfraMapMarker,
} from '@/lib/demo/critical-infrastructure-markers';
import {
  CRITICAL_INFRASTRUCTURE_SECTORS,
  sectorHasGooglePlaces,
  type CriticalInfraSectorId,
} from '@/lib/gis/critical-infrastructure-sectors';
import { clampBoundsToUsa, pointInUsaBounds } from '@/lib/constants/usa-map-bounds';
import type { MapBounds, InfrastructureSearchScope } from '@/lib/gis/infrastructure-search-grid';
import { fetchInfrastructurePlacesForLayers } from '@/lib/gis/infrastructure-places-fetch';
import { GOOGLE_GIS_FILTER_LAYERS } from '@/lib/gis/gis-filter-layers';
import { calculateDistance } from '@/lib/services/mock-map-service';
import type { CriticalInfraAtRiskRow } from '@/lib/types/risk-assessment';
import { GOOGLE_MAPS_API_KEY, isGoogleMapsConfigured } from '@/lib/constants/google-maps-config';

/** Facilities within this distance of an active alert / incident are counted at risk. */
const ALERT_PROXIMITY_RADIUS_MI = 15;
const MAX_INCIDENT_POINTS = 12;
const MAX_GEOCODES = 10;
const MAX_BBOX_SPAN_DEG = 2.5;
const MAX_SEARCH_SCOPES = 6;

type IncidentPoint = {
  lat: number;
  lng: number;
  severity?: string;
};

const GIS_LAYER_TO_SECTOR: Record<string, CriticalInfraSectorId> = {
  hospital: 'ci_healthcare',
  pharmacy: 'ci_healthcare',
  police: 'ci_emergency_services',
  fire_station: 'ci_emergency_services',
  gas_station: 'ci_energy',
  fuel_sites: 'ci_energy',
  generator: 'ci_energy',
  meals_ready: 'ci_food_ag',
  shelter: 'ci_food_ag',
};

const SEVERITY_RANK: Record<string, number> = {
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
  EXTREME: 4,
  SEVERE: 4,
};

function severityToRiskLevel(severity?: string): CriticalInfraMapMarker['riskLevel'] {
  const s = String(severity ?? '').trim().toUpperCase();
  if (s === 'EXTREME' || s === 'SEVERE' || s === 'CRITICAL') return 'CRITICAL';
  if (s === 'HIGH') return 'HIGH';
  if (s === 'MODERATE' || s === 'ELEVATED') return 'MODERATE';
  return 'LOW';
}

function maxRiskLevel(
  a?: CriticalInfraMapMarker['riskLevel'],
  b?: CriticalInfraMapMarker['riskLevel'],
): CriticalInfraMapMarker['riskLevel'] {
  const left = a ?? 'LOW';
  const right = b ?? 'LOW';
  return (SEVERITY_RANK[left] ?? 0) >= (SEVERITY_RANK[right] ?? 0) ? left : right;
}

function padBounds(bounds: MapBounds, padDeg: number): MapBounds {
  return {
    west: bounds.west - padDeg,
    south: bounds.south - padDeg,
    east: bounds.east + padDeg,
    north: bounds.north + padDeg,
  };
}

function boundsFromCoords(coords: IncidentPoint[], padDeg: number): MapBounds | null {
  if (!coords.length) return null;
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  return padBounds(
    {
      west: Math.min(...lngs),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      north: Math.max(...lats),
    },
    padDeg,
  );
}

function dedupeIncidentPoints(points: IncidentPoint[]): IncidentPoint[] {
  const seen = new Set<string>();
  const out: IncidentPoint[] = [];
  for (const p of points) {
    const key = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= MAX_INCIDENT_POINTS) break;
  }
  return out;
}

function buildSearchScopes(points: IncidentPoint[]): CiGoogleSearchScope[] {
  if (!points.length) return [];

  if (points.length === 1) {
    return [
      {
        mode: 'radius',
        lat: points[0].lat,
        lng: points[0].lng,
        radiusMeters: Math.round(ALERT_PROXIMITY_RADIUS_MI * 1609.34),
      },
    ];
  }

  const padDeg = ALERT_PROXIMITY_RADIUS_MI / 69;
  const rawBounds = boundsFromCoords(points, padDeg);
  if (!rawBounds) return [];

  const span = Math.max(rawBounds.north - rawBounds.south, rawBounds.east - rawBounds.west);
  if (span <= MAX_BBOX_SPAN_DEG) {
    const clipped = clampBoundsToUsa(rawBounds);
    if (clipped) return [{ mode: 'bounds', bounds: clipped }];
  }

  return dedupeIncidentPoints(points)
    .slice(0, MAX_SEARCH_SCOPES)
    .map((p) => ({
      mode: 'radius' as const,
      lat: p.lat,
      lng: p.lng,
      radiusMeters: Math.round(ALERT_PROXIMITY_RADIUS_MI * 1609.34),
    }));
}

function markerNearIncident(
  marker: { lat: number; lng: number },
  incidents: IncidentPoint[],
): IncidentPoint | null {
  let nearest: IncidentPoint | null = null;
  let bestDist = Infinity;
  for (const incident of incidents) {
    const dist = calculateDistance(marker.lat, marker.lng, incident.lat, incident.lng);
    if (dist <= ALERT_PROXIMITY_RADIUS_MI && dist < bestDist) {
      bestDist = dist;
      nearest = incident;
    }
  }
  return nearest;
}

async function collectIncidentPoints(
  rows: Record<string, unknown>[],
  jurisdiction?: SubAdminJurisdiction | null,
): Promise<IncidentPoint[]> {
  const out: IncidentPoint[] = [];
  let geocodes = 0;

  for (const row of rows) {
    if (out.length >= MAX_INCIDENT_POINTS) break;

    let coords = extractAlertRowCoordinates({
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
      location: typeof row.location === 'string' ? row.location : '',
    });

    if (!coords) {
      if (geocodes >= MAX_GEOCODES) continue;
      const location = typeof row.location === 'string' ? row.location.trim() : '';
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const query = location || name;
      if (!query || query.length < 4) continue;
      geocodes += 1;
      const geo = await geocodeLocation(query);
      if (!geo) continue;
      coords = { lat: geo.lat, lng: geo.lon };
    }

    if (!pointInUsaBounds(coords.lat, coords.lng)) continue;
    if (jurisdiction && !coordinatesInJurisdiction(coords.lat, coords.lng, jurisdiction)) continue;

    out.push({
      lat: coords.lat,
      lng: coords.lng,
      severity: typeof row.severity === 'string' ? row.severity : undefined,
    });
  }

  return dedupeIncidentPoints(out);
}

function toInfrastructureSearchScope(
  bounds: MapBounds,
  jurisdiction?: SubAdminJurisdiction | null,
): InfrastructureSearchScope {
  if (jurisdiction?.coverageType === 'radius') {
    return {
      mode: 'bounds',
      bounds,
      radiusClip: {
        center: jurisdiction.center,
        radiusMile: jurisdiction.radiusMile,
      },
    };
  }
  if (jurisdiction?.coverageType === 'state' && jurisdiction.stateCode) {
    return { mode: 'state', stateCode: jurisdiction.stateCode };
  }
  return { mode: 'bounds', bounds };
}

async function fetchGisLayerMarkersNearIncidents(
  incidents: IncidentPoint[],
  jurisdiction?: SubAdminJurisdiction | null,
): Promise<CriticalInfraMapMarker[]> {
  const padDeg = ALERT_PROXIMITY_RADIUS_MI / 69;
  const rawBounds = boundsFromCoords(incidents, padDeg);
  if (!rawBounds) return [];

  const bounds = clampBoundsToUsa(rawBounds);
  if (!bounds) return [];

  const scope = toInfrastructureSearchScope(bounds, jurisdiction);
  const places = await fetchInfrastructurePlacesForLayers(scope, GOOGLE_GIS_FILTER_LAYERS, {
    viewportBounds: bounds,
  });

  const markers: CriticalInfraMapMarker[] = [];
  for (const place of places) {
    const sectorId = GIS_LAYER_TO_SECTOR[place.placeType];
    if (!sectorId) continue;

    const nearest = markerNearIncident({ lat: place.lat, lng: place.lng }, incidents);
    if (!nearest) continue;

    const sector = CRITICAL_INFRASTRUCTURE_SECTORS.find((s) => s.id === sectorId);
    markers.push({
      id: place.place_id,
      sectorId,
      lat: place.lat,
      lng: place.lng,
      title: place.name,
      status: 'at_risk',
      location: place.vicinity || 'Address not available',
      description: `${sector?.label ?? sectorId} · near active alert`,
      riskLevel: severityToRiskLevel(nearest.severity),
    });
  }

  return markers;
}

function mergeMarkers(existing: CriticalInfraMapMarker[], incoming: CriticalInfraMapMarker[]): void {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const marker of incoming) {
    const prev = byId.get(marker.id);
    if (!prev) {
      byId.set(marker.id, marker);
      continue;
    }
    byId.set(marker.id, {
      ...prev,
      riskLevel: maxRiskLevel(prev.riskLevel ?? 'LOW', marker.riskLevel ?? 'LOW'),
      status: 'at_risk',
    });
  }
  existing.splice(0, existing.length, ...byId.values());
}

/**
 * Google Places + GIS map layers for hospitals, pharmacies, etc. near active alert / incident areas.
 * Sub-admins: scoped to license radius; super-admin: nationwide active incidents.
 */
export async function computeCriticalInfraAtRiskFromAlertRows(
  rows: Record<string, unknown>[],
  options?: {
    jurisdiction?: SubAdminJurisdiction | null;
  },
): Promise<CriticalInfraAtRiskRow[]> {
  if (!isGoogleMapsConfigured() && !GOOGLE_MAPS_API_KEY) {
    return [];
  }

  const scopedRows = await resolveAlertRowsForCensusExposure(rows, options?.jurisdiction);
  if (!scopedRows.length) return [];

  const incidents = await collectIncidentPoints(scopedRows, options?.jurisdiction);
  if (!incidents.length) return [];

  const googleSectors = CRITICAL_INFRASTRUCTURE_SECTORS.filter(sectorHasGooglePlaces).map(
    (s) => s.id,
  );
  const scopes = buildSearchScopes(incidents);
  const merged: CriticalInfraMapMarker[] = [];

  for (const scope of scopes) {
    const batch = await fetchGoogleCriticalInfraMarkers(googleSectors, scope);
    for (const marker of batch) {
      const nearest = markerNearIncident(marker, incidents);
      if (!nearest) continue;
      merged.push({
        ...marker,
        status: 'at_risk',
        riskLevel: severityToRiskLevel(nearest.severity),
        description: `${marker.description} · near active alert`,
      });
    }
  }

  const gisLayerMarkers = await fetchGisLayerMarkersNearIncidents(incidents, options?.jurisdiction);
  mergeMarkers(merged, gisLayerMarkers);

  if (!merged.length) return [];

  return buildCriticalInfraAtRiskSummary(merged).map((row) => ({
    sectorId: row.sectorId,
    label: row.label,
    facilitiesAtRisk: row.facilitiesAtRisk,
    riskLevel: row.riskLevel,
    facilities: row.facilities.slice(0, 50),
  }));
}
