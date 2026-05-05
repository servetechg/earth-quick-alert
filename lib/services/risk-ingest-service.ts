import type { DashboardIngestBundle, IngestSourceResult } from '@/lib/types/risk-assessment';
import { computeRiskExposureSnapshot } from '@/lib/services/risk-exposure-service';

const USGS_BASE = 'https://waterservices.usgs.gov/nwis';
const NWPS_BASE = 'https://api.water.noaa.gov/nwps/v1';
const FEMA_BASE = 'https://www.fema.gov/api/open/v2';
const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api';
const INCIWEB_BASE = 'https://inciweb.wildfire.gov';
const ARCGIS_WFIGS =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query';
const NWS_ALERTS = 'https://api.weather.gov/alerts/active';
/** USGS Earthquake Hazards Program — free, no API key: https://earthquake.usgs.gov/fdsnws/event/1/ (feeds are GeoJSON) */
const USGS_EQ_FEED_DAY = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

/** NWS requires a descriptive User-Agent per api.weather.gov policy (no bare fetch). */
const USER_AGENT =
  process.env.NWS_USER_AGENT ||
  'Ready2Go-EmergencyOps/1.0 (+https://localhost; ops@agency.local; dashboard-ingest)';

/** Optional browser-like UA for RSS endpoints that block generic clients (403). */
const RSS_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function isFloodRelatedEvent(event?: string): boolean {
  const e = (event ?? '').toLowerCase();
  return (
    e.includes('flood') ||
    e.includes('hydrolog') ||
    e.includes('dam overflow') ||
    e.includes('flash flood')
  );
}

/** Plain-language basin / corridor for FIRMS hotspots (no reverse geocode; good enough for executive bullets). */
function describeSatelliteSector(lat: number, lon: number): string {
  if (lon >= -180 && lon <= -130 && lat >= 51 && lat <= 72) return 'Alaska vicinity';
  if (lon >= -161 && lon <= -154 && lat >= 18 && lat <= 23) return 'Hawaii vicinity';
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) {
    if (lat >= 32 && lat <= 42 && lon >= -124 && lon <= -114)
      return 'California / Sierra foothills corridor (CONUS)';
    if (lat >= 41.5 && lat <= 49 && lon >= -125 && lon <= -116) return 'Pacific Northwest (CONUS)';
    if (lat >= 37 && lat <= 49 && lon >= -115 && lon <= -102) return 'Northern Rockies / High Plains edge (CONUS)';
    if (lat >= 25 && lat <= 37 && lon >= -107 && lon <= -93) return 'South-Central states (CONUS)';
    if (lat >= 30 && lat <= 35 && lon >= -85 && lon <= -75) return 'Southeast / Mid-Atlantic (CONUS)';
    return 'Continental U.S. (verify county on situational map)';
  }
  if (lat >= 50 && lat <= 72 && lon >= -10 && lon <= 70) return 'Northern Europe / high-latitude belt (outside CONUS)';
  if (lat >= 34 && lat <= 55 && lon >= 25 && lon <= 62) return 'Eastern Europe / Western Asia footprint';
  return 'Outside primary CONUS AOI — treat as context-only satellite cue';
}

function formatUsgsParameterLabel(description?: string, variableName?: string): string {
  const d = `${description ?? ''} ${variableName ?? ''}`.toLowerCase();
  if (d.includes('discharge')) return 'River discharge';
  if (d.includes('gage height')) return 'Gage height';
  if (d.includes('temperature')) return 'Water temperature';
  return (variableName || description || 'Reading').replace(/\s+/g, ' ').trim().slice(0, 48);
}

