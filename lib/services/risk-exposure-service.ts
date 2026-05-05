import type { IngestSourceResult, RiskExposureSnapshot } from '@/lib/types/risk-assessment';
import {
  ACS_YEAR_DEFAULT,
  fetchCountyPopulationSlugMap,
  normalizeCountyStem,
  STATE_USPS_TO_FIPS,
} from '@/lib/services/census-county-population';

const NWPS_BUFFER_KM = Number(process.env.RISK_NWPS_RADIUS_KM ?? 120);
const EQ_BUFFER_KM = Number(process.env.RISK_EARTHQUAKE_RADIUS_KM ?? 60);

/** Map major city name (lowercase) → primary county for headline “Chicago = Cook” matching. */
export const CITY_TO_COUNTY_HINT: Record<string, { stateAbbr: string; countyStem: string }> = {
  chicago: { stateAbbr: 'IL', countyStem: 'cook' },
  'new york': { stateAbbr: 'NY', countyStem: 'new york' },
  manhattan: { stateAbbr: 'NY', countyStem: 'new york' },
  brooklyn: { stateAbbr: 'NY', countyStem: 'kings' },
  queens: { stateAbbr: 'NY', countyStem: 'queens' },
  houston: { stateAbbr: 'TX', countyStem: 'harris' },
  phoenix: { stateAbbr: 'AZ', countyStem: 'maricopa' },
  philadelphia: { stateAbbr: 'PA', countyStem: 'philadelphia' },
  'san antonio': { stateAbbr: 'TX', countyStem: 'bexar' },
  dallas: { stateAbbr: 'TX', countyStem: 'dallas' },
  'san jose': { stateAbbr: 'CA', countyStem: 'santa clara' },
  sacramento: { stateAbbr: 'CA', countyStem: 'sacramento' },
  fresno: { stateAbbr: 'CA', countyStem: 'fresno' },
  'long beach': { stateAbbr: 'CA', countyStem: 'los angeles' },
  'los angeles': { stateAbbr: 'CA', countyStem: 'los angeles' },
  miami: { stateAbbr: 'FL', countyStem: 'miami-dade' },
  atlanta: { stateAbbr: 'GA', countyStem: 'fulton' },
  boston: { stateAbbr: 'MA', countyStem: 'suffolk' },
  seattle: { stateAbbr: 'WA', countyStem: 'king' },
  denver: { stateAbbr: 'CO', countyStem: 'denver' },
  detroit: { stateAbbr: 'MI', countyStem: 'wayne' },
  milwaukee: { stateAbbr: 'WI', countyStem: 'milwaukee' },
  minneapolis: { stateAbbr: 'MN', countyStem: 'hennepin' },
  'st. paul': { stateAbbr: 'MN', countyStem: 'ramsey' },
  tampa: { stateAbbr: 'FL', countyStem: 'hillsborough' },
  oakland: { stateAbbr: 'CA', countyStem: 'alameda' },
  portland: { stateAbbr: 'OR', countyStem: 'multnomah' },
  las_vegas: { stateAbbr: 'NV', countyStem: 'clark' },
  'las vegas': { stateAbbr: 'NV', countyStem: 'clark' },
  indianapolis: { stateAbbr: 'IN', countyStem: 'marion' },
  columbus: { stateAbbr: 'OH', countyStem: 'franklin' },
  charlotte: { stateAbbr: 'NC', countyStem: 'mecklenburg' },
  nashville: { stateAbbr: 'TN', countyStem: 'davidson' },
  baltimore: { stateAbbr: 'MD', countyStem: 'baltimore' },
  'washington dc': { stateAbbr: 'DC', countyStem: 'district of columbia' },
};

export interface CountyPopulationHint {
  stateAbbr: string;
  countyStem: string;
  sourceLabel: string;
}

