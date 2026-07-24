/**
 * Approximate WGS84 envelopes (west, south, east, north) for selected US counties.
 * Used for sub-admin county coverage (map lock + marker filter).
 *
 * Key: `${USPS}:${countyStem}` where countyStem is lowercase without "county".
 */
export type CountyBbox = readonly [number, number, number, number];

const US_COUNTY_BBOX: Record<string, CountyBbox> = {
  // Nominatim / OSM relation 1828017 — Desha County, Arkansas
  'AR:desha': [-91.557618, 33.5171838, -90.870461, 34.1193908],
  // Nominatim / OSM relation 1826755 — Jefferson County, Arkansas
  'AR:jefferson': [-92.2915, 34.0995, -91.7385, 34.4905],
};

export function normalizeCountyStem(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\bcounty\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countyBboxKey(stateUsps: string, countyRaw: string): string {
  return `${stateUsps.trim().toUpperCase()}:${normalizeCountyStem(countyRaw)}`;
}

export function getUsCountyBbox(
  stateUsps: string,
  countyRaw: string,
): CountyBbox | null {
  const key = countyBboxKey(stateUsps, countyRaw);
  return US_COUNTY_BBOX[key] ?? null;
}

export function pointInUsCountyBBox(
  lon: number,
  lat: number,
  stateUsps: string,
  countyRaw: string,
): boolean {
  const b = getUsCountyBbox(stateUsps, countyRaw);
  if (!b) return false;
  const [west, south, east, north] = b;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

export function countyBboxToMapBounds(bbox: CountyBbox): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const [west, south, east, north] = bbox;
  return { west, south, east, north };
}

export function countyBboxCenter(bbox: CountyBbox): { lat: number; lng: number } {
  const [west, south, east, north] = bbox;
  return { lat: (south + north) / 2, lng: (west + east) / 2 };
}

/** Half-diagonal in miles — useful where radiusMile is still required by callers. */
export function countyBboxRadiusMile(bbox: CountyBbox): number {
  const [west, south, east, north] = bbox;
  const latSpan = north - south;
  const lngSpan = east - west;
  const midLat = (south + north) / 2;
  const milesLat = latSpan * 69;
  const milesLng = lngSpan * 69 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  return Math.ceil(Math.sqrt(milesLat ** 2 + milesLng ** 2) * 0.55);
}