function formatInstrumentTime(dateTime?: string): string {
  if (!dateTime) return 'time unavailable';
  const d = new Date(dateTime);
  if (Number.isNaN(+d)) return dateTime.slice(0, 32);
  return (
    d.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

/** Turn ALL-CAPS declarations into readable title-case phrases. */
function sentenceTitleFromCaps(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function formatFemaFriendlyLine(rawTitle: string, stateAbbr: string, declarationIso: string): string {
  const title = sentenceTitleFromCaps(rawTitle || 'Flood-related disaster declaration');
  const place = stateAbbr ? `Primary state footprint: ${stateAbbr}` : 'Regional footprint unspecified';
  const when = declarationIso ? formatInstrumentTime(declarationIso) : '';
  return `FEMA open disaster declaration — ${title}. ${place}${when ? ` · filing timestamp ${when}` : ''}.`;
}

/**
 * Collapse many identical-sector VIIRS cues into briefing lines (Duty Officer readable).
 */
function buildViirsBriefingLines(points: { lat: string; lon: string }[]): string[] {
  if (!points.length) return [];
  const bySector = new Map<string, number>();
  for (const { lat, lon } of points) {
    const la = Number(lat);
    const lo = Number(lon);
    const sector =
      Number.isFinite(la) && Number.isFinite(lo) ? describeSatelliteSector(la, lo) : 'unknown sector';
    bySector.set(sector, (bySector.get(sector) ?? 0) + 1);
  }
  const ranked = [...bySector.entries()].sort((a, b) => b[1] - a[1]);
  const total = points.length;
  const lines: string[] = [];
  if (ranked.length === 1) {
    lines.push(
      `Satellite fire desk — NASA VIIRS-SNPP logged ${total} thermal detection${total === 1 ? '' : 's'} in the latest pull, concentrated in ${ranked[0][0]}; treat as background until matched to a named incident, perimeter polygon, or local CAD event.`,
    );
    return lines;
  }
  lines.push(
    `Satellite fire desk — NASA VIIRS-SNPP logged ${total} thermal detection${total === 1 ? '' : 's'} across ${ranked.length} broad regions in this sample.`,
  );
  const topCap = Math.min(3, ranked.length);
  for (let i = 0; i < topCap; i++) {
    const [sector, n] = ranked[i]!;
    lines.push(`${n} read${n === 1 ? '' : 's'} skew toward ${sector} — corroborate before deploying aviation or crews.`);
  }
  if (ranked.length > topCap) {
    const remainder = ranked.slice(topCap).reduce((s, [, c]) => s + c, 0);
    lines.push(`${remainder} additional low-context hits are spread across secondary footprints — no per-point roster until InciWeb or WFIGS names a burn.`);
  }
  return lines;
}

function roundAcres(ac: unknown): string {
  if (ac == null || ac === '' || String(ac).toLowerCase() === 'nan') return 'area unreported';
  const n = Number(ac);
  if (!Number.isFinite(n)) return String(ac);
  if (n >= 500) return `~${Math.round(n).toLocaleString('en-US')} acres mapped`;
  if (n >= 1) return `~${Math.round(n)} acres mapped`;
  return 'minimal mapped footprint';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 20000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function summarizeUsgs(ivJson: any): string {
  const series = ivJson?.value?.timeSeries;
  if (!Array.isArray(series) || series.length === 0) {
    return 'No USGS instantaneous series returned.';
  }
  const bySite = new Map<string, { name: string; site: string; fragments: string[] }>();
  for (const ts of series.slice(0, 12)) {
    const site = ts?.sourceInfo?.siteCode?.[0]?.value ?? '?';
    const name = (ts?.sourceInfo?.siteName ?? 'River / stream gauge').replace(/\s+/g, ' ').trim();
    const paramLabel = formatUsgsParameterLabel(
      ts?.variable?.variableDescription,
      ts?.variable?.variableName,
    );
    const vals = ts?.values?.[0]?.value;
    const last = Array.isArray(vals) && vals.length ? vals[vals.length - 1] : null;
    const v = last?.value;
    const t = last?.dateTime;
    const reading = v != null && v !== '' ? String(v) : 'no recent sample';
    const when = formatInstrumentTime(t);
    if (!bySite.has(site)) bySite.set(site, { name, site, fragments: [] });
    bySite.get(site)!.fragments.push(`${paramLabel.toLowerCase()} ${reading} (as of ${when})`);
  }
  const lines: string[] = [];
  for (const { name, site, fragments } of bySite.values()) {
    lines.push(`${name} (USGS gauge ${site}): ${fragments.join(' · ')}.`);
  }
  return lines.join('\n');
}

async function ingestUsgs(params: { sites?: string; stateCd?: string; period?: string }): Promise<IngestSourceResult> {
  const q = new URLSearchParams({
    format: 'json',
    parameterCd: '00060,00065',
    siteStatus: 'active',
  });
  if (params.sites) q.set('sites', params.sites);
  if (params.stateCd) q.set('stateCd', params.stateCd);
  if (params.period) q.set('period', params.period);
  const url = `${USGS_BASE}/iv/?${q.toString()}`;
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 25000 });
    if (!res.ok) return { ok: false, source: 'USGS_NWIS_IV', error: `HTTP ${res.status}` };
    const json = await res.json();
    const summary = summarizeUsgs(json);
    return { ok: true, source: 'USGS_NWIS_IV', data: json, summary };
  } catch (e: any) {
    return { ok: false, source: 'USGS_NWIS_IV', error: e?.message ?? 'USGS fetch failed' };
  }
}

function summarizeNwpsGaugeJson(j: Record<string, unknown> | null | undefined): string {
  if (!j || typeof j !== 'object') return '';
  const lid = j.lid as string | undefined;
  const name = ((j.name as string) || 'River forecast point').trim();
  const county = j.county as string | undefined;
  const st = (j.state as { abbreviation?: string } | undefined)?.abbreviation;
  const wfo = (j.wfo as { abbreviation?: string } | undefined)?.abbreviation;
  const locale =
    county && st
      ? `${county} County, ${st}`
      : st
        ? `State ${st}`
        : '';
  const parts = [
    `NWPS river monitor: ${name}`,
    locale,
    lid && `location ID ${lid}`,
    wfo && `NWS forecast office ${wfo}`,
  ].filter(Boolean) as string[];
  return parts.join(' · ') || JSON.stringify(j).slice(0, 800);
}

async function ingestNwpsGauge(lid: string): Promise<IngestSourceResult> {
  const url = `${NWPS_BASE}/gauges/${encodeURIComponent(lid)}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
      timeoutMs: 15000,
    });
    if (!res.ok) return { ok: false, source: 'NOAA_NWPS_GAUGE', error: `HTTP ${res.status}` };
    const json = (await res.json()) as Record<string, unknown>;
    const summary = summarizeNwpsGaugeJson(json);
    return { ok: true, source: 'NOAA_NWPS_GAUGE', data: json, summary };
  } catch (e: any) {
    return { ok: false, source: 'NOAA_NWPS_GAUGE', error: e?.message ?? 'NWPS fetch failed' };
  }
}

/** M2.5+ worldwide last day; prefer events in or near the selected U.S. state / CONUS. */
async function ingestUsgsEarthquakes(stateCd: string): Promise<IngestSourceResult> {
  try {
    const res = await fetchWithTimeout(USGS_EQ_FEED_DAY, {
      headers: {
        Accept: 'application/geo+json, application/json',
        'User-Agent': USER_AGENT,
      },
      timeoutMs: 15000,
    });
    if (!res.ok) return { ok: false, source: 'USGS_EARTHQUAKES', error: `HTTP ${res.status}` };
    const geo = (await res.json()) as { features?: any[] };
    const feats = geo?.features ?? [];
    const stateToken = new RegExp(
      `\\b${stateCd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    );
    const inRoughUs = (lon: number, lat: number) =>
      lon >= -170 && lon <= -60 && lat >= 15 && lat <= 72;
    const ranked = feats
      .map((f) => ({ f, p: f?.properties ?? {}, c: f?.geometry?.coordinates as number[] }))
      .filter(({ c, p }) => Array.isArray(c) && c.length >= 2 && p?.mag != null)
      .sort((a, b) => (Number(b.p.mag) || 0) - (Number(a.p.mag) || 0));
    /** Prefer U.S.-area events; boost rows that mention the selected state in `place`. */
    const usBox = ranked.filter(({ c }) => inRoughUs(c[0], c[1]));
    const stateMatch = usBox.filter(({ p }) => stateToken.test(String(p.place ?? '')));
    const pick = (stateMatch.length ? stateMatch : usBox.length ? usBox : ranked).slice(0, 15);
    const lines = pick.map(({ p }) => {
      const t = p.time
        ? new Date(p.time).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'UTC',
          }) + ' UTC'
        : 'time unavailable';
      const mag = Number(p.mag);
      const magTxt = Number.isFinite(mag) ? mag.toFixed(1).replace(/\.0$/, '') : String(p.mag ?? '?');
      const place = p.place ?? 'unspecified epicenter';
      return `Earthquake magnitude M${magTxt} — ${place} · ${t}.`;
    });
    return {
      ok: true,
      source: 'USGS_EARTHQUAKES',
      data: geo,
      summary: lines.length ? lines.join('\n') : 'No earthquakes in M2.5+ past-day feed.',
    };
  } catch (e: any) {
    return { ok: false, source: 'USGS_EARTHQUAKES', error: e?.message ?? 'USGS earthquakes fetch failed' };
  }
}

