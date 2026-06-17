/**
 * Lightweight reachability probes for the Threat Monitoring "Live Inputs" card.
 *
 * Each probe sends the smallest viable request to a federal feed with a short
 * timeout. A throw/timeout resolves to `{ ok: false }` so one slow feed never
 * blocks the others. Intended to be wrapped in the SWR cache by the route.
 */

/** NWS / .gov endpoints require a descriptive User-Agent (no bare fetch). */
const USER_AGENT =
  process.env.NWS_USER_AGENT ||
  'Ready2Go-EmergencyOps/1.0 (+https://localhost; ops@agency.local; source-health)';

const PROBE_TIMEOUT_MS = 30_000;

export interface SourceHealth {
  key: string;
  ok: boolean;
}

/** Single source of truth for Live-Input row keys — kept in sync with probeSourceHealth(). */
export const LIVE_INPUT_KEYS = ['nws', 'hydro', 'eq', 'firms', 'fema'] as const;
export type LiveInputKey = (typeof LIVE_INPUT_KEYS)[number];

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = PROBE_TIMEOUT_MS, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Run a probe, mapping any failure/timeout to `ok: false`. */
async function probe(key: string, run: () => Promise<boolean>): Promise<SourceHealth> {
  try {
    return { key, ok: await run() };
  } catch {
    return { key, ok: false };
  }
}

const govHeaders = { 'User-Agent': USER_AGENT } as const;

async function probeNws(): Promise<boolean> {
  // NWS doesn't reliably support `limit`; probe the API root status endpoint instead.
  const res = await fetchWithTimeout('https://api.weather.gov/', {
    headers: { ...govHeaders, Accept: 'application/json' },
    cache: 'no-store',
  });
  return res.ok;
}

async function probeHydro(): Promise<boolean> {
  // Combined row: NOAA NWPS gauge AND USGS instantaneous values must both respond.
  const [nwps, usgs] = await Promise.all([
    fetchWithTimeout('https://api.water.noaa.gov/nwps/v1/gauges/SACC1', {
      headers: { ...govHeaders, Accept: 'application/json' },
      cache: 'no-store',
    }).then((r) => r.ok).catch(() => false),
    fetchWithTimeout(
      'https://waterservices.usgs.gov/nwis/iv/?format=json&sites=01646500&parameterCd=00060&siteStatus=active',
      { headers: { ...govHeaders, Accept: 'application/json' }, cache: 'no-store' },
    ).then((r) => r.ok).catch(() => false),
  ]);
  return nwps && usgs;
}

async function probeEarthquake(): Promise<boolean> {
  const res = await fetchWithTimeout(
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson',
    { headers: { ...govHeaders, Accept: 'application/json' }, cache: 'no-store' },
  );
  return res.ok;
}

async function probeFirms(): Promise<boolean> {
  const key = process.env.NASA_FIRMS_MAP_KEY || process.env.NASA_FIRMS_API_KEY;
  if (!key) return false;
  // FIRMS Area API only serves CSV (json returns a 400 help page) and full feeds are large.
  // The map-key status endpoint is a tiny, fast probe that confirms the service is reachable
  // and our key is valid — exactly the "data available from this feed" signal we want.
  const url = `https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${key}`;
  const res = await fetchWithTimeout(url, {
    headers: { ...govHeaders, Accept: 'application/json' },
    cache: 'no-store',
  });
  return res.ok;
}

async function probeFema(): Promise<boolean> {
  const res = await fetchWithTimeout(
    'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$top=1',
    { headers: { ...govHeaders, Accept: 'application/json' }, cache: 'no-store' },
  );
  return res.ok;
}

/** Probe every Live-Input feed in parallel. Never rejects. */
export async function probeSourceHealth(): Promise<SourceHealth[]> {
  return Promise.all([
    probe(LIVE_INPUT_KEYS[0], probeNws),
    probe(LIVE_INPUT_KEYS[1], probeHydro),
    probe(LIVE_INPUT_KEYS[2], probeEarthquake),
    probe(LIVE_INPUT_KEYS[3], probeFirms),
    probe(LIVE_INPUT_KEYS[4], probeFema),
  ]);
}

const PROBE_FN_MAP: Record<LiveInputKey, () => Promise<boolean>> = {
  nws: probeNws,
  hydro: probeHydro,
  eq: probeEarthquake,
  firms: probeFirms,
  fema: probeFema,
};

/** Probe a single feed by key. Never rejects. */
export async function probeSingleSource(key: LiveInputKey): Promise<SourceHealth> {
  const fn = PROBE_FN_MAP[key];
  return fn ? probe(key, fn) : { key, ok: false };
}
