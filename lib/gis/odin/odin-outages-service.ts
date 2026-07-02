import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store';
import { getUsStateBbox } from '@/lib/constants/us-state-bounding-boxes';
import type { PowerOutagePolygon } from '@/lib/gis/odin/odin-outages-config';
import {
    ODIN_OUTAGE_CACHE_TTL_MS,
    ODIN_OUTAGE_FETCH_TIMEOUT_MS,
    ODIN_OUTAGE_PAGE_LIMIT,
    ODIN_OUTAGES_API_BASE,
    odinStateNameFromUsps,
    odinSupportedStateNames,
    type OdinOutageStateName,
} from '@/lib/gis/odin/odin-outages-config';
import {
    type InfrastructureSearchScope,
    type MapBounds,
} from '@/lib/gis/infrastructure-search-grid';
import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes';
import { calculateDistance } from '@/lib/services/mock-map-service';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';

const CACHE_PREFIX = 'map-layer:odin-outages:';

type OdinApiRecord = Record<string, unknown>;

function ringToPath(ring: number[][]): { lat: number; lng: number }[] {
    return ring
        .filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
        .map((pt) => ({ lat: Number(pt[1]), lng: Number(pt[0]) }));
}

function geoJsonToPaths(geometry: unknown): { lat: number; lng: number }[][] {
    if (!geometry || typeof geometry !== 'object') return [];
    const g = geometry as { type?: string; coordinates?: unknown };
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
        const ring = (g.coordinates as number[][][])[0];
        if (!Array.isArray(ring)) return [];
        const path = ringToPath(ring);
        return path.length >= 3 ? [path] : [];
    }
    if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
        const paths: { lat: number; lng: number }[][] = [];
        for (const poly of g.coordinates as number[][][][]) {
            const ring = poly?.[0];
            if (!Array.isArray(ring)) continue;
            const path = ringToPath(ring);
            if (path.length >= 3) paths.push(path);
        }
        return paths;
    }
    return [];
}

function parseEstimatedRestoration(raw: unknown): string | undefined {
    if (raw == null || raw === '') return undefined;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw) as { ert?: string };
            return parsed.ert ?? raw;
        } catch {
            return raw;
        }
    }
    return String(raw);
}

function parseOdinRecord(row: OdinApiRecord, index: number): PowerOutagePolygon | null {
    const geom = row.geom as { geometry?: unknown } | undefined;
    const paths = geoJsonToPaths(geom?.geometry);
    if (paths.length === 0) return null;

    const centroidRaw = (row.centroid ?? row.geo_point_2d) as { lat?: number; lon?: number; lng?: number } | undefined;
    const lat = centroidRaw?.lat != null ? Number(centroidRaw.lat) : paths[0][0]?.lat;
    const lng =
        centroidRaw?.lon != null
            ? Number(centroidRaw.lon)
            : centroidRaw?.lng != null
              ? Number(centroidRaw.lng)
              : paths[0][0]?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const state = String(row.state ?? '').trim();
    const county = String(row.county ?? '').trim();
    const name = String(row.name ?? 'Utility outage').trim();
    const reportedStartTime = String(row.reportedstarttime ?? row.reportedStartTime ?? '').trim() || undefined;
    const metersAffected = Number(row.metersaffected ?? row.metersAffected ?? 0);

    const id = [
        'odin',
        state.replace(/\s+/g, '-'),
        county.replace(/\s+/g, '-'),
        name.slice(0, 40).replace(/\s+/g, '-'),
        reportedStartTime ?? 'na',
        String(metersAffected),
        String(index),
    ]
        .join('-')
        .slice(0, 120);

    return {
        id,
        name,
        utilityId: String(row.utility_id ?? '').trim() || undefined,
        county,
        state,
        communityDescriptor: String(row.communitydescriptor ?? row.communityDescriptor ?? '').trim() || undefined,
        metersAffected: Number.isFinite(metersAffected) ? metersAffected : 0,
        customersRestored:
            row.customersrestored != null || row.customersRestored != null
                ? Number(row.customersrestored ?? row.customersRestored)
                : null,
        reportedStartTime,
        estimatedRestorationTime: parseEstimatedRestoration(
            row.estimatedrestorationtime ?? row.estimatedRestorationTime,
        ),
        cause: row.cause != null ? String(row.cause) : null,
        statusKind: row.statuskind != null ? String(row.statuskind) : null,
        paths,
        centroid: { lat, lng },
        source: 'ODIN (DOE-OE)',
    };
}

function stateBboxIntersectsBounds(stateCode: string, bounds: MapBounds): boolean {
    const bbox = getUsStateBbox(stateCode);
    if (!bbox) return false;
    const [west, south, east, north] = bbox;
    return !(bounds.east < west || bounds.west > east || bounds.north < south || bounds.south > north);
}