async function ingestNwsFloodAlerts(stateCd: string): Promise<IngestSourceResult> {
  /**
   * api.weather.gov does not support `limit` on /alerts/active (returns 400).
   * Use `area` + `status`, then filter client-side for flood/hydro events.
   */
  const area = stateCd.length === 2 ? stateCd.toUpperCase() : 'CA';
  const params = new URLSearchParams({ status: 'actual', area });
  const url = `${NWS_ALERTS}?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': USER_AGENT,
      },
      timeoutMs: 20000,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        ok: false,
        source: 'NWS_FLOOD_ALERTS',
        error: `HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
      };
    }
    const json = await res.json();
    const feats = json?.features;
    const lines: string[] = [];
    if (Array.isArray(feats)) {
      for (const f of feats) {
        const p = f?.properties;
        if (!p || !isFloodRelatedEvent(p.event)) continue;
        lines.push(
          `${p.event ?? 'Hydrologic alert'} (${p.areaDesc ?? area}) — ${(p.headline ?? p.description?.slice(0, 180) ?? 'Details in NWS dissemination').trim()}`,
        );
        if (lines.length >= 12) break;
      }
    }
    return {
      ok: true,
      source: 'NWS_FLOOD_ALERTS',
      data: json,
      summary: lines.length
        ? lines.join('\n')
        : `No active flood/hydro-related alerts for area=${area} (other alerts may exist).`,
    };
  } catch (e: any) {
    return { ok: false, source: 'NWS_FLOOD_ALERTS', error: e?.message ?? 'NWS alerts fetch failed' };
  }
}

