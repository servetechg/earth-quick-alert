import connectDB from '@/lib/mongodb';
import MapLayerDam from '@/models/MapLayerDam';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import {
    type DamMapMarker,
    NID_CONDITION_LABELS,
    NID_HAZARD_LABELS,
} from '@/lib/gis/layers/dams-types';

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

function bboxCacheKey(bounds: MapBounds): string {
    const r = (n: number) => n.toFixed(3);
    return `map-layer:dams:bbox:${r(bounds.west)},${r(bounds.south)},${r(bounds.east)},${r(bounds.north)}`;
}

export async function invalidateDamsLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:dams:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:dams:bbox:');
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
    const docs = await MapLayerDam.find({ stateKey: usps })
        .select(
            'federalId name lat lng stateKey county publicHazardId conditionAssessId maxStorage damHeight state',
        )
        .lean<DamDoc[]>();

    const markers = docs.map(toDamMapMarker);
    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

/** Evenly sample dams across a large viewport so country-level zoom still shows coverage. */
async function queryDamsByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: DamMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = `${bboxCacheKey(bounds)}:sample:${limit}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<DamMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { latSpan, lngSpan } = boundsSpan(bounds);
    const cols = Math.max(4, Math.min(24, Math.ceil(lngSpan / 2)));
    const rows = Math.max(4, Math.min(16, Math.ceil(latSpan / 2)));
    const perCell = Math.max(1, Math.ceil(limit / (cols * rows)));

    const markers: DamMapMarker[] = [];
    const seen = new Set<string>();
    const cellW = lngSpan / cols;
    const cellH = latSpan / rows;

    await connectDB();

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (markers.length >= limit) break;

            const cellBounds: MapBounds = {
                west: bounds.west + col * cellW,
                east: bounds.west + (col + 1) * cellW,
                south: bounds.south + row * cellH,
                north: bounds.south + (row + 1) * cellH,
            };

            const geoFilter: Record<string, unknown> = {
                location: {
                    $geoWithin: {
                        $geometry: {
                            type: 'Polygon',
                            coordinates: [
                                [
                                    [cellBounds.west, cellBounds.south],
                                    [cellBounds.east, cellBounds.south],
                                    [cellBounds.east, cellBounds.north],
                                    [cellBounds.west, cellBounds.north],
                                    [cellBounds.west, cellBounds.south],
                                ],
                            ],
                        },
                    },
                },
            };

            if (opts?.stateKey) {
                geoFilter.stateKey = opts.stateKey.trim().toUpperCase();
            }

            const docs = await MapLayerDam.find(geoFilter)
                .select(
                    'federalId name lat lng stateKey county publicHazardId conditionAssessId maxStorage damHeight state',
                )
                .limit(perCell)
                .lean<DamDoc[]>();

            for (const doc of docs) {
                if (seen.has(doc.federalId)) continue;
                seen.add(doc.federalId);
                markers.push(toDamMapMarker(doc));
                if (markers.length >= limit) break;
            }
        }
        if (markers.length >= limit) break;
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function queryDamsByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: DamMapMarker[]; cached: boolean }> {
    if (isWideViewport(bounds)) {
        return queryDamsByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = bboxCacheKey(bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<DamMapMarker[]>(cacheKey);
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

    const docs = await MapLayerDam.find(geoFilter)
        .select(
            'federalId name lat lng stateKey county publicHazardId conditionAssessId maxStorage damHeight state',
        )
        .limit(limit)
        .lean<DamDoc[]>();

    const markers = docs.map(toDamMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
