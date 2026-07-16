import type { Model } from 'mongoose';
import connectDB from '@/lib/mongodb';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import type { StaticPlaceMapMarker } from '@/lib/gis/layers/static-google-places-types';
import {
    bboxCacheKey as layerBboxCacheKey,
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

const DOC_SELECT = 'placeId name lat lng stateKey address phone';

type StaticPlaceDoc = {
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    address?: string;
    phone?: string;
};

export type StaticPlacesQueryApi = {
    queryByState: (
        stateKey: string,
        opts?: { force?: boolean },
    ) => Promise<{ markers: StaticPlaceMapMarker[]; cached: boolean }>;
    queryByBounds: (
        bounds: MapBounds,
        opts?: { stateKey?: string; force?: boolean; limit?: number },
    ) => Promise<{ markers: StaticPlaceMapMarker[]; cached: boolean }>;
    invalidateCache: (stateKey?: string) => Promise<void>;
};

function toMarker(idPrefix: string, doc: StaticPlaceDoc): StaticPlaceMapMarker {
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();
    const address = String(doc.address ?? '').trim();
    const phone = String(doc.phone ?? '').trim();

    return {
        id: `${idPrefix}:${doc.placeId}`,
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

export function createStaticPlacesQuery(
    layerKey: string,
    idPrefix: string,
    Model: Model<unknown>,
): StaticPlacesQueryApi {
    async function invalidateCache(stateKey?: string): Promise<void> {
        if (stateKey) {
            await cacheDelByPrefix(`map-layer:${layerKey}:state:${stateKey.trim().toUpperCase()}`);
        }
        await cacheDelByPrefix(`map-layer:${layerKey}:bbox:`);
        await cacheDelByPrefix(`map-layer:${layerKey}:conus:`);
    }

    async function queryByState(
        stateKey: string,
        opts?: { force?: boolean },
    ): Promise<{ markers: StaticPlaceMapMarker[]; cached: boolean }> {
        const usps = stateKey.trim().toUpperCase();
        const cacheKey = `map-layer:${layerKey}:state:${usps}`;

        if (!opts?.force) {
            const hit = await cacheGetJson<StaticPlaceMapMarker[]>(cacheKey);
            if (hit) return { markers: hit, cached: true };
        }

        await connectDB();
        const docs = await Model.find({ stateKey: usps }).select(DOC_SELECT).lean<StaticPlaceDoc[]>();
        const markers = docs.map((doc) => toMarker(idPrefix, doc));
        await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
        return { markers, cached: false };
    }

    async function queryByBoundsSampled(
        bounds: MapBounds,
        opts?: { stateKey?: string; force?: boolean; limit?: number },
    ): Promise<{ markers: StaticPlaceMapMarker[]; cached: boolean }> {
        const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
        const cacheKey = wideSampleCacheKey(layerKey, bounds, limit);

        if (!opts?.force) {
            const hit = await cacheGetJson<StaticPlaceMapMarker[]>(cacheKey);
            if (hit) return { markers: hit, cached: true };
        }

        const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
        const markers: StaticPlaceMapMarker[] = [];
        const seen = new Set<string>();

        await connectDB();

        for (let row = 0; row < rows; row++) {
            if (markers.length >= limit) break;

            const rowCells = cells.filter((c) => c.row === row);
            const rowResults = await Promise.all(
                rowCells.map((cell) =>
                    Model.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                        .select(DOC_SELECT)
                        .limit(perCell)
                        .lean<StaticPlaceDoc[]>(),
                ),
            );

            for (const docs of rowResults) {
                for (const doc of docs) {
                    if (seen.has(doc.placeId)) continue;
                    seen.add(doc.placeId);
                    markers.push(toMarker(idPrefix, doc));
                    if (markers.length >= limit) break;
                }
                if (markers.length >= limit) break;
            }
        }

        await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
        return { markers, cached: false };
    }

    async function queryByBounds(
        bounds: MapBounds,
        opts?: { stateKey?: string; force?: boolean; limit?: number },
    ): Promise<{ markers: StaticPlaceMapMarker[]; cached: boolean }> {
        if (isWideLayerViewport(bounds)) {
            return queryByBoundsSampled(bounds, opts);
        }

        const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
        const cacheKey = layerBboxCacheKey(layerKey, bounds);

        if (!opts?.force) {
            const hit = await cacheGetJson<StaticPlaceMapMarker[]>(cacheKey);
            if (hit) return { markers: hit.slice(0, limit), cached: true };
        }

        await connectDB();
        const docs = await Model.find(cellGeoFilter(bounds, opts?.stateKey))
            .select(DOC_SELECT)
            .limit(limit)
            .lean<StaticPlaceDoc[]>();

        const markers = docs.map((doc) => toMarker(idPrefix, doc));
        await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
        return { markers, cached: false };
    }

    return { queryByState, queryByBounds, invalidateCache };
}