async function ingestFemaFloods(): Promise<IngestSourceResult> {
  const filter = encodeURIComponent("incidentType eq 'Flood'");
  const url = `${FEMA_BASE}/DisasterDeclarationsSummaries?$filter=${filter}&$orderby=declarationDate desc&$top=8&$format=json`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' }, timeoutMs: 15000 });
    if (!res.ok) return { ok: false, source: 'FEMA_OPENFEMA', error: `HTTP ${res.status}` };
    const json = await res.json();
    const rows = json?.DisasterDeclarationsSummaries ?? json?.value ?? [];
    const lines: string[] = [];
    if (Array.isArray(rows)) {
      const seen = new Set<string>();
      for (const r of rows.slice(0, 12)) {
        const formatted = formatFemaFriendlyLine(
          r.title ?? r.declarationTitle ?? 'flood disaster',
          r.state ?? '',
          r.declarationDate ?? '',
        );
        if (seen.has(formatted)) continue;
        seen.add(formatted);
        lines.push(formatted);
      }
    }
    return {
      ok: true,
      source: 'FEMA_OPENFEMA',
      data: json,
      summary: lines.length ? lines.join('\n') : 'No recent flood disaster declarations returned.',
    };
  } catch (e: any) {
    return { ok: false, source: 'FEMA_OPENFEMA', error: e?.message ?? 'FEMA fetch failed' };
  }
}

