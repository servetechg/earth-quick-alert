import connectDB from '@/lib/mongodb';
import MapLayerFinancialSite from '@/models/MapLayerFinancialSite';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import type { FinancialSiteMapMarker } from '@/lib/gis/layers/financial-sites-types';
import {
    bboxCacheKey as layerBboxCacheKey,
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const LAYER = 'financial-sites';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

const FINANCIAL_SELECT = 'locationId name lat lng stateKey city address zip';

type FinancialSiteDoc = {
    locationId: string;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    city?: string;
    address?: string;
    zip?: string;
};

function toFinancialSiteMapMarker(doc: FinancialSiteDoc): FinancialSiteMapMarker {
    const city = String(doc.city ?? '').trim();
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();
    const address = String(doc.address ?? '').trim();
    const zip = String(doc.zip ?? '').trim();

    return {
        id: `fdic:${doc.locationId}`,
        locationId: doc.locationId,
        title: doc.name,
        lat: doc.lat,
        lng: doc.lng,
        stateKey,
        city,
        address,
        zip,
        location: city ? `${city}, ${stateKey}` : stateKey,
    };
}

export async function invalidateFinancialSitesLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:financial-sites:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:financial-sites:bbox:');
    await cacheDelByPrefix('map-layer:financial-sites:conus:');
}

export async function queryFinancialSitesByState(
    stateKey: string,
    opts?: { force?: boolean },
): Promise<{ markers: FinancialSiteMapMarker[]; cached: boolean }> {
    const usps = stateKey.trim().toUpperCase();
    const cacheKey = `map-layer:financial-sites:state:${usps}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<FinancialSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    await connectDB();
    const docs = await MapLayerFinancialSite.find({ stateKey: usps })
        .select(FINANCIAL_SELECT)
        .lean<FinancialSiteDoc[]>();

    const markers = docs.map(toFinancialSiteMapMarker);
    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

async function queryFinancialSitesByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: FinancialSiteMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = wideSampleCacheKey(LAYER, bounds, limit);

    if (!opts?.force) {
        const hit = await cacheGetJson<FinancialSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
    const markers: FinancialSiteMapMarker[] = [];
    const seen = new Set<string>();

    await connectDB();

    for (let row = 0; row < rows; row++) {
        if (markers.length >= limit) break;

        const rowCells = cells.filter((c) => c.row === row);
        const rowResults = await Promise.all(
            rowCells.map((cell) =>
                MapLayerFinancialSite.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                    .select(FINANCIAL_SELECT)
                    .limit(perCell)
                    .lean<FinancialSiteDoc[]>(),
            ),
        );

        for (const docs of rowResults) {
            for (const doc of docs) {
                if (seen.has(doc.locationId)) continue;
                seen.add(doc.locationId);
                markers.push(toFinancialSiteMapMarker(doc));
                if (markers.length >= limit) break;
            }
            if (markers.length >= limit) break;
        }
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function queryFinancialSitesByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: FinancialSiteMapMarker[]; cached: boolean }> {
    if (isWideLayerViewport(bounds)) {
        return queryFinancialSitesByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = layerBboxCacheKey(LAYER, bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<FinancialSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const docs = await MapLayerFinancialSite.find(cellGeoFilter(bounds, opts?.stateKey))
        .select(FINANCIAL_SELECT)
        .limit(limit)
        .lean<FinancialSiteDoc[]>();

    const markers = docs.map(toFinancialSiteMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