function pointInScope(
    lat: number,
    lng: number,
    scope: InfrastructureSearchScope,
): boolean {
    if (scope.mode === 'state') {
        return pointInUsStateBBox(lng, lat, scope.stateCode);
    }
    if (scope.mode === 'radius') {
        return calculateDistance(lat, lng, scope.center.lat, scope.center.lng) <= scope.radiusMile;
    }
    const b = scope.bounds;
    return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}

function outageIntersectsScope(
    outage: PowerOutagePolygon,
    scope: InfrastructureSearchScope,
): boolean {
    if (pointInScope(outage.centroid.lat, outage.centroid.lng, scope)) return true;
    for (const path of outage.paths) {
        for (const p of path) {
            if (pointInScope(p.lat, p.lng, scope)) return true;
        }
    }
    return false;
}

function odinStatesForScope(scope: InfrastructureSearchScope): OdinOutageStateName[] {
    if (scope.mode === 'state') {
        const name = odinStateNameFromUsps(scope.stateCode);
        return name ? [name] : [];
    }

    let bounds: MapBounds | null = null;
    if (scope.mode === 'bounds') {
        bounds = scope.bounds;
    } else if (scope.mode === 'radius') {
        const latDelta = scope.radiusMile / 69;
        const cosLat = Math.cos((scope.center.lat * Math.PI) / 180);
        const lngDelta = scope.radiusMile / (69 * Math.max(0.2, Math.abs(cosLat)));
        bounds = {
            south: scope.center.lat - latDelta,
            north: scope.center.lat + latDelta,
            west: scope.center.lng - lngDelta,
            east: scope.center.lng + lngDelta,
        };
    }

    if (!bounds) return odinSupportedStateNames();

    return odinSupportedStateNames().filter((stateName) => {
        const usps = normalizeStateToUsps(stateName);
        if (!usps) return false;
        return stateBboxIntersectsBounds(usps, bounds!);
    });
}

function scopeCacheKey(scope: InfrastructureSearchScope): string {
    const states = odinStatesForScope(scope);
    if (scope.mode === 'state') return `state:${scope.stateCode.toUpperCase()}`;
    if (scope.mode === 'radius') {
        return `radius:${scope.center.lat.toFixed(3)},${scope.center.lng.toFixed(3)}:${scope.radiusMile}:${states.sort().join('|')}`;
    }
    const b = scope.bounds;
    return `bounds:${b.west.toFixed(2)},${b.south.toFixed(2)},${b.east.toFixed(2)},${b.north.toFixed(2)}:${states.sort().join('|')}`;
}

async function fetchOdinStateRecords(stateName: OdinOutageStateName): Promise<PowerOutagePolygon[]> {
    const cacheKey = `${CACHE_PREFIX}state:${stateName}`;
    const cached = await cacheGetJson<PowerOutagePolygon[]>(cacheKey);
    if (cached) return cached;

    const out: PowerOutagePolygon[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
        const url = new URL(ODIN_OUTAGES_API_BASE);
        url.searchParams.set('limit', String(ODIN_OUTAGE_PAGE_LIMIT));
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('refine', `state:"${stateName}"`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ODIN_OUTAGE_FETCH_TIMEOUT_MS);

        try {
            const res = await fetch(url.toString(), {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            if (!res.ok) {
                console.warn(`[odin] ${stateName} HTTP ${res.status}`);
                break;
            }
            const payload = (await res.json()) as { total_count?: number; results?: OdinApiRecord[] };
            total = Number(payload.total_count ?? 0);
            const rows = Array.isArray(payload.results) ? payload.results : [];
            rows.forEach((row, idx) => {
                const parsed = parseOdinRecord(row, offset + idx);
                if (parsed) out.push(parsed);
            });
            if (rows.length === 0) break;
            offset += rows.length;
        } catch (err) {
            console.warn(`[odin] ${stateName} fetch failed:`, err);
            break;
        } finally {
            clearTimeout(timer);
        }
    }

    await cacheSetJson(cacheKey, out, ODIN_OUTAGE_CACHE_TTL_MS);
    return out;
}

export async function fetchOdinPowerOutages(scope: InfrastructureSearchScope): Promise<{
    outages: PowerOutagePolygon[];
    states: OdinOutageStateName[];
    fetchedAt: string;
}> {
    const scopeKey = scopeCacheKey(scope);
    const scopedCacheKey = `${CACHE_PREFIX}scope:${scopeKey}`;
    const cached = await cacheGetJson<PowerOutagePolygon[]>(scopedCacheKey);
    if (cached) {
        return {
            outages: cached,
            states: odinStatesForScope(scope),
            fetchedAt: new Date().toISOString(),
        };
    }

    const states = odinStatesForScope(scope);
    const batches = await Promise.all(states.map((stateName) => fetchOdinStateRecords(stateName)));
    let outages = batches.flat();

    outages = outages.filter((o) => outageIntersectsScope(o, scope));

    await cacheSetJson(scopedCacheKey, outages, ODIN_OUTAGE_CACHE_TTL_MS);

    return {
        outages,
        states,
        fetchedAt: new Date().toISOString(),
    };
}