/** NASA Area API: DAY_RANGE must be 1–5; area is `world` or west,south,east,north (docs explicitly disallow USA-only keywords in some builds — use bbox or `world`). */
function summarizeFirmsCsv(csvText: string): { lines: string[]; rawSample: string; hotspotCount: number } {
  const rows = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return { lines: [], rawSample: csvText.slice(0, 400), hotspotCount: 0 };
  const header = rows[0].split(',').map((h) => h.trim().toLowerCase());
  let latIdx = header.indexOf('latitude');
  if (latIdx < 0) latIdx = header.indexOf('lat');
  let lonIdx = header.indexOf('longitude');
  if (lonIdx < 0) lonIdx = header.indexOf('lon');
  const points: { lat: string; lon: string }[] = [];
  for (let i = 1; i < Math.min(rows.length, 50); i++) {
    const cols = rows[i].split(',');
    const lat = latIdx >= 0 ? cols[latIdx]?.trim() : '';
    const lon = lonIdx >= 0 ? cols[lonIdx]?.trim() : '';
    if (lat && lon) points.push({ lat, lon });
  }
  return {
    lines: buildViirsBriefingLines(points),
    rawSample: rows[0].slice(0, 200),
    hotspotCount: points.length,
  };
}

async function ingestNasaFirms(): Promise<IngestSourceResult> {
  const rawKey = process.env.NASA_FIRMS_MAP_KEY || process.env.NASA_FIRMS_API_KEY;
  const key = rawKey?.trim().replace(/^["']|["']$/g, '');
  if (!key) {
    return {
      ok: false,
      source: 'NASA_FIRMS',
      error: 'NASA_FIRMS_MAP_KEY or NASA_FIRMS_API_KEY not set',
    };
  }

  const bboxUs = '-140,15,-50,60';
  /** JSON then CSV; `world` is the documented stable region keyword. */
  const jsonAttempts = [
    `${FIRMS_BASE}/area/json/${key}/VIIRS_SNPP_NRT/world/1`,
    `${FIRMS_BASE}/area/json/${key}/VIIRS_SNPP_NRT/${bboxUs}/1`,
    `${FIRMS_BASE}/area/json/${key}/VIIRS_SNPP_NRT/USA/1`,
    `${FIRMS_BASE}/area/json/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/world/1`,
    `${FIRMS_BASE}/area/json/${key}/MODIS_NRT/world/1`,
  ];
  const csvAttempts = [
    `${FIRMS_BASE}/area/csv/${key}/VIIRS_SNPP_NRT/world/1`,
    `${FIRMS_BASE}/area/csv/${key}/VIIRS_SNPP_NRT/${bboxUs}/1`,
  ];

  const firmsHeaders = {
    Accept: 'application/json, text/csv, */*',
    'User-Agent': USER_AGENT,
  };

  try {
    let lastStatus = 0;
    let lastDetail = '';

    for (const url of jsonAttempts) {
      const res = await fetchWithTimeout(url, { headers: firmsHeaders, timeoutMs: 28000 });
      lastStatus = res.status;
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        lastDetail = t.replace(/\s+/g, ' ').trim().slice(0, 280);
        continue;
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        lastDetail = 'Response was not valid JSON';
        continue;
      }
      const list = Array.isArray(json)
        ? json
        : Array.isArray((json as any)?.data)
          ? (json as any).data
          : Array.isArray((json as any)?.features)
            ? (json as any).features
            : [];
      const points: { lat: string; lon: string }[] = [];
      list.slice(0, 50).forEach((row: unknown) => {
        const r = row as Record<string, unknown>;
        const lat = String(r.latitude ?? r.lat ?? '');
        const lon = String(r.longitude ?? r.lon ?? '');
        if (lat && lon) points.push({ lat, lon });
      });
      const lines = buildViirsBriefingLines(points);
      return {
        ok: true,
        source: 'NASA_FIRMS',
        data: json,
        signalCount: points.length,
        summary:
          lines.length > 0
            ? lines.join('\n')
            : 'FIRMS JSON OK but no hotspot rows in array (empty region/time window).',
      };
    }

    for (const url of csvAttempts) {
      const res = await fetchWithTimeout(url, { headers: firmsHeaders, timeoutMs: 28000 });
      lastStatus = res.status;
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        lastDetail = t.replace(/\s+/g, ' ').trim().slice(0, 280);
        continue;
      }
      const text = await res.text();
      const { lines, rawSample, hotspotCount } = summarizeFirmsCsv(text);
      if (lines.length > 0) {
        return {
          ok: true,
          source: 'NASA_FIRMS',
          data: { format: 'csv', header: rawSample },
          signalCount: hotspotCount,
          summary: lines.join('\n'),
        };
      }
      lastDetail = text.includes('latitude') ? 'CSV parsed but no coordinate rows' : text.slice(0, 200);
    }

    const hint =
      lastStatus === 400
        ? `NASA returned 400. Common causes: invalid/expired MAP_KEY, DAY_RANGE not 1–5, or malformed bbox. Last detail: ${lastDetail || '(empty body)'}`
        : `HTTP ${lastStatus}${lastDetail ? `: ${lastDetail}` : ''}`;
    return { ok: false, source: 'NASA_FIRMS', error: hint };
  } catch (e: any) {
    return { ok: false, source: 'NASA_FIRMS', error: e?.message ?? 'FIRMS fetch failed' };
  }
}

