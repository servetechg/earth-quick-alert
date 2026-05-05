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
  const out = new Map<string, number>();
  const fips = STATE_USPS_TO_FIPS[uspsLower.trim().toLowerCase()];
  if (!fips) return out;

  const apiKey = (process.env.CENSUS_API_KEY || '').trim();
  const qs = new URLSearchParams({
    get: 'NAME,B01003_001E',
    for: 'county:*',
    in: `state:${fips}`,
  });
  if (apiKey) qs.set('key', apiKey);

  const url = `https://api.census.gov/data/${year}/acs/acs5?${qs.toString()}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 18000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return out;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length < 2) return out;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as string[];
      const name = row[0];
      const popRaw = row[1];
      const stem = countyStemFromCensusName(name ?? '');
      if (!stem || popRaw == null) continue;
      const n = Number(String(popRaw).replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) out.set(stem, n);
    }
    return out;
  } catch {
    return out;
  } finally {
    clearTimeout(t);
  }
}
