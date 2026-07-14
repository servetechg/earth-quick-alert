import connectDB from '@/lib/mongodb';
import MapLayerHifldSite from '@/models/MapLayerHifldSite';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';
import type { HifldSiteMapMarker } from '@/lib/gis/hifld-next/types';
import {
    fetchLiveHifldSupplementMarkers,
    filterLiveHifldMarkersByBounds,
    filterLiveHifldMarkersByState,
    resolveLiveHifldSupplements,
} from '@/lib/gis/layers/hifld-next-live-query';
import {
    bboxCacheKey as layerBboxCacheKey,
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const LAYER = 'hifld-sites';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

const HIFLD_SELECT =
    'facilityId sectorId name lat lng stateKey city address zip status datasetSlug';

type HifldSiteDoc = {
    facilityId: string;
    sectorId: CriticalInfraSectorId;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    city?: string;
    address?: string;
    zip?: string;
    status?: string;
    datasetSlug?: string;
};

function toHifldSiteMapMarker(doc: HifldSiteDoc): HifldSiteMapMarker {
    const city = String(doc.city ?? '').trim();
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();
    const address = String(doc.address ?? '').trim();

    return {
        id: `hifld:${doc.sectorId}:${doc.facilityId}`,
        facilityId: doc.facilityId,
        sectorId: doc.sectorId,
        title: doc.name,
        lat: doc.lat,
        lng: doc.lng,
        stateKey,
        city,
        address,
        zip: String(doc.zip ?? '').trim(),
        status: String(doc.status ?? '').trim() || 'Active',
        location: city ? `${city}, ${stateKey}` : stateKey,
        datasetSlug: String(doc.datasetSlug ?? '').trim() || undefined,
    };
}

function sectorCacheKey(sectors: CriticalInfraSectorId[], datasetSlugs?: string[]): string {
    const sectorPart = [...sectors].sort().join(',');
    if (!datasetSlugs?.length) return sectorPart;
    return `${sectorPart}:${[...datasetSlugs].sort().join(',')}`;
}

function mongoSectorFilter(
    sectors: CriticalInfraSectorId[],
    datasetSlugs?: string[],
): Record<string, unknown> {
    const filter: Record<string, unknown> = { sectorId: { $in: sectors } };
    if (datasetSlugs?.length) {
        filter.datasetSlug = { $in: datasetSlugs };
    }
    return filter;
}

async function getHifldMongoCountsBySector(
    sectors: CriticalInfraSectorId[],
): Promise<Map<CriticalInfraSectorId, number>> {
    await connectDB();
    const counts = new Map<CriticalInfraSectorId, number>();

    await Promise.all(
        sectors.map(async (sectorId) => {
            const count = await MapLayerHifldSite.countDocuments({ sectorId });
            counts.set(sectorId, count);
        }),
    );

    return counts;
}

async function hasIntermodalTransportationInMongo(): Promise<boolean> {
    await connectDB();
    const count = await MapLayerHifldSite.countDocuments({
        sectorId: 'ci_transportation',
        datasetSlug: 'intermodal-passenger-connectivity-database-ipcd',
    });
    return count > 0;
}

async function loadHifldLiveSupplementMarkers(
    sectors: CriticalInfraSectorId[],
    opts?: { force?: boolean },
) {
    const mongoCounts = await getHifldMongoCountsBySector(sectors);
    const intermodalInMongo = sectors.includes('ci_transportation')
        ? await hasIntermodalTransportationInMongo()
        : true;

    const supplements = await resolveLiveHifldSupplements(
        sectors,
        mongoCounts,
        intermodalInMongo,
    );

    if (supplements.length === 0) {
        return { markers: [], mongoCounts, supplements: [] as typeof supplements };
    }

    const markers = await fetchLiveHifldSupplementMarkers(supplements, opts);
    return { markers, mongoCounts, supplements };
}

function mergeMarkers(
    primary: HifldSiteMapMarker[],
    supplemental: HifldSiteMapMarker[],
): HifldSiteMapMarker[] {
    if (supplemental.length === 0) return primary;
    const seen = new Set(primary.map((m) => `${m.sectorId}:${m.facilityId}`));
    const merged = [...primary];
    for (const marker of supplemental) {
        const key = `${marker.sectorId}:${marker.facilityId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(marker);
    }
    return merged;
}

async function appendLiveSupplementMarkers(
    sectors: CriticalInfraSectorId[],
    bounds: MapBounds,
    markers: HifldSiteMapMarker[],
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<HifldSiteMapMarker[]> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_WIDE_SAMPLE);
    const { markers: liveMarkers } = await loadHifldLiveSupplementMarkers(sectors, {
        force: opts?.force,
    });
    return mergeMarkers(
        markers,
        filterLiveHifldMarkersByBounds(liveMarkers, bounds, {
            stateKey: opts?.stateKey,
            limit: Math.max(limit - markers.length, 0),
        }),
    ).slice(0, limit);
}

export async function invalidateHifldSitesLayerCache(
    sectorId?: CriticalInfraSectorId,
    stateKey?: string,
): Promise<void> {
    if (sectorId && stateKey) {
        await cacheDelByPrefix(
            `map-layer:hifld-sites:state:${sectorId}:${stateKey.trim().toUpperCase()}`,
        );
    } else if (sectorId) {
        await cacheDelByPrefix(`map-layer:hifld-sites:state:${sectorId}:`);
    }
    await cacheDelByPrefix('map-layer:hifld-sites:bbox:');
    await cacheDelByPrefix('map-layer:hifld-sites:conus:');
    await cacheDelByPrefix('map-layer:hifld-next-live:');
}

export async function queryHifldSitesByState(
    sectors: CriticalInfraSectorId[],
    stateKey: string,
    opts?: { force?: boolean; datasetSlugs?: string[] },
): Promise<{ markers: HifldSiteMapMarker[]; cached: boolean }> {
    const usps = stateKey.trim().toUpperCase();
    const sectorKey = sectorCacheKey(sectors, opts?.datasetSlugs);
    const cacheKey = `map-layer:hifld-sites:state:${sectorKey}:${usps}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<HifldSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    await connectDB();
    const docs = await MapLayerHifldSite.find({
        ...mongoSectorFilter(sectors, opts?.datasetSlugs),
        stateKey: usps,
    })
        .select(HIFLD_SELECT)
        .lean<HifldSiteDoc[]>();

    let markers = docs.map(toHifldSiteMapMarker);

    if (!opts?.datasetSlugs?.length) {
        const { markers: liveMarkers } = await loadHifldLiveSupplementMarkers(sectors, {
            force: opts?.force,
        });
        markers = mergeMarkers(
            markers,
            filterLiveHifldMarkersByState(liveMarkers, usps),
        );
    }

    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

async function queryHifldSitesByBoundsSampled(
    sectors: CriticalInfraSectorId[],
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number; datasetSlugs?: string[] },
): Promise<{ markers: HifldSiteMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const sectorKey = sectorCacheKey(sectors, opts?.datasetSlugs);
    const cacheKey = wideSampleCacheKey(`${LAYER}:${sectorKey}`, bounds, limit);

    if (!opts?.force) {
        const hit = await cacheGetJson<HifldSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
    const markers: HifldSiteMapMarker[] = [];
    const seen = new Set<string>();

    await connectDB();

    for (let row = 0; row < rows; row++) {
        if (markers.length >= limit) break;

        const rowCells = cells.filter((c) => c.row === row);
        const rowResults = await Promise.all(
            rowCells.map((cell) => {
                const geo = cellGeoFilter(cell.bounds, opts?.stateKey);
                return MapLayerHifldSite.find({
                    ...geo,
                    ...mongoSectorFilter(sectors, opts?.datasetSlugs),
                })
                    .select(HIFLD_SELECT)
                    .limit(perCell)
                    .lean<HifldSiteDoc[]>();
            }),
        );

        for (const docs of rowResults) {
            for (const doc of docs) {
                const key = `${doc.sectorId}:${doc.facilityId}`;
                if (seen.has(key)) continue;
                seen.add(key);
                markers.push(toHifldSiteMapMarker(doc));
                if (markers.length >= limit) break;
            }
            if (markers.length >= limit) break;
        }
    }

    const merged = opts?.datasetSlugs?.length
        ? markers
        : await appendLiveSupplementMarkers(sectors, bounds, markers, opts);
    await cacheSetJson(cacheKey, merged, BBOX_CACHE_TTL_MS);
    return { markers: merged, cached: false };
}

export async function queryHifldSitesByBounds(
    sectors: CriticalInfraSectorId[],
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number; datasetSlugs?: string[] },
): Promise<{ markers: HifldSiteMapMarker[]; cached: boolean }> {
    if (sectors.length === 0) {
        return { markers: [], cached: false };
    }

    if (isWideLayerViewport(bounds)) {
        return queryHifldSitesByBoundsSampled(sectors, bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const sectorKey = sectorCacheKey(sectors, opts?.datasetSlugs);
    const cacheKey = `${layerBboxCacheKey(LAYER, bounds)}:${sectorKey}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<HifldSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const geo = cellGeoFilter(bounds, opts?.stateKey);
    const docs = await MapLayerHifldSite.find({
        ...geo,
        ...mongoSectorFilter(sectors, opts?.datasetSlugs),
    })
        .select(HIFLD_SELECT)
        .limit(limit)
        .lean<HifldSiteDoc[]>();

    let markers = docs.map(toHifldSiteMapMarker);
    markers = opts?.datasetSlugs?.length
        ? markers.slice(0, limit)
        : await appendLiveSupplementMarkers(sectors, bounds, markers, { ...opts, limit });
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