function parseRssWildfires(xml: string, max = 12): string {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, max);
  const lines: string[] = [];
  for (const m of items) {
    const block = m[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim();
    const desc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.replace(/<[^>]+>/g, ' ').slice(0, 220).trim();
    if (title) lines.push(`${title}${pub ? ` — ${pub}` : ''}${desc ? ` — ${desc}` : ''}`);
  }
  return lines.length ? lines.join('\n') : 'No RSS items parsed.';
}

async function ingestInciwebWildfire(): Promise<IngestSourceResult> {
  const urls = [
    `${INCIWEB_BASE}/feeds/rss/incidents/type/wildfire/`,
    `https://www.inciweb.wildfire.gov/feeds/rss/incidents/type/wildfire/`,
    `${INCIWEB_BASE}/feeds/rss/incidents/`,
  ];
  const rssHeaders: HeadersInit = {
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
    'User-Agent': RSS_BROWSER_UA,
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://inciweb.wildfire.gov/',
    'Cache-Control': 'no-cache',
  };
  try {
    let lastStatus = 0;
    for (const url of urls) {
      const res = await fetchWithTimeout(url, { headers: rssHeaders, timeoutMs: 18000 });
      lastStatus = res.status;
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes('<rss') && !xml.includes('<feed') && !xml.includes('<item')) continue;
      const summary = parseRssWildfires(xml, 12);
      return {
        ok: true,
        source: 'INCIWEB_RSS',
        data: { itemCount: summary.split('\n').filter(Boolean).length, feedUrl: url },
        summary,
      };
    }
    return {
      ok: false,
      source: 'INCIWEB_RSS',
      error: `HTTP ${lastStatus} (all InciWeb RSS URLs blocked or empty — site may require browser access)`,
    };
  } catch (e: any) {
    return { ok: false, source: 'INCIWEB_RSS', error: e?.message ?? 'InciWeb RSS failed' };
  }
}