function collectNwsFloodCountyHints(features: unknown[]): CountyPopulationHint[] {
  const out: CountyPopulationHint[] = [];
  if (!Array.isArray(features)) return out;
  for (const f of features) {
    const p = (f as { properties?: Record<string, string> }).properties;
    if (!p) continue;
    const ev = p.event ?? '';
    if (!/\bflood|\bhydro|\bflash/i.test(ev)) continue;
    const desc = String(p.areaDesc ?? '');
    for (const m of desc.matchAll(
      /\b([\w\s\.'-]{2,}?)\s+(?:County|Parish)\s*,\s*([A-Z]{2})\b/gi,
    )) {
      const stem = normalizeCountyStem(m[1]);
      const st = String(m[2]).toUpperCase();
      if (stem.length > 1 && st.length === 2) out.push({ stateAbbr: st, countyStem: stem, sourceLabel: 'NWS' });
    }
  }
  return out;
}

function nwpsCountyHint(data: Record<string, unknown>): CountyPopulationHint | null {
  const countyRaw = typeof data.county === 'string' ? data.county : '';
  const st = (data.state as { abbreviation?: string })?.abbreviation;
  const stUp = typeof st === 'string' ? st.trim().toUpperCase() : '';
  if (!countyRaw || stUp.length !== 2) return null;
  return {
    stateAbbr: stUp,
    countyStem: normalizeCountyStem(countyRaw),
    sourceLabel: 'NWPS gauge',
  };
}

function nwpsCentroid(data: Record<string, unknown>): { lat: number; lon: number } | null {
  const lat = Number(data.latitude);
  const lon = Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function earthquakeHints(geoJson: unknown): { centroids: { lat: number; lon: number; label: string }[] } {
  const out: { lat: number; lon: number; label: string }[] = [];
  const feats = (geoJson as { features?: { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }[] })?.features;
  if (!Array.isArray(feats)) return { centroids: out };
  const inRoughUs = (lon: number, lat: number) => lon >= -170 && lon <= -60 && lat >= 15 && lat <= 72;
  const ranked = feats.filter((f) => {
    const c = f?.geometry?.coordinates;
    const p = f?.properties;
    return Array.isArray(c) && c.length >= 2 && p?.mag != null && inRoughUs(Number(c[0]), Number(c[1]));
  });
  ranked.sort(
    (a, b) =>
      (Number((b as any).properties?.mag) || 0) - (Number((a as any).properties?.mag) || 0),
  );
  for (const f of ranked.slice(0, 10)) {
    const c = f?.geometry?.coordinates;
    const p = f?.properties;
    const lon = Number((c as number[])[0]);
    const lat = Number((c as number[])[1]);
    const mag = p?.mag;
    const place = String(p?.place ?? 'Epicenter');
    out.push({ lat, lon, label: `USGS eq M${mag} · ${place}` });
  }
  return { centroids: out };
}

function dedupeHints(hints: CountyPopulationHint[]): CountyPopulationHint[] {
  const seen = new Set<string>();
  const r: CountyPopulationHint[] = [];
  for (const h of hints) {
    const k = `${h.stateAbbr}:${h.countyStem}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    r.push(h);
  }
  return r;
}

/**
 * County-level ACS population summed for ingest-derived jurisdictions + radii metadata for Mongo user matching.
 */
export async function computeRiskExposureSnapshot(
  sources: IngestSourceResult[],
  dashboardStateCd: string,
): Promise<RiskExposureSnapshot | null> {
  const nwpsSrc = sources.find((s) => s.source === 'NOAA_NWPS_GAUGE');
  const nwsSrc = sources.find((s) => s.source === 'NWS_FLOOD_ALERTS');
  const eqSrc = sources.find((s) => s.source === 'USGS_EARTHQUAKES');

  const hints: CountyPopulationHint[] = [];
  if (nwpsSrc?.ok && nwpsSrc.data && typeof nwpsSrc.data === 'object') {
    const h = nwpsCountyHint(nwpsSrc.data as Record<string, unknown>);
    if (h) hints.push(h);
  }
  const nwsData = (nwsSrc?.data ?? null) as { features?: unknown[] } | null;
  if (nwsData?.features) hints.push(...collectNwsFloodCountyHints(nwsData.features));

  const unique = dedupeHints(hints);

  const centroidsPre: RiskExposureSnapshot['centroids'] = [];
  if (nwpsSrc?.ok && nwpsSrc.data && typeof nwpsSrc.data === 'object') {
    const c = nwpsCentroid(nwpsSrc.data as Record<string, unknown>);
    if (c) centroidsPre.push({ lat: c.lat, lon: c.lon, radiusKm: NWPS_BUFFER_KM, label: 'NWPS station buffer' });
  }
  const eqCentroids = earthquakeHints(eqSrc?.data).centroids.slice(0, 10);
  for (const ec of eqCentroids)
    centroidsPre.push({ lat: ec.lat, lon: ec.lon, radiusKm: EQ_BUFFER_KM, label: ec.label });

  const countyMatchHints = unique.map(({ stateAbbr, countyStem }) => ({ stateAbbr, countyStem }));
  const censusVintageLabel = `US Census ACS ${ACS_YEAR_DEFAULT} (5-year) county / parish totals (B01003); dashboard state ${dashboardStateCd.toUpperCase()} context`;

  if (!unique.length && !centroidsPre.length) return null;
  if (!unique.length) {
    return {
      populationAffectedEstimate: 0,
      censusVintageLabel,
      countiesResolved: [],
      countyHintsApplied: [],
      countyMatchHints: [],
      centroids: centroidsPre,
      dashboardStateCd: dashboardStateCd.toLowerCase(),
    };
  }

  const statesNeeded = [...new Set(unique.map((h) => h.stateAbbr.toLowerCase()))].filter((st) => STATE_USPS_TO_FIPS[st]);
  const slugMaps = new Map<string, Map<string, number>>();
  await Promise.all(
    statesNeeded.map(async (st) => {
      const m = await fetchCountyPopulationSlugMap(st);
      slugMaps.set(st, m);
    }),
  );

  let sum = 0;
  const resolved: RiskExposureSnapshot['countiesResolved'] = [];
  const applied: string[] = [];

  for (const h of unique) {
    const stLow = h.stateAbbr.toLowerCase();
    const map = slugMaps.get(stLow);
    const pop = map?.get(h.countyStem) ?? map?.get(h.countyStem.replace(/-/g, ' '));
    applied.push(`${h.countyStem} (${h.stateAbbr})`);
    if (pop != null && pop > 0) {
      sum += pop;
      resolved.push({
        stateAbbr: h.stateAbbr,
        countyStem: h.countyStem,
        label: `${h.countyStem} County, ${h.stateAbbr}`,
        population: pop,
      });
    }
  }

  return {
    populationAffectedEstimate: Math.max(0, Math.round(sum)),
    censusVintageLabel,
    countiesResolved: resolved,
    countyHintsApplied: [...new Set(applied)],
    countyMatchHints,
    centroids: centroidsPre,
    dashboardStateCd: dashboardStateCd.toLowerCase(),
  };
}
