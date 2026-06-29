import connectDB from '@/lib/mongodb';
import MapLayerPoliceStation from '@/models/MapLayerPoliceStation';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import type { PoliceStationMapMarker } from '@/lib/gis/layers/police-stations-types';
import {
    bboxCacheKey as layerBboxCacheKey,
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const LAYER = 'police-stations';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

const POLICE_SELECT = 'placeId name lat lng stateKey address';

type PoliceDoc = {
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    address?: string;
};

function toPoliceStationMapMarker(doc: PoliceDoc): PoliceStationMapMarker {
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();
    const address = String(doc.address ?? '').trim();

    return {
        id: `police:${doc.placeId}`,
        placeId: doc.placeId,
        title: doc.name,
        lat: doc.lat,
        lng: doc.lng,
        stateKey,
        address,
        location: address || stateKey,
    };
}

export async function invalidatePoliceStationsLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:police-stations:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:police-stations:bbox:');
    await cacheDelByPrefix('map-layer:police-stations:conus:');
}

export async function queryPoliceStationsByState(
    stateKey: string,
    opts?: { force?: boolean },
): Promise<{ markers: PoliceStationMapMarker[]; cached: boolean }> {
    const usps = stateKey.trim().toUpperCase();
    const cacheKey = `map-layer:police-stations:state:${usps}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<PoliceStationMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    await connectDB();
    const docs = await MapLayerPoliceStation.find({ stateKey: usps })
        .select(POLICE_SELECT)
        .lean<PoliceDoc[]>();

    const markers = docs.map(toPoliceStationMapMarker);
    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

async function queryPoliceStationsByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: PoliceStationMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = wideSampleCacheKey(LAYER, bounds, limit);

    if (!opts?.force) {
        const hit = await cacheGetJson<PoliceStationMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
    const markers: PoliceStationMapMarker[] = [];
    const seen = new Set<string>();

    await connectDB();

    for (let row = 0; row < rows; row++) {
        if (markers.length >= limit) break;

        const rowCells = cells.filter((c) => c.row === row);
        const rowResults = await Promise.all(
            rowCells.map((cell) =>
                MapLayerPoliceStation.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                    .select(POLICE_SELECT)
                    .limit(perCell)
                    .lean<PoliceDoc[]>(),
            ),
        );

        for (const docs of rowResults) {
            for (const doc of docs) {
                if (seen.has(doc.placeId)) continue;
                seen.add(doc.placeId);
                markers.push(toPoliceStationMapMarker(doc));
                if (markers.length >= limit) break;
            }
            if (markers.length >= limit) break;
        }
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function queryPoliceStationsByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: PoliceStationMapMarker[]; cached: boolean }> {
    if (isWideLayerViewport(bounds)) {
        return queryPoliceStationsByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = layerBboxCacheKey(LAYER, bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<PoliceStationMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const docs = await MapLayerPoliceStation.find(cellGeoFilter(bounds, opts?.stateKey))
        .select(POLICE_SELECT)
        .limit(limit)
        .lean<PoliceDoc[]>();

    const markers = docs.map(toPoliceStationMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
