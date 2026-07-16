import connectDB from '@/lib/mongodb';
import MapLayerPharmacy from '@/models/MapLayerPharmacy';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import type { PharmacyMapMarker } from '@/lib/gis/layers/pharmacies-types';
import {
    bboxCacheKey as layerBboxCacheKey,
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const LAYER = 'pharmacies';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

const PHARMACY_SELECT = 'placeId name lat lng stateKey address phone';

type PharmacyDoc = {
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    address?: string;
    phone?: string;
};

function toPharmacyMapMarker(doc: PharmacyDoc): PharmacyMapMarker {
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();
    const address = String(doc.address ?? '').trim();
    const phone = String(doc.phone ?? '').trim();

    return {
        id: `pharmacy:${doc.placeId}`,
        placeId: doc.placeId,
        title: doc.name,
        lat: doc.lat,
        lng: doc.lng,
        stateKey,
        address,
        phone,
        location: address || stateKey,
    };
}

export async function invalidatePharmaciesLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:pharmacies:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:pharmacies:bbox:');
    await cacheDelByPrefix('map-layer:pharmacies:conus:');
}

export async function queryPharmaciesByState(
    stateKey: string,
    opts?: { force?: boolean },
): Promise<{ markers: PharmacyMapMarker[]; cached: boolean }> {
    const usps = stateKey.trim().toUpperCase();
    const cacheKey = `map-layer:pharmacies:state:${usps}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<PharmacyMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    await connectDB();
    const docs = await MapLayerPharmacy.find({ stateKey: usps }).select(PHARMACY_SELECT).lean<PharmacyDoc[]>();

    const markers = docs.map(toPharmacyMapMarker);
    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

async function queryPharmaciesByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: PharmacyMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = wideSampleCacheKey(LAYER, bounds, limit);

    if (!opts?.force) {
        const hit = await cacheGetJson<PharmacyMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
    const markers: PharmacyMapMarker[] = [];
    const seen = new Set<string>();

    await connectDB();

    for (let row = 0; row < rows; row++) {
        if (markers.length >= limit) break;

        const rowCells = cells.filter((c) => c.row === row);
        const rowResults = await Promise.all(
            rowCells.map((cell) =>
                MapLayerPharmacy.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                    .select(PHARMACY_SELECT)
                    .limit(perCell)
                    .lean<PharmacyDoc[]>(),
            ),
        );

        for (const docs of rowResults) {
            for (const doc of docs) {
                if (seen.has(doc.placeId)) continue;
                seen.add(doc.placeId);
                markers.push(toPharmacyMapMarker(doc));
                if (markers.length >= limit) break;
            }
            if (markers.length >= limit) break;
        }
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function queryPharmaciesByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: PharmacyMapMarker[]; cached: boolean }> {
    if (isWideLayerViewport(bounds)) {
        return queryPharmaciesByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = layerBboxCacheKey(LAYER, bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<PharmacyMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const docs = await MapLayerPharmacy.find(cellGeoFilter(bounds, opts?.stateKey))
        .select(PHARMACY_SELECT)
        .limit(limit)
        .lean<PharmacyDoc[]>();

    const markers = docs.map(toPharmacyMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
