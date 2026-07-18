import connectDB from '@/lib/mongodb';
import MapLayerShelter from '@/models/MapLayerShelter';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import {
    type ShelterMapMarker,
    SHELTER_STATUS_LABELS,
    SHELTER_USAGE_LABELS,
} from '@/lib/gis/layers/shelters-types';

import {
    bboxCacheKey as layerBboxCacheKey,
    boundsSpan,
    buildViewportGrid,
    cellGeoFilter,
    isConusSizedViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const LAYER = 'shelters';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 15 * 60 * 1000;
/** City / county zoom — return every shelter in the box. */
const MAX_MARKERS_COMPLETE = 8_000;
/** Regional viewport — uniform grid so the center is never empty. */
const MAX_MARKERS_UNIFORM = 5_000;
/** Continental overview sample. */
const MAX_MARKERS_CONUS = 2_500;
const GRID_QUERY_CONCURRENCY = 12;

const SHELTER_SELECT =
    'shelterId name lat lng stateKey county address city zip shelterStatusCode facilityUsageCode evacuationCapacity postImpactCapacity wheelchairAccessible organizationName organizationPhone';

type ShelterDoc = {
    shelterId: string;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    county: string;
    address?: string;
    city?: string;
    zip?: string;
    shelterStatusCode?: string;
    facilityUsageCode?: string;
    evacuationCapacity?: number | null;
    postImpactCapacity?: number | null;
    wheelchairAccessible?: string;
    organizationName?: string;
    organizationPhone?: string;
};

function labelStatus(code: string): string {
    const key = code.trim().toUpperCase();
    return SHELTER_STATUS_LABELS[key] ?? (key || 'Unknown');
}

function labelUsage(code: string): string {
    const key = code.trim().toUpperCase();
    return SHELTER_USAGE_LABELS[key] ?? (key || 'Unknown');
}

function toShelterMapMarker(doc: ShelterDoc): ShelterMapMarker {
    const county = String(doc.county ?? '').trim();
    const city = String(doc.city ?? '').trim();
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();
    const address = String(doc.address ?? '').trim();
    const zip = String(doc.zip ?? '').trim();

    const locationParts = [city, county ? `${county} County` : '', stateKey].filter(Boolean);
    const location = locationParts.join(', ');

    return {
        id: `fema-shelter:${doc.shelterId}`,
        shelterId: doc.shelterId,
        title: doc.name,
        lat: doc.lat,
        lng: doc.lng,
        stateKey,
        county,
        address,
        city,
        zip,
        status: labelStatus(String(doc.shelterStatusCode ?? '')),
        evacuationCapacity: doc.evacuationCapacity ?? null,
        postImpactCapacity: doc.postImpactCapacity ?? null,
        facilityUsage: labelUsage(String(doc.facilityUsageCode ?? '')),
        wheelchairAccessible: String(doc.wheelchairAccessible ?? '').trim() || 'Unknown',
        organization: String(doc.organizationName ?? '').trim(),
        organizationPhone: String(doc.organizationPhone ?? '').trim(),
        location: location || stateKey,
    };
}

function latLngBboxFilter(bounds: MapBounds, stateKey?: string): Record<string, unknown> {
    const filter: Record<string, unknown> = {
        lat: { $gte: bounds.south, $lte: bounds.north },
        lng: { $gte: bounds.west, $lte: bounds.east },
    };
    if (stateKey) filter.stateKey = stateKey.trim().toUpperCase();
    return filter;
}

function dedupeMarkers(docs: ShelterDoc[]): ShelterMapMarker[] {
    const seen = new Set<string>();
    const markers: ShelterMapMarker[] = [];
    for (const doc of docs) {
        if (seen.has(doc.shelterId)) continue;
        seen.add(doc.shelterId);
        markers.push(toShelterMapMarker(doc));
    }
    return markers;
}

export async function invalidateSheltersLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:shelters:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:shelters:bbox:');
    await cacheDelByPrefix('map-layer:shelters:conus:');
}

export async function querySheltersByState(
    stateKey: string,
    opts?: { force?: boolean },
): Promise<{ markers: ShelterMapMarker[]; cached: boolean }> {
    const usps = stateKey.trim().toUpperCase();
    const cacheKey = `map-layer:shelters:state:${usps}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<ShelterMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    await connectDB();
    const docs = await MapLayerShelter.find({ stateKey: usps }).select(SHELTER_SELECT).lean<ShelterDoc[]>();

    const markers = docs.map(toShelterMapMarker);
    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

/**
 * Every shelter inside the viewport box (lat/lng). Used for city/county zoom
 * so the visible area never has spatial holes from an unordered .limit().
 */
async function querySheltersByBoundsComplete(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ShelterMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_COMPLETE, 1), MAX_MARKERS_COMPLETE);
    const cacheKey = `${layerBboxCacheKey(LAYER, bounds)}:complete:v5:${limit}:${opts?.stateKey ?? ''}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<ShelterMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    await connectDB();
    const docs = await MapLayerShelter.find(latLngBboxFilter(bounds, opts?.stateKey))
        .select(SHELTER_SELECT)
        .limit(limit)
        .lean<ShelterDoc[]>();

    const markers = dedupeMarkers(docs);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

/**
 * Uniform grid over the full viewport — every cell is queried (no early exit).
 * Prevents "markers on left/right, empty center" from unordered global limits.
 */
async function querySheltersByBoundsUniform(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ShelterMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_UNIFORM, 1), MAX_MARKERS_UNIFORM);
    const cacheKey = `${wideSampleCacheKey(LAYER, bounds, limit)}:uniform:v5:${opts?.stateKey ?? ''}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<ShelterMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, cells } = buildViewportGrid(bounds, limit);
    await connectDB();

    const docs: ShelterDoc[] = [];
    for (let i = 0; i < cells.length; i += GRID_QUERY_CONCURRENCY) {
        const slice = cells.slice(i, i + GRID_QUERY_CONCURRENCY);
        const parts = await Promise.all(
            slice.map((cell) =>
                MapLayerShelter.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                    .select(SHELTER_SELECT)
                    .limit(perCell)
                    .lean<ShelterDoc[]>(),
            ),
        );
        for (const part of parts) docs.push(...part);
    }

    const markers = dedupeMarkers(docs);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function querySheltersByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ShelterMapMarker[]; cached: boolean }> {
    const { latSpan, lngSpan } = boundsSpan(bounds);

    // Continental overview — capped uniform sample across the whole USA.
    if (isConusSizedViewport(bounds)) {
        return querySheltersByBoundsUniform(bounds, {
            ...opts,
            limit: opts?.limit ?? MAX_MARKERS_CONUS,
        });
    }

    // City / tight regional zoom — every shelter in the visible box.
    if (latSpan <= 2.5 && lngSpan <= 2.5) {
        return querySheltersByBoundsComplete(bounds, opts);
    }

    // Wider regional view — spatially uniform so the map center is never skipped.
    return querySheltersByBoundsUniform(bounds, opts);
}
