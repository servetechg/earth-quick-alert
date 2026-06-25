import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes';
import type { GeoJsonFeature } from '@/lib/gis/geojson-map-utils';
import type { HifldNextDatasetDef, HifldNextNormalizedSite } from '@/lib/gis/hifld-next/types';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';

const VALID_STATE_KEYS = new Set(Object.keys(US_STATE_BBOX));

function cleanText(raw: unknown): string {
    const s = String(raw ?? '').trim();
    if (!s || s === ' ' || s.toUpperCase() === 'NOT AVAILABLE') return '';
    return s;
}

function pickField(props: Record<string, unknown>, fields: string[]): string {
    const lowerMap = new Map<string, unknown>();
    for (const [key, value] of Object.entries(props)) {
        lowerMap.set(key.toLowerCase(), value);
    }

    for (const field of fields) {
        const val = cleanText(lowerMap.get(field.toLowerCase()));
        if (val) return val;
    }
    return '';
}

function parseCoord(raw: unknown): number | null {
    if (raw == null) return null;
    const s = typeof raw === 'number' ? String(raw) : String(raw).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function isValidWgsCoord(lat: number, lng: number): boolean {
    if (lat === 0 && lng === 0) return false;
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function resolveCoords(
    props: Record<string, unknown>,
    latFields: string[],
    lngFields: string[],
    geometry: GeoJsonFeature['geometry'],
): { lat: number; lng: number } | null {
    let lat = parseCoord(pickField(props, latFields));
    let lng = parseCoord(pickField(props, lngFields));
    if (lat != null && lng != null && isValidWgsCoord(lat, lng)) {
        return { lat, lng };
    }

    const fromGeom = coordsFromGeometry(geometry);
    if (fromGeom && isValidWgsCoord(fromGeom.lat, fromGeom.lng)) {
        return fromGeom;
    }

    return null;
}

function coordsFromGeometry(geometry: GeoJsonFeature['geometry']): { lat: number; lng: number } | null {
    if (!geometry) return null;

    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
        const [lng, lat] = geometry.coordinates as [number, number];
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        return null;
    }

    if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
        const [lng, lat] = geometry.coordinates[0] as [number, number];
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
        const ring = geometry.coordinates[0] as number[][];
        if (!ring?.length) return null;
        let sumLat = 0;
        let sumLng = 0;
        let n = 0;
        for (const coord of ring) {
            const lng = coord[0];
            const lat = coord[1];
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                sumLat += lat;
                sumLng += lng;
                n += 1;
            }
        }
        if (n > 0) return { lat: sumLat / n, lng: sumLng / n };
    }

    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
        const mid = geometry.coordinates[Math.floor(geometry.coordinates.length / 2)] as number[];
        const lng = mid[0];
        const lat = mid[1];
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    return null;
}

function normalizeStateKey(raw: string, fallback?: string): string | null {
    const upper = raw.trim().toUpperCase();
    if (upper.length === 2 && VALID_STATE_KEYS.has(upper)) return upper;
    const fb = fallback?.trim().toUpperCase() ?? '';
    if (fb.length === 2 && VALID_STATE_KEYS.has(fb)) return fb;
    return null;
}

function buildFacilityId(
    props: Record<string, unknown>,
    featureId: string | number | undefined,
    dataset: HifldNextDatasetDef,
): string | null {
    if (dataset.compoundIdFields?.length) {
        const parts: string[] = [];
        for (const field of dataset.compoundIdFields) {
            const val = pickField(props, [field]);
            if (val) parts.push(val);
        }
        if (parts.length > 0) return parts.join('-');
    }

    const idFields = dataset.idFields ?? ['ID', 'OBJECTID', 'FID', 'GLOBALID', 'FACILITY_ID', 'PLANT_CODE'];
    return pickField(props, idFields) || String(featureId ?? '').trim() || null;
}

export function normalizeHifldNextFeature(
    feature: GeoJsonFeature,
    sectorId: CriticalInfraSectorId,
    dataset: HifldNextDatasetDef,
): HifldNextNormalizedSite | null {
    const props = (feature.properties ?? {}) as Record<string, unknown>;

    if (dataset.includeFeature && !dataset.includeFeature(props)) {
        return null;
    }

    const stateFields = dataset.stateFields ?? ['STATE', 'STATE_CODE', 'STALP', 'ST', 'CWP_STATE'];
    const latFields = dataset.latFields ?? ['LATITUDE', 'LAT', 'Y', 'FAC_LAT'];
    const lngFields = dataset.lngFields ?? ['LONGITUDE', 'LONG', 'LON', 'X', 'FAC_LONG'];
    const titleFields = dataset.titleFields;
    const cityFields = dataset.cityFields ?? ['CITY', 'CITY_NAME', 'CWP_CITY'];
    const addressFields = dataset.addressFields ?? ['ADDRESS', 'LOCATION_ADDRESS', 'LOC_ADDRESS', 'STREET'];
    const zipFields = dataset.zipFields ?? ['ZIP', 'ZIPCODE', 'ZIP_CODE'];
    const statusFields = dataset.statusFields ?? ['STATUS', 'ACTIVE_STATUS', 'OPERATIONAL_STATUS'];

    const rawId = buildFacilityId(props, feature.id, dataset);
    if (!rawId) return null;

    const name = pickField(props, titleFields);
    if (!name) return null;

    const stateKey = normalizeStateKey(pickField(props, stateFields));
    if (!stateKey) return null;

    const coords = resolveCoords(props, latFields, lngFields, feature.geometry);
    if (!coords) return null;
    const { lat, lng } = coords;

    if (!isValidWgsCoord(lat, lng)) return null;

    const facilityId = `${dataset.idPrefix}:${rawId}`;

    return {
        facilityId,
        sectorId,
        name,
        stateKey,
        lat,
        lng,
        city: pickField(props, cityFields),
        address: pickField(props, addressFields),
        zip: pickField(props, zipFields).slice(0, 10),
        status: pickField(props, statusFields) || 'Active',
        datasetSlug: dataset.slug,
        properties: props,
    };
}