async function ingestArcgisPerimeters(): Promise<IngestSourceResult> {
  const q = new URLSearchParams({
    where: '1=1',
    outFields: 'IncidentName,PercentContained,poly_GISAcres,UniqueFireIdentifier,FireDiscoveryDateTime',
    f: 'json',
    resultRecordCount: '20',
  });
  const url = `${ARCGIS_WFIGS}?${q.toString()}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' }, timeoutMs: 20000 });
    if (!res.ok) return { ok: false, source: 'ESRI_ARCGIS_WFIGS', error: `HTTP ${res.status}` };
    const json = await res.json();
    const feats = json?.features;
    const lines: string[] = [];
    if (Array.isArray(feats)) {
      for (const f of feats.slice(0, 15)) {
        const a = f?.attributes ?? {};
        const nm = a.IncidentName ?? 'Interagency mapped fire';
        const pct =
          a.PercentContained != null && String(a.PercentContained).length
            ? `${a.PercentContained}% contained`
            : 'containment not published';
        lines.push(
          `${nm} — ${roundAcres(a.poly_GISAcres)}, ${pct} on WFIGS perimeter layer (verify with local incident command).`,
        );
      }
    }
    return {
      ok: true,
      source: 'ESRI_ARCGIS_WFIGS',
      data: json,
      summary:
        lines.length > 0
          ? lines.join('\n')
          : 'Interagency perimeter layer returned no features for this pull (empty window or outside current AOI).',
    };
  } catch (e: any) {
    return { ok: false, source: 'ESRI_ARCGIS_WFIGS', error: e?.message ?? 'ArcGIS fetch failed' };
  }
}

export async function runDashboardIngest(options: {
  stateCd: string;
  nwpsGaugeId: string;
  usgsSite?: string;
}): Promise<DashboardIngestBundle> {
  const stateCd = (options.stateCd || 'ca').toLowerCase();
  const nwpsGaugeId = options.nwpsGaugeId || 'SACC1';
  const usgsSite = options.usgsSite || '11447650';

  const [usgs, nwps, nws, fema, firms, inci, arcgis, eq] = await Promise.all([
    ingestUsgs({ sites: usgsSite, period: 'P1D' }),
    ingestNwpsGauge(nwpsGaugeId),
    ingestNwsFloodAlerts(stateCd),
    ingestFemaFloods(),
    ingestNasaFirms(),
    ingestInciwebWildfire(),
    ingestArcgisPerimeters(),
    ingestUsgsEarthquakes(stateCd),
  ]);

  const sources = [usgs, nwps, nws, fema, firms, inci, arcgis, eq];
  const successfulSources = sources.filter((s) => s.ok).length;

  const narrativeParts = [
    `=== USGS (instantaneous, site ${usgsSite}) ===\n${usgs.summary ?? usgs.error}`,
    `=== NOAA NWPS gauge ${nwpsGaugeId} ===\n${nwps.summary ?? nwps.error}`,
    `=== NWS Active Flood Warnings ===\n${nws.summary ?? nws.error}`,
    `=== FEMA Flood declarations (recent) ===\n${fema.summary ?? fema.error}`,
    `=== NASA FIRMS VIIRS (USA, 1d) ===\n${firms.summary ?? firms.error}`,
    `=== InciWeb wildfire RSS ===\n${inci.summary ?? inci.error}`,
    `=== Esri WFIGS current perimeters ===\n${arcgis.summary ?? arcgis.error}`,
    `=== USGS Earthquakes (M2.5+ past day; USA/state-prioritized) ===\n${eq.summary ?? eq.error}`,
  ];
  const narrative = narrativeParts.join('\n\n');

  const riskExposure = await computeRiskExposureSnapshot(sources, stateCd);

  const eqLines = eq.summary ? eq.summary.split('\n').filter(Boolean).length : 0;
  const firmsSignal =
    firms.ok && firms.signalCount != null
      ? firms.signalCount
      : firms.ok && Array.isArray(firms.data)
        ? (firms.data as any[]).length
        : 0;
  const totalSignals =
    (nws.ok && Array.isArray((nws.data as any)?.features) ? (nws.data as any).features.length : 0) +
    firmsSignal +
    (inci.summary ? Math.min(inci.summary.split('\n').filter(Boolean).length, 12) : 0) +
    (arcgis.ok && Array.isArray((arcgis.data as any)?.features) ? (arcgis.data as any).features.length : 0) +
    eqLines;

  const exposureNarrative = riskExposure
    ? `\n\n=== Derived exposure (ACS county population + buffers) ===\nEstimated people in named counties/parishes (sum of ACS B01003): ${riskExposure.populationAffectedEstimate.toLocaleString()}.\n${riskExposure.censusVintageLabel}\nCounties considered: ${riskExposure.countyHintsApplied.join('; ') || '(none — buffer-only matching for app users)'}\n`
    : '';

  return {
    stateCd,
    nwpsGaugeId,
    usgsSite,
    ingestedAt: new Date().toISOString(),
    sources,
    narrative: narrative + exposureNarrative,
    successfulSources,
    totalSignals: Math.max(totalSignals, successfulSources),
    riskExposure: riskExposure ?? undefined,
  };
}
