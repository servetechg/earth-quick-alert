import connectDB from '@/lib/mongodb';
import MapLayerShelter from '@/models/MapLayerShelter';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import {
    type ShelterMapMarker,
    SHELTER_STATUS_LABELS,
    SHELTER_USAGE_LABELS,
} from '@/lib/gis/layers/shelters-types';

const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

function boundsSpan(bounds: MapBounds): { latSpan: number; lngSpan: number } {
    return {
        latSpan: bounds.north - bounds.south,
        lngSpan: bounds.east - bounds.west,
    };
}

function isWideViewport(bounds: MapBounds): boolean {
    const { latSpan, lngSpan } = boundsSpan(bounds);
    return latSpan > 4 || lngSpan > 6;
}

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

function bboxCacheKey(bounds: MapBounds): string {
    const r = (n: number) => n.toFixed(3);
    return `map-layer:shelters:bbox:${r(bounds.west)},${r(bounds.south)},${r(bounds.east)},${r(bounds.north)}`;
}

export async function invalidateSheltersLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:shelters:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:shelters:bbox:');
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
    const docs = await MapLayerShelter.find({ stateKey: usps })
        .select(
            'shelterId name lat lng stateKey county address city zip shelterStatusCode facilityUsageCode evacuationCapacity postImpactCapacity wheelchairAccessible organizationName organizationPhone',
        )
        .lean<ShelterDoc[]>();

    const markers = docs.map(toShelterMapMarker);
    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

async function querySheltersByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ShelterMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = `${bboxCacheKey(bounds)}:sample:${limit}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<ShelterMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { latSpan, lngSpan } = boundsSpan(bounds);
    const cols = Math.max(4, Math.min(24, Math.ceil(lngSpan / 2)));
    const rows = Math.max(4, Math.min(16, Math.ceil(latSpan / 2)));
    const perCell = Math.max(1, Math.ceil(limit / (cols * rows)));
    const cellW = lngSpan / cols;
    const cellH = latSpan / rows;

    await connectDB();

    const geoFilter: Record<string, unknown> = {
        location: {
            $geoWithin: {
                $geometry: {
                    type: 'Polygon',
                    coordinates: [
                        [
                            [bounds.west, bounds.south],
                            [bounds.east, bounds.south],
                            [bounds.east, bounds.north],
                            [bounds.west, bounds.north],
                            [bounds.west, bounds.south],
                        ],
                    ],
                },
            },
        },
    };

    if (opts?.stateKey) {
        geoFilter.stateKey = opts.stateKey.trim().toUpperCase();
    }

    const poolLimit = Math.min(Math.max(limit * 4, 4_000), 12_000);
    const docs = await MapLayerShelter.find(geoFilter)
        .select(
            'shelterId name lat lng stateKey county address city zip shelterStatusCode facilityUsageCode evacuationCapacity postImpactCapacity wheelchairAccessible organizationName organizationPhone',
        )
        .limit(poolLimit)
        .lean<ShelterDoc[]>();

    const cellBuckets = new Map<string, ShelterDoc[]>();
    for (const doc of docs) {
        const col = Math.min(cols - 1, Math.max(0, Math.floor((doc.lng - bounds.west) / cellW)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor((doc.lat - bounds.south) / cellH)));
        const key = `${row}:${col}`;
        const bucket = cellBuckets.get(key);
        if (bucket) bucket.push(doc);
        else cellBuckets.set(key, [doc]);
    }

    const markers: ShelterMapMarker[] = [];
    const seen = new Set<string>();

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (markers.length >= limit) break;
            const bucket = cellBuckets.get(`${row}:${col}`);
            if (!bucket?.length) continue;

            for (const doc of bucket.slice(0, perCell)) {
                if (seen.has(doc.shelterId)) continue;
                seen.add(doc.shelterId);
                markers.push(toShelterMapMarker(doc));
                if (markers.length >= limit) break;
            }
        }
        if (markers.length >= limit) break;
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function querySheltersByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ShelterMapMarker[]; cached: boolean }> {
    if (isWideViewport(bounds)) {
        return querySheltersByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = bboxCacheKey(bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<ShelterMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const geoFilter: Record<string, unknown> = {
        location: {
            $geoWithin: {
                $geometry: {
                    type: 'Polygon',
                    coordinates: [
                        [
                            [bounds.west, bounds.south],
                            [bounds.east, bounds.south],
                            [bounds.east, bounds.north],
                            [bounds.west, bounds.north],
                            [bounds.west, bounds.south],
                        ],
                    ],
                },
            },
        },
    };

    if (opts?.stateKey) {
        geoFilter.stateKey = opts.stateKey.trim().toUpperCase();
    }

    const docs = await MapLayerShelter.find(geoFilter)
        .select(
            'shelterId name lat lng stateKey county address city zip shelterStatusCode facilityUsageCode evacuationCapacity postImpactCapacity wheelchairAccessible organizationName organizationPhone',
        )
        .limit(limit)
        .lean<ShelterDoc[]>();

    const markers = docs.map(toShelterMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
