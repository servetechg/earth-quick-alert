import { normalizeCountyStem } from '@/lib/services/census-county-population';

export type CountyCoordinateHint = {
  stateAbbr: string;
  countyStem: string;
  countyFips?: string;
};

const FCC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const fccCache = new Map<string, { hint: CountyCoordinateHint | null; expiresAt: number }>();

type FccAreaResponse = {
  results?: Array<{
    county_name?: string;
    state_code?: string;
  }>;
};

/**
 * Resolve county + state from coordinates via FCC Census Area API (no API key).
 * Used when NWS areaDesc / affectedCounties are absent (FIRMS, earthquakes, etc.).
 */
export async function countyHintFromCoordinates(
  lat: number,
  lng: number,
): Promise<CountyCoordinateHint | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = fccCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.hint;

  const qs = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
  });
  const url = `https://geo.fcc.gov/api/census/area?${qs.toString()}`;

  let hint: CountyCoordinateHint | null = null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      fccCache.set(key, { hint: null, expiresAt: Date.now() + FCC_CACHE_TTL_MS });
      return null;
    }
    const data = (await res.json()) as FccAreaResponse;
    const row = data.results?.[0];
    const countyName = row?.county_name?.trim();
    const st = row?.state_code?.trim().toUpperCase();
    if (countyName && st && st.length === 2) {
      const stem = normalizeCountyStem(countyName);
      if (stem.length >= 2) {
        const fipsFull = String(row?.county_fips ?? '').trim();
        const countyFips =
          fipsFull.length >= 5 ? fipsFull.slice(-3) : undefined;
        hint = { stateAbbr: st, countyStem: stem, countyFips };
      }
    }
  } catch {
    hint = null;
  } finally {
    clearTimeout(t);
  }

  fccCache.set(key, { hint, expiresAt: Date.now() + FCC_CACHE_TTL_MS });
  return hint;
}
