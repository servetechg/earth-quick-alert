/**
 * U.S. Census ACS 5-year county / parish totals (table B01003).
 */

const UA =
  process.env.NWS_USER_AGENT?.replace(/^["']|["']$/g, '') ||
  'Ready2Go-EmergencyOps/1.0 (+https://localhost; demographics)';

/** USPS lowercase → Census state FIPS. */
export const STATE_USPS_TO_FIPS: Record<string, string> = {
  al: '01',
  ak: '02',
  az: '04',
  ar: '05',
  ca: '06',
  co: '08',
  ct: '09',
  de: '10',
  dc: '11',
  fl: '12',
  ga: '13',
  hi: '15',
  id: '16',
  il: '17',
  in: '18',
  ia: '19',
  ks: '20',
  ky: '21',
  la: '22',
  me: '23',
  md: '24',
  ma: '25',
  mi: '26',
  mn: '27',
  ms: '28',
  mo: '29',
  mt: '30',
  ne: '31',
  nv: '32',
  nh: '33',
  nj: '34',
  nm: '35',
  ny: '36',
  nc: '37',
  nd: '38',
  oh: '39',
  ok: '40',
  or: '41',
  pa: '42',
  ri: '44',
  sc: '45',
  sd: '46',
  tn: '47',
  tx: '48',
  ut: '49',
  vt: '50',
  va: '51',
  wa: '53',
  wv: '54',
  wi: '55',
  wy: '56',
};

export const ACS_YEAR_DEFAULT = 2023;

const COUNTY_SLUG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const countySlugCache = new Map<
  string,
  { map: Map<string, number>; expiresAt: number }
>();
let lastCensusFetchError: string | null = null;

export function getLastCensusFetchError(): string | null {
  return lastCensusFetchError;
}

function censusApiKey(): string {
  return (process.env.CENSUS_API_KEY || '').trim().replace(/^["']|["']$/g, '');
}

export function censusApiKeyPresent(): boolean {
  return censusApiKey().length > 0;
}

async function fetchCountyPopulationSlugMapForYear(
  uspsLower: string,
  year: number,
): Promise<{ map: Map<string, number>; error?: string }> {
  const out = new Map<string, number>();
  const fips = STATE_USPS_TO_FIPS[uspsLower.trim().toLowerCase()];
  if (!fips) return { map: out };

  const apiKey = censusApiKey();
  if (!apiKey) {
    return {
      map: out,
      error: 'CENSUS_API_KEY is not set on the server — Census requires an API key for all requests.',
    };
  }

  const qs = new URLSearchParams({
    get: 'NAME,B01003_001E',
    for: 'county:*',
    in: `state:${fips}`,
  });
  qs.set('key', apiKey);

  const url = `https://api.census.gov/data/${year}/acs/acs5?${qs.toString()}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') ?? '';
    const bodyText = await res.text();
    if (!res.ok) {
      return { map: out, error: `Census API HTTP ${res.status}` };
    }
    if (!contentType.includes('json') || bodyText.trimStart().startsWith('<')) {
      const missingKey = /missing key/i.test(bodyText);
      return {
        map: out,
        error: missingKey
          ? 'Census API rejected the request — verify CENSUS_API_KEY is valid.'
          : 'Census API returned a non-JSON response.',
      };
    }
    const rows = JSON.parse(bodyText) as unknown;
    if (!Array.isArray(rows) || rows.length < 2) {
      return { map: out, error: 'Census API returned empty county data.' };
    }
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as string[];
      const name = row[0];
      const popRaw = row[1];
      const stem = countyStemFromCensusName(name ?? '');
      if (!stem || popRaw == null) continue;
      const n = Number(String(popRaw).replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) out.set(stem, n);
    }
    return { map: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Census API request failed';
    return { map: out, error: msg };
  } finally {
    clearTimeout(t);
  }
}

/** Normalized parish/county slug for lookups, e.g. "saint louis", "east baton rouge". */
export function normalizeCountyStem(name: string): string {
  let s = name
    .trim()
    .toLowerCase()
    .replace(/\bparish\b/gi, '')
    .replace(/\bcounty\b/gi, '')
    .replace(/[.,]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^st\b\.?/i, 'saint').replace(/^ft\b\.?/i, 'fort');
  return s;
}

export function countyStemFromCensusName(fullName: string): string | null {
  const trimmed = fullName.trim();
  const withType = trimmed.match(/^(.+?)\s+(?:County|Parish),\s+/i);
  if (withType?.[1]) return normalizeCountyStem(withType[1]);
  /** e.g. census “District of Columbia, District of Columbia” (no County token). */
  const first = trimmed.split(',')[0]?.trim();
  return first ? normalizeCountyStem(first) : null;
}

/**
 * ACS row map: normalized county slug → numeric population estimate.
 */
export async function fetchCountyPopulationSlugMap(uspsLower: string, year = ACS_YEAR_DEFAULT): Promise<Map<string, number>> {
  const st = uspsLower.trim().toLowerCase();
  const cacheKey = `${st}:${year}`;
  const cached = countySlugCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.map.size > 0) {
    return cached.map;
  }

  let result = await fetchCountyPopulationSlugMapForYear(st, year);
  if (result.map.size === 0 && year === ACS_YEAR_DEFAULT) {
    result = await fetchCountyPopulationSlugMapForYear(st, year - 1);
  }

  if (result.error && result.map.size === 0) {
    lastCensusFetchError = result.error;
    console.warn(`[census-county-population] ${st.toUpperCase()}: ${result.error}`);
  } else if (result.map.size > 0) {
    lastCensusFetchError = null;
  }

  if (result.map.size > 0) {
    countySlugCache.set(cacheKey, {
      map: result.map,
      expiresAt: Date.now() + COUNTY_SLUG_CACHE_TTL_MS,
    });
  }

  return result.map;
}

/**
 * Fetch one county's ACS total when bulk state map or stem matching fails.
 */
export async function fetchSingleCountyPopulation(
  stateUspsLower: string,
  countyFips3: string,
  year = ACS_YEAR_DEFAULT,
): Promise<number | null> {
  const st = stateUspsLower.trim().toLowerCase();
  const stateFips = STATE_USPS_TO_FIPS[st];
  const county = countyFips3.trim().padStart(3, '0');
  if (!stateFips || !/^\d{3}$/.test(county)) return null;

  const apiKey = censusApiKey();
  if (!apiKey) return null;

  const cacheKey = `single:${st}:${county}:${year}`;
  const cached = countySlugCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.map.size > 0) {
    const val = cached.map.values().next().value as number | undefined;
    return val ?? null;
  }

  const qs = new URLSearchParams({
    get: 'NAME,B01003_001E',
    for: `county:${county}`,
    in: `state:${stateFips}`,
    key: apiKey,
  });
  const url = `https://api.census.gov/data/${year}/acs/acs5?${qs.toString()}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const bodyText = await res.text();
    if (!res.ok || bodyText.trimStart().startsWith('<')) return null;
    const rows = JSON.parse(bodyText) as unknown;
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const popRaw = (rows[1] as string[])[1];
    const n = Number(String(popRaw ?? '').replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    const singleMap = new Map<string, number>([[county, n]]);
    countySlugCache.set(cacheKey, {
      map: singleMap,
      expiresAt: Date.now() + COUNTY_SLUG_CACHE_TTL_MS,
    });
    return n;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function lookupCountyPopulation(
  map: Map<string, number> | undefined,
  stem: string,
): number | undefined {
  if (!map) return undefined;
  const candidates = [
    stem,
    stem.replace(/-/g, ' '),
    stem.replace(/\s/g, ''),
    stem.replace(/^saint /, 'st '),
  ];
  for (const key of candidates) {
    const pop = map.get(key);
    if (pop != null && pop > 0) return pop;
  }
  return undefined;
}
