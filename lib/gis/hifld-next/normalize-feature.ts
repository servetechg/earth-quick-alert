import { pointInUsStateBBox, US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes';
import type { GeoJsonFeature } from '@/lib/gis/geojson-map-utils';
import type { HifldNextDatasetDef, HifldNextNormalizedSite } from '@/lib/gis/hifld-next/types';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';

const VALID_STATE_KEYS = new Set(Object.keys(US_STATE_BBOX));
const WEB_MERCATOR_HALF = 20037508.342789244;

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

function looksLikeWebMercator(x: number, y: number): boolean {
    return Math.abs(x) > 180 || Math.abs(y) > 90;
}

/** EPSG:3857 (Web Mercator) → WGS84. HIFLD Next exports some layers in projected meters. */
function webMercatorToWgs84(x: number, y: number): { lat: number; lng: number } {
    const lng = (x / WEB_MERCATOR_HALF) * 180;
    const latRad = Math.atan(Math.sinh((Math.PI * y) / WEB_MERCATOR_HALF));
    const lat = (latRad * 180) / Math.PI;
    return { lat, lng };
}

/** GeoJSON coordinates are [x, y] = [lng, lat] in WGS84, or Web Mercator meters. */
function normalizeCoordPair(x: number, y: number): { lat: number; lng: number } | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    if (isValidWgsCoord(y, x)) {
        return { lat: y, lng: x };
    }

    if (looksLikeWebMercator(x, y)) {
        const converted = webMercatorToWgs84(x, y);
        if (isValidWgsCoord(converted.lat, converted.lng)) {
            return converted;
        }
    }

    return null;
}

function normalizeStateKey(raw: string, fallback?: string): string | null {
    const fromRaw = normalizeStateToUsps(raw);
    if (fromRaw && VALID_STATE_KEYS.has(fromRaw)) return fromRaw;
    const fromFallback = normalizeStateToUsps(fallback);
    if (fromFallback && VALID_STATE_KEYS.has(fromFallback)) return fromFallback;
    return null;
}

/** Infer state from strings like "Acme - Chambersburg, Pennsylvania" or "Springfield, IL". */
function inferStateFromText(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const trailing = trimmed.match(/,\s*([^,]+)$/);
    if (trailing) {
        const key = normalizeStateKey(trailing[1]!);
        if (key) return key;
    }

    const tokens = trimmed.split(/[\s,–—-]+/).filter(Boolean);
    for (let i = tokens.length - 1; i >= 0; i--) {
        const key = normalizeStateKey(tokens[i]!);
        if (key) return key;
    }

    return null;
}

function bboxArea(bbox: readonly [number, number, number, number]): number {
    const [west, south, east, north] = bbox;
    return (east - west) * (north - south);
}

/** Last-resort state when properties omit STATE but geometry is valid WGS84. */
function inferStateFromCoordinates(lng: number, lat: number): string | null {
    const matches: string[] = [];
    for (const code of Object.keys(US_STATE_BBOX)) {
        if (pointInUsStateBBox(lng, lat, code)) {
            matches.push(code);
        }
    }
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0]!;

    matches.sort(
        (a, b) => bboxArea(US_STATE_BBOX[a]!) - bboxArea(US_STATE_BBOX[b]!),
    );
    return matches[0]!;
}

