import connectDB from '@/lib/mongodb';
import MapLayerChemicalSite from '@/models/MapLayerChemicalSite';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import {
    type ChemicalSiteMapMarker,
    EPA_FRS_PROGRAM_LABELS,
} from '@/lib/gis/layers/chemical-sites-types';
import {
    bboxCacheKey as layerBboxCacheKey,
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const LAYER = 'chemical-sites';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

const CHEMICAL_SELECT =
    'registryId name lat lng stateKey county city address zip programAcronym supplementalLocation';

type ChemicalSiteDoc = {
    registryId: string;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    county?: string;
    city?: string;
    address?: string;
    zip?: string;
    programAcronym?: string;
    supplementalLocation?: string;
};

function labelProgram(acronym: string): string {
    const key = acronym.trim().toUpperCase();
    return EPA_FRS_PROGRAM_LABELS[key] ?? (key || 'EPA FRS');
}

function toChemicalSiteMapMarker(doc: ChemicalSiteDoc): ChemicalSiteMapMarker {
    const county = String(doc.county ?? '').trim();
    const city = String(doc.city ?? '').trim();
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();
    const address = String(doc.address ?? '').trim();
    const zip = String(doc.zip ?? '').trim();
    const programAcronym = String(doc.programAcronym ?? 'SEMS').trim().toUpperCase();

    const locationParts = [city, county ? `${county}` : '', stateKey].filter(Boolean);

    return {
        id: `epa-frs:${doc.registryId}`,
        registryId: doc.registryId,
        title: doc.name,
        lat: doc.lat,
        lng: doc.lng,
        stateKey,
        county,
        city,
        address,
        zip,
        programAcronym: labelProgram(programAcronym),
        location: locationParts.join(', ') || stateKey,
    };
}

export async function invalidateChemicalSitesLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:chemical-sites:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:chemical-sites:bbox:');
    await cacheDelByPrefix('map-layer:chemical-sites:conus:');
}

export async function queryChemicalSitesByState(
    stateKey: string,
    opts?: { force?: boolean },
): Promise<{ markers: ChemicalSiteMapMarker[]; cached: boolean }> {
    const usps = stateKey.trim().toUpperCase();
    const cacheKey = `map-layer:chemical-sites:state:${usps}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<ChemicalSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    await connectDB();
    const docs = await MapLayerChemicalSite.find({ stateKey: usps })
        .select(CHEMICAL_SELECT)
        .lean<ChemicalSiteDoc[]>();

    const markers = docs.map(toChemicalSiteMapMarker);
    await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    return { markers, cached: false };
}

async function queryChemicalSitesByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ChemicalSiteMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = wideSampleCacheKey(LAYER, bounds, limit);

    if (!opts?.force) {
        const hit = await cacheGetJson<ChemicalSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
    const markers: ChemicalSiteMapMarker[] = [];
    const seen = new Set<string>();

    await connectDB();

    for (let row = 0; row < rows; row++) {
        if (markers.length >= limit) break;

        const rowCells = cells.filter((c) => c.row === row);
        const rowResults = await Promise.all(
            rowCells.map((cell) =>
                MapLayerChemicalSite.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                    .select(CHEMICAL_SELECT)
                    .limit(perCell)
                    .lean<ChemicalSiteDoc[]>(),
            ),
        );

        for (const docs of rowResults) {
            for (const doc of docs) {
                if (seen.has(doc.registryId)) continue;
                seen.add(doc.registryId);
                markers.push(toChemicalSiteMapMarker(doc));
                if (markers.length >= limit) break;
            }
            if (markers.length >= limit) break;
        }
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function queryChemicalSitesByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: ChemicalSiteMapMarker[]; cached: boolean }> {
    if (isWideLayerViewport(bounds)) {
        return queryChemicalSitesByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = layerBboxCacheKey(LAYER, bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<ChemicalSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const docs = await MapLayerChemicalSite.find(cellGeoFilter(bounds, opts?.stateKey))
        .select(CHEMICAL_SELECT)
        .limit(limit)
        .lean<ChemicalSiteDoc[]>();

    const markers = docs.map(toChemicalSiteMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
