import connectDB from '@/lib/mongodb';
import MapLayerFuelSite from '@/models/MapLayerFuelSite';
import { cacheGetJson, cacheSetJson, cacheDelByPrefix } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import {
    type FuelSiteMapMarker,
    FUEL_ACCESS_LABELS,
    FUEL_STATUS_LABELS,
    FUEL_TYPE_LABELS,
} from '@/lib/gis/layers/fuel-sites-types';

import {
    bboxCacheKey as layerBboxCacheKey,
    buildViewportGrid,
    cellGeoFilter,
    isWideLayerViewport,
    wideSampleCacheKey,
} from '@/lib/gis/layers/map-layer-bounds-utils';

const LAYER = 'fuel-sites';
const STATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MARKERS_BBOX = 1_500;
const MAX_MARKERS_WIDE_SAMPLE = 2_000;

const FUEL_SELECT =
    'stationRecordId name lat lng stateKey city address zip fuelTypeCode accessCode statusCode facilityType phone accessHours';

type FuelSiteDoc = {
    stationRecordId: string;
    name: string;
    lat: number;
    lng: number;
    stateKey: string;
    city?: string;
    address?: string;
    zip?: string;
    fuelTypeCode?: string;
    accessCode?: string;
    statusCode?: string;
    facilityType?: string;
    phone?: string;
    accessHours?: string;
};

function labelFuelType(code: string): string {
    const key = code.trim().toUpperCase();
    return FUEL_TYPE_LABELS[key] ?? (key || 'Unknown');
}

function labelStatus(code: string): string {
    const key = code.trim().toUpperCase();
    return FUEL_STATUS_LABELS[key] ?? (key || 'Unknown');
}

function labelAccess(code: string): string {
    const key = code.trim().toLowerCase();
    return FUEL_ACCESS_LABELS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unknown');
}

function toFuelSiteMapMarker(doc: FuelSiteDoc): FuelSiteMapMarker {
    const city = String(doc.city ?? '').trim();
    const stateKey = String(doc.stateKey ?? '').trim().toUpperCase();
    const address = String(doc.address ?? '').trim();
    const zip = String(doc.zip ?? '').trim();

    const locationParts = [city, stateKey].filter(Boolean);
    const location = locationParts.join(', ');

    return {
        id: `nrel-fuel:${doc.stationRecordId}`,
        stationRecordId: doc.stationRecordId,
        title: doc.name,
        lat: doc.lat,
        lng: doc.lng,
        stateKey,
        city,
        address,
        zip,
        fuelType: labelFuelType(String(doc.fuelTypeCode ?? '')),
        access: labelAccess(String(doc.accessCode ?? '')),
        status: labelStatus(String(doc.statusCode ?? '')),
        facilityType: String(doc.facilityType ?? '').trim(),
        phone: String(doc.phone ?? '').trim(),
        accessHours: String(doc.accessHours ?? '').trim(),
        location: location || stateKey,
    };
}

export async function invalidateFuelSitesLayerCache(stateKey?: string): Promise<void> {
    if (stateKey) {
        await cacheDelByPrefix(`map-layer:fuel-sites:state:${stateKey.trim().toUpperCase()}`);
    }
    await cacheDelByPrefix('map-layer:fuel-sites:bbox:');
    await cacheDelByPrefix('map-layer:fuel-sites:conus:');
}

export async function queryFuelSitesByState(
    stateKey: string,
    opts?: { force?: boolean },
): Promise<{ markers: FuelSiteMapMarker[]; cached: boolean }> {
    const usps = stateKey.trim().toUpperCase();
    const cacheKey = `map-layer:fuel-sites:state:${usps}`;

    if (!opts?.force) {
        const hit = await cacheGetJson<FuelSiteMapMarker[]>(cacheKey);
        if (Array.isArray(hit) && hit.length > 0) {
            return { markers: hit, cached: true };
        }
    }

    await connectDB();
    const docs = await MapLayerFuelSite.find({ stateKey: usps }).select(FUEL_SELECT).lean<FuelSiteDoc[]>();

    const markers = docs.map(toFuelSiteMapMarker);
    if (markers.length > 0) {
        await cacheSetJson(cacheKey, markers, STATE_CACHE_TTL_MS);
    }
    return { markers, cached: false };
}

async function queryFuelSitesByBoundsSampled(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: FuelSiteMapMarker[]; cached: boolean }> {
    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_WIDE_SAMPLE, 1), MAX_MARKERS_WIDE_SAMPLE);
    const cacheKey = wideSampleCacheKey(LAYER, bounds, limit);

    if (!opts?.force) {
        const hit = await cacheGetJson<FuelSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit, cached: true };
    }

    const { perCell, rows, cells } = buildViewportGrid(bounds, limit);
    const markers: FuelSiteMapMarker[] = [];
    const seen = new Set<string>();

    await connectDB();

    for (let row = 0; row < rows; row++) {
        if (markers.length >= limit) break;

        const rowCells = cells.filter((c) => c.row === row);
        const rowResults = await Promise.all(
            rowCells.map((cell) =>
                MapLayerFuelSite.find(cellGeoFilter(cell.bounds, opts?.stateKey))
                    .select(FUEL_SELECT)
                    .limit(perCell)
                    .lean<FuelSiteDoc[]>(),
            ),
        );

        for (const docs of rowResults) {
            for (const doc of docs) {
                if (seen.has(doc.stationRecordId)) continue;
                seen.add(doc.stationRecordId);
                markers.push(toFuelSiteMapMarker(doc));
                if (markers.length >= limit) break;
            }
            if (markers.length >= limit) break;
        }
    }

    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}

export async function queryFuelSitesByBounds(
    bounds: MapBounds,
    opts?: { stateKey?: string; force?: boolean; limit?: number },
): Promise<{ markers: FuelSiteMapMarker[]; cached: boolean }> {
    if (isWideLayerViewport(bounds)) {
        return queryFuelSitesByBoundsSampled(bounds, opts);
    }

    const limit = Math.min(Math.max(opts?.limit ?? MAX_MARKERS_BBOX, 1), MAX_MARKERS_BBOX);
    const cacheKey = layerBboxCacheKey(LAYER, bounds);

    if (!opts?.force) {
        const hit = await cacheGetJson<FuelSiteMapMarker[]>(cacheKey);
        if (hit) return { markers: hit.slice(0, limit), cached: true };
    }

    await connectDB();

    const docs = await MapLayerFuelSite.find(cellGeoFilter(bounds, opts?.stateKey))
        .select(FUEL_SELECT)
        .limit(limit)
        .lean<FuelSiteDoc[]>();

    const markers = docs.map(toFuelSiteMapMarker);
    await cacheSetJson(cacheKey, markers, BBOX_CACHE_TTL_MS);
    return { markers, cached: false };
}