function resolveStateKey(
    props: Record<string, unknown>,
    dataset: HifldNextDatasetDef,
    name: string,
    coords?: { lat: number; lng: number } | null,
): string | null {
    const stateFields = dataset.stateFields ?? ['STATE', 'STATE_CODE', 'STALP', 'ST', 'CWP_STATE'];
    const direct = normalizeStateKey(pickField(props, stateFields));
    if (direct) return direct;

    for (const field of dataset.stateFromTextFields ?? []) {
        const inferred = inferStateFromText(pickField(props, [field]));
        if (inferred) return inferred;
    }

    const fromName = inferStateFromText(name);
    if (fromName) return fromName;

    if (coords && dataset.inferStateFromCoords !== false) {
        return inferStateFromCoordinates(coords.lng, coords.lat);
    }

    return null;
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

function coordsFromRing(ring: number[][]): { lat: number; lng: number } | null {
    if (!ring?.length) return null;
    let sumLat = 0;
    let sumLng = 0;
    let n = 0;
    for (const coord of ring) {
        const parsed = normalizeCoordPair(coord[0]!, coord[1]!);
        if (!parsed) continue;
        sumLat += parsed.lat;
        sumLng += parsed.lng;
        n += 1;
    }
    if (n === 0) return null;
    return { lat: sumLat / n, lng: sumLng / n };
}

function coordsFromGeometry(geometry: GeoJsonFeature['geometry']): { lat: number; lng: number } | null {
    if (!geometry) return null;

    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
        const [x, y] = geometry.coordinates as [number, number];
        return normalizeCoordPair(x, y);
    }

    if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
        const [x, y] = geometry.coordinates[0] as [number, number];
        return normalizeCoordPair(x, y);
    }

    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
        return coordsFromRing(geometry.coordinates[0] as number[][]);
    }

    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
        const firstPoly = geometry.coordinates[0] as number[][][];
        if (firstPoly?.[0]) return coordsFromRing(firstPoly[0]!);
    }

    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
        const mid = geometry.coordinates[Math.floor(geometry.coordinates.length / 2)] as number[];
        return normalizeCoordPair(mid[0]!, mid[1]!);
    }

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

function isUsableTitle(name: string): boolean {
    const upper = name.trim().toUpperCase();
    return Boolean(name) && upper !== 'NA' && upper !== 'N/A' && upper !== 'UNKNOWN';
}

const FALLBACK_TITLE_FIELDS = [
    'LOCATION_CODE',
    'FACILITY_NAME',
    'SITE_NAME',
    'NAME',
    'TERMINAL',
    'FACILITY',
    'FACILITY_C',
    'PORT',
    'COMPANY',
    'COMPANY_NA',
    'LOCID',
];

function resolveTitle(props: Record<string, unknown>, titleFields: string[]): string {
    let name = pickField(props, titleFields);
    if (isUsableTitle(name)) return name;

    name = pickField(props, FALLBACK_TITLE_FIELDS);
    if (isUsableTitle(name)) return name;

    const locid = pickField(props, ['LOCID', 'LOCATION_CODE', 'UNLOCODE']);
    const facility = pickField(props, ['FACILITY_C', 'FACILITY', 'FACILITY_NAME', 'TERMINAL', 'PORT']);
    if (locid && facility) return `${locid} - ${facility}`;
    if (facility) return facility;
    if (locid) return locid;

    return '';
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

    const latFields = dataset.latFields ?? ['LATITUDE', 'LAT', 'FAC_LAT'];
    const lngFields = dataset.lngFields ?? ['LONGITUDE', 'LONG', 'LON', 'FAC_LONG'];
    const titleFields = dataset.titleFields;
    const cityFields = dataset.cityFields ?? ['CITY', 'CITY_NAME', 'CWP_CITY'];
    const addressFields = dataset.addressFields ?? ['ADDRESS', 'LOCATION_ADDRESS', 'LOC_ADDRESS', 'STREET'];
    const zipFields = dataset.zipFields ?? ['ZIP', 'ZIPCODE', 'ZIP_CODE'];
    const statusFields = dataset.statusFields ?? ['STATUS', 'ACTIVE_STATUS', 'OPERATIONAL_STATUS'];

    const rawId = buildFacilityId(props, feature.id, dataset);
    if (!rawId) return null;

    const name = resolveTitle(props, titleFields);
    if (!isUsableTitle(name)) return null;

    const coords = resolveCoords(props, latFields, lngFields, feature.geometry);
    if (!coords) return null;
    const { lat, lng } = coords;

    const stateKey = resolveStateKey(props, dataset, name, coords);
    if (!stateKey) return null;

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
