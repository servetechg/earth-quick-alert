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
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const LAYER = 'shelters';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

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

async function querySheltersByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ShelterMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = wideSampleCacheKey(LAYER, bounds, limit);

    if (!opts?.force) {
        const hit = await cacheGetJson<ShelterMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
    const markers: ShelterMapMarker[] = [];
    const seen = new Set<string>();

    await connectDB();

    for (let row = 0; row < rows; row++) {
        if (markers.length >= limit) break;

        const rowCells = cells.filter((c) => c.row === row);
        const rowResults = await Promise.all(
            rowCells.map((cell) =>
                MapLayerShelter.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                    .select(SHELTER_SELECT)
                    .limit(perCell)
                    .lean<ShelterDoc[]>(),
            ),
        );

        for (const docs of rowResults) {
            for (const doc of docs) {
                if (seen.has(doc.shelterId)) continue;
                seen.add(doc.shelterId);
                markers.push(toShelterMapMarker(doc));
                if (markers.length >= limit) break;
            }
            if (markers.length >= limit) break;
        }
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function querySheltersByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ShelterMapMarker[]; cached: boolean }> {
    if (isWideLayerViewport(bounds)) {
        return querySheltersByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = layerBboxCacheKey(LAYER, bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<ShelterMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const docs = await MapLayerShelter.find(cellGeoFilter(bounds, opts?.stateKey))
        .select(SHELTER_SELECT)
        .limit(limit)
        .lean<ShelterDoc[]>();

    const markers = docs.map(toShelterMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
