import connectDB from '@/lib/mongodb';
import MapLayerDam from '@/models/MapLayerDam';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import {
    bboxCacheKey as layerBboxCacheKey,
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';
import {
    type DamMapMarker,
    NID_CONDITION_LABELS,
    NID_HAZARD_LABELS,
} from '@/lib/gis/layers/dams-types';

const LAYER = 'dams';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

const DAM_SELECT =
    'federalId name lat lng stateKey county publicHazardId conditionAssessId maxStorage damHeight state';

type DamDoc = {
    federalId: string;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    county: string;
    publicHazardId?: string;
    conditionAssessId?: string;
    maxStorage?: number | null;
    damHeight?: number | null;
    state?: string;
};

function toDamMapMarker(doc: DamDoc): DamMapMarker {
    const hazardId = String(doc.publicHazardId ?? '').trim();
    const conditionId = String(doc.conditionAssessId ?? '').trim();
    const county = String(doc.county ?? '').trim();
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();

    return {
        id: `nid:${doc.federalId}`,
        federalId: doc.federalId,
        title: doc.name,
        lat: doc.lat,
        lng: doc.lng,
        stateKey,
        county,
        hazardClass: NID_HAZARD_LABELS[hazardId] ?? (hazardId ? `Class ${hazardId}` : 'Unknown'),
        condition: NID_CONDITION_LABELS[conditionId] ?? (conditionId ? `Code ${conditionId}` : 'Unknown'),
        maxStorage: doc.maxStorage ?? null,
        damHeight: doc.damHeight ?? null,
        location: county ? `${county}, ${stateKey}` : stateKey,
    };
}

export async function invalidateDamsLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:dams:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:dams:bbox:');
    await cacheDelByPrefix('map-layer:dams:conus:');
}

export async function queryDamsByState(
    stateKey: string,
    opts?: { force?: boolean },
): Promise<{ markers: DamMapMarker[]; cached: boolean }> {
    const usps = stateKey.trim().toUpperCase();
    const cacheKey = `map-layer:dams:state:${usps}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<DamMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    await connectDB();
    const docs = await MapLayerDam.find({ stateKey: usps }).select(DAM_SELECT).lean<DamDoc[]>();

    const markers = docs.map(toDamMapMarker);
    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

async function queryDamsByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: DamMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = wideSampleCacheKey(LAYER, bounds, limit);

    if (!opts?.force) {
        const hit = await cacheGetJson<DamMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
    const markers: DamMapMarker[] = [];
    const seen = new Set<string>();

    await connectDB();

    for (let row = 0; row < rows; row++) {
        if (markers.length >= limit) break;

        const rowCells = cells.filter((c) => c.row === row);
        const rowResults = await Promise.all(
            rowCells.map((cell) =>
                MapLayerDam.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                    .select(DAM_SELECT)
                    .limit(perCell)
                    .lean<DamDoc[]>(),
            ),
        );

        for (const docs of rowResults) {
            for (const doc of docs) {
                if (seen.has(doc.federalId)) continue;
                seen.add(doc.federalId);
                markers.push(toDamMapMarker(doc));
                if (markers.length >= limit) break;
            }
            if (markers.length >= limit) break;
        }
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function queryDamsByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: DamMapMarker[]; cached: boolean }> {
    if (isWideLayerViewport(bounds)) {
        return queryDamsByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = layerBboxCacheKey(LAYER, bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<DamMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const docs = await MapLayerDam.find(cellGeoFilter(bounds, opts?.stateKey))
        .select(DAM_SELECT)
        .limit(limit)
        .lean<DamDoc[]>();

    const markers = docs.map(toDamMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
