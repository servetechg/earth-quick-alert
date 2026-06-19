import { resolveAlertRowsForCensusExposure } from '@/lib/services/alert-area-census-exposure';
import {
  coordinatesInJurisdiction,
  extractAlertRowCoordinates,
  type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { geocodeLocation } from '@/lib/services/location-matching';
import {
  fetchHifldCriticalInfraMarkers,
  type CiInfraSearchScope,
} from '@/lib/gis/critical-infra-hifld-fetch';
import {
  buildCriticalInfraAtRiskSummary,
  type CriticalInfraMapMarker,
} from '@/lib/demo/critical-infrastructure-markers';
import { CRITICAL_INFRASTRUCTURE_SECTORS } from '@/lib/gis/critical-infrastructure-sectors';
import { clampBoundsToUsa, pointInUsaBounds } from '@/lib/constants/usa-map-bounds';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import { calculateDistance } from '@/lib/services/mock-map-service';
import type { CriticalInfraAtRiskRow } from '@/lib/types/risk-assessment';

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

function buildSearchScopes(points: IncidentPoint[]): CiInfraSearchScope[] {
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

/**
 * HIFLD / NTAD / EPA ArcGIS facilities near active alert / incident areas (no Google Places).
 * Sub-admins: scoped to license radius; super-admin: nationwide active incidents.
 */
export async function computeCriticalInfraAtRiskFromAlertRows(
  rows: Record<string, unknown>[],
  options?: {
    jurisdiction?: SubAdminJurisdiction | null;
  },
): Promise<CriticalInfraAtRiskRow[]> {
  const scopedRows = await resolveAlertRowsForCensusExposure(rows, options?.jurisdiction);
  if (!scopedRows.length) return [];

  const incidents = await collectIncidentPoints(scopedRows, options?.jurisdiction);
  if (!incidents.length) return [];

  const sectorIds = CRITICAL_INFRASTRUCTURE_SECTORS.map((s) => s.id);
  const scopes = buildSearchScopes(incidents);
  const merged: CriticalInfraMapMarker[] = [];

  for (const scope of scopes) {
    const batch = await fetchHifldCriticalInfraMarkers(sectorIds, scope);
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

  if (!merged.length) return [];

  return buildCriticalInfraAtRiskSummary(merged).map((row) => ({
    sectorId: row.sectorId,
    label: row.label,
    facilitiesAtRisk: row.facilitiesAtRisk,
    riskLevel: row.riskLevel,
    facilities: row.facilities.slice(0, 50),
  }));
}
