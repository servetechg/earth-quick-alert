import type { RiskExposureSnapshot } from '@/lib/types/risk-assessment';
import {
  ACS_YEAR_DEFAULT,
  censusApiKeyPresent,
  fetchCountyPopulationSlugMap,
  fetchSingleCountyPopulation,
  getLastCensusFetchError,
  lookupCountyPopulation,
  normalizeCountyStem,
  STATE_USPS_TO_FIPS,
} from '@/lib/services/census-county-population';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import { geocodeLocation, splitAreaDescription } from '@/lib/services/location-matching';
import {
  filterHydratedForSubAdminJurisdiction,
  coordinatesInJurisdiction,
  extractAlertRowCoordinates,
  type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { countyHintFromCoordinates } from '@/lib/services/county-hint-from-coordinates';

export interface CountyPopulationHint {
  stateAbbr: string;
  countyStem: string;
  /** 3-digit county FIPS (when known from coordinate lookup). */
  countyFips?: string;
}

const COUNTY_WITH_STATE_RE =
  /\b([\w\s\.'-]{2,}?)\s+(?:County|Parish)\s*,\s*([A-Z]{2})\b/gi;
const COUNTY_BARE_RE = /\b([\w\s\.'-]{2,}?)\s+(?:County|Parish)\b/gi;
const COUNTIES_LIST_RE = /\b([\w\s\.'',-]+?)\s+counties\b/gi;
const TRAILING_STATE_RE = /,\s*([A-Z]{2})\s*$/;
/** NWS areaDesc token, e.g. "Clay, IL" or "Calcasieu, LA" (no "County" suffix). */
const NWS_COUNTY_PAIR_RE = /^([A-Za-z][A-Za-z\s\.'-]{0,48}?),\s*([A-Z]{2})$/;

const NON_COUNTY_ZONE_RE =
  /\b(river|valley|slopes|waters|coastal|offshore|lake|sound|strait|mountains|foothills|basin|harbor|bay|channel|passage|inlet|gulf|ocean|marine|beaches|reef)\b/i;

/** Tribal / special areas are not ACS counties — geocode to parent county instead. */
const NON_CENSUS_JURISDICTION_RE =
  /\b(reservation|indian reservation|nation|tribal|pueblo|census area|traditional|borough)\b/i;

function isCensusCountyStem(stem: string, rawLabel?: string): boolean {
  const hay = `${stem} ${rawLabel ?? ''}`.toLowerCase();
  if (NON_CENSUS_JURISDICTION_RE.test(hay)) return false;
  if (NON_COUNTY_ZONE_RE.test(hay) && !/\bcounty\b/i.test(hay)) return false;
  return stem.length >= 2;
}

function pushHint(
  out: CountyPopulationHint[],
  seen: Set<string>,
  countyRaw: string,
  stateAbbr: string,
) {
  const stem = normalizeCountyStem(countyRaw);
  const st = stateAbbr.trim().toUpperCase();
  if (stem.length < 2 || st.length !== 2) return;
  if (!isCensusCountyStem(stem, countyRaw)) return;
  const key = `${st}:${stem}`.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ stateAbbr: st, countyStem: stem });
}

function isLikelyNwsCountyName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2 || n.length > 48) return false;
  if (NON_COUNTY_ZONE_RE.test(n) && !/\bcounty\b/i.test(n) && !/\bparish\b/i.test(n)) {
    return false;
  }
  return /^[A-Za-z]/.test(n);
}

function hintFromNwsAreaToken(token: string): CountyPopulationHint | null {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 55) return null;
  if ((trimmed.match(/,/g) ?? []).length > 1) return null;

  const m = trimmed.match(NWS_COUNTY_PAIR_RE);
  if (!m) return null;
  let countyName = m[1].trim();
  const st = m[2].toUpperCase();

  /** NWS areaDesc tokens are short, e.g. "Maricopa, AZ" — not full sentences. */
  const withoutType = countyName.replace(/\b(?:County|Parish)\b/gi, '').trim();
  const wordCount = withoutType.split(/\s+/).filter(Boolean).length;
  if (wordCount > 4) return null;

  if (!isLikelyNwsCountyName(countyName)) return null;
  const stem = normalizeCountyStem(countyName);
  if (stem.length < 2 || !isCensusCountyStem(stem, countyName)) return null;
  return { stateAbbr: st, countyStem: stem };
}

function collectAffectedCountyTokensFromProperties(props: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  if (typeof props.areaDesc === 'string') {
    for (const part of splitAreaDescription(props.areaDesc)) push(part);
  }

  for (const value of Object.values(props)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const block = value as Record<string, unknown>;
    const ac = block.affectedCounties;
    if (Array.isArray(ac)) {
      for (const item of ac) push(String(item));
    }
    const designated = block.designatedArea ?? block.areaName;
    if (typeof designated === 'string') push(designated);
  }

  return out;
}

function hintsFromText(text: string, defaultStateUsps?: string | null): CountyPopulationHint[] {
  const out: CountyPopulationHint[] = [];
  const seen = new Set<string>();
  if (!text?.trim()) return out;

  for (const m of text.matchAll(COUNTY_WITH_STATE_RE)) {
    pushHint(out, seen, m[1], m[2]);
  }

  /** NWS tokens: "Clay, IL; Washington, IN" */
  for (const part of splitAreaDescription(text)) {
    const hint = hintFromNwsAreaToken(part);
    if (hint) {
      const key = `${hint.stateAbbr}:${hint.countyStem}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(hint);
      }
    }
  }

  const trailing = text.match(TRAILING_STATE_RE);
  const fallbackSt = trailing?.[1] ?? defaultStateUsps ?? null;

  for (const m of text.matchAll(COUNTIES_LIST_RE)) {
    const chunk = m[1];
    for (const part of chunk.split(/,|\band\b/i)) {
      const name = part.trim();
      if (!name || /\bcounty\b/i.test(name)) continue;
      if (fallbackSt) pushHint(out, seen, name, fallbackSt);
    }
  }

  if (fallbackSt) {
    for (const m of text.matchAll(COUNTY_BARE_RE)) {
      pushHint(out, seen, m[1], fallbackSt);
    }
  }

  return out;
}

function collectStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function hintsFromProperties(
  props: Record<string, unknown>,
  defaultStateUsps?: string | null,
): CountyPopulationHint[] {
  const out: CountyPopulationHint[] = [];
  const seen = new Set<string>();
  const st =
    typeof props.state === 'string'
      ? normalizeStateToUsps(props.state) ?? props.state.trim().toUpperCase()
      : defaultStateUsps ?? null;

  const arrays: string[][] = [
    collectStringArray(props.counties),
    collectStringArray((props.storm as Record<string, unknown> | undefined)?.counties),
    collectStringArray((props.storm as Record<string, unknown> | undefined)?.polygonCounties),
    collectStringArray((props.tornado as Record<string, unknown> | undefined)?.counties),
    collectStringArray((props.polygon as Record<string, unknown> | undefined)?.counties),
    collectStringArray(props.polygonCounties),
  ];

  for (const arr of arrays) {
    for (const name of arr) {
      if (st) pushHint(out, seen, name, st);
    }
  }

  for (const token of collectAffectedCountyTokensFromProperties(props)) {
    const hint = hintFromNwsAreaToken(token);
    if (hint) pushHint(out, seen, hint.countyStem, hint.stateAbbr);
    else if (st) {
      const countyName = token.replace(/,\s*[A-Z]{2}$/i, '').trim();
      if (countyName) pushHint(out, seen, countyName, st);
    }
  }

  return out;
}

/**
 * Parse county / parish names from aligned alert rows (location text + structured properties).
 */
export function collectCountyHintsFromAlertRows(
  rows: Record<string, unknown>[],
  options?: {
    /** Sub-admin profile state — fills missing USPS on bare "Pulaski County" strings. */
    defaultStateUsps?: string | null;
    /** When set, only hints in this state are kept (sub-admin scope). */
    scopeStateUsps?: string | null;
  },
): CountyPopulationHint[] {
  const defaultSt = options?.defaultStateUsps
    ? (normalizeStateToUsps(options.defaultStateUsps) ?? options.defaultStateUsps.toUpperCase())
    : null;
  const scopeSt = options?.scopeStateUsps
    ? (normalizeStateToUsps(options.scopeStateUsps) ?? options.scopeStateUsps.toUpperCase())
    : null;

  const seen = new Set<string>();
  const merged: CountyPopulationHint[] = [];

  for (const row of rows) {
    const texts = [
      typeof row.location === 'string' ? row.location : '',
      typeof row.description === 'string' ? row.description : '',
      typeof row.name === 'string' ? row.name : '',
      ...(Array.isArray(row.locations) ? row.locations.map(String) : []),
    ];

    for (const t of texts) {
      for (const h of hintsFromText(t, defaultSt)) {
        const key = `${h.stateAbbr}:${h.countyStem}`.toLowerCase();
        if (seen.has(key)) continue;
        if (scopeSt && h.stateAbbr !== scopeSt) continue;
        seen.add(key);
        merged.push(h);
      }
    }

    const props = (row.properties ?? {}) as Record<string, unknown>;
    for (const h of hintsFromProperties(props, defaultSt)) {
      const key = `${h.stateAbbr}:${h.countyStem}`.toLowerCase();
      if (seen.has(key)) continue;
      if (scopeSt && h.stateAbbr !== scopeSt) continue;
      seen.add(key);
      merged.push(h);
    }
  }

  return merged;
}

/** Geocode FEMA / text-only locations (e.g. tribal reservations) → parent county via FCC. */
async function collectGeocodedCountyHints(
  rows: Record<string, unknown>[],
  options?: {
    scopeStateUsps?: string | null;
    jurisdiction?: SubAdminJurisdiction | null;
    maxGeocodes?: number;
  },
): Promise<CountyPopulationHint[]> {
  const scopeSt = options?.scopeStateUsps
    ? (normalizeStateToUsps(options.scopeStateUsps) ?? options.scopeStateUsps.toUpperCase())
    : null;
  const seen = new Set<string>();
  const out: CountyPopulationHint[] = [];
  const max = options?.maxGeocodes ?? 16;
  let used = 0;

  for (const row of rows) {
    if (used >= max) break;

    const coords = extractAlertRowCoordinates({
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
      location: typeof row.location === 'string' ? row.location : '',
    });
    if (coords) continue;

    const location = typeof row.location === 'string' ? row.location.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const query = location || name;
    if (!query || query.length < 4) continue;

    used += 1;
    const geo = await geocodeLocation(query);
    if (!geo) continue;

    if (options?.jurisdiction && !coordinatesInJurisdiction(geo.lat, geo.lon, options.jurisdiction)) {
      continue;
    }

    const hint = await countyHintFromCoordinates(geo.lat, geo.lon);
    if (!hint) continue;
    if (scopeSt && hint.stateAbbr !== scopeSt) continue;
    if (!isCensusCountyStem(hint.countyStem)) continue;

    const key = `${hint.stateAbbr}:${hint.countyStem}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hint);
  }

  return out;
}

async function collectCoordinateCountyHints(
  rows: Record<string, unknown>[],
  options?: {
    scopeStateUsps?: string | null;
    jurisdiction?: SubAdminJurisdiction | null;
  },
): Promise<CountyPopulationHint[]> {
  const scopeSt = options?.scopeStateUsps
    ? (normalizeStateToUsps(options.scopeStateUsps) ?? options.scopeStateUsps.toUpperCase())
    : null;
  const seen = new Set<string>();
  const out: CountyPopulationHint[] = [];

  for (const row of rows) {
    const coords = extractAlertRowCoordinates({
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
      location: typeof row.location === 'string' ? row.location : '',
    });
    if (!coords) continue;

    if (options?.jurisdiction && !coordinatesInJurisdiction(coords.lat, coords.lng, options.jurisdiction)) {
      continue;
    }

    const hint = await countyHintFromCoordinates(coords.lat, coords.lng);
    if (!hint) continue;
    if (scopeSt && hint.stateAbbr !== scopeSt) continue;

    const key = `${hint.stateAbbr}:${hint.countyStem}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...hint, countyFips: hint.countyFips });
  }

  return out;
}

function mergeCountyHints(...groups: CountyPopulationHint[][]): CountyPopulationHint[] {
  const byKey = new Map<string, CountyPopulationHint>();
  for (const group of groups) {
    for (const h of group) {
      const key = `${h.stateAbbr}:${h.countyStem}`.toLowerCase();
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, h);
      } else if (!existing.countyFips && h.countyFips) {
        byKey.set(key, { ...existing, countyFips: h.countyFips });
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Rows used for Census exposure: sub-admins with radius licenses only see incidents inside their radius.
 */
export async function resolveAlertRowsForCensusExposure(
  rows: Record<string, unknown>[],
  jurisdiction?: SubAdminJurisdiction | null,
): Promise<Record<string, unknown>[]> {
  if (!jurisdiction || jurisdiction.coverageType === 'state') {
    return rows;
  }
  return filterHydratedForSubAdminJurisdiction(rows, jurisdiction);
}

/**
 * ACS B01003 county totals for jurisdictions named in active alert / incident rows.
 */
export async function computeCensusExposureFromAlertRows(
  rows: Record<string, unknown>[],
  options?: {
    defaultStateUsps?: string | null;
    scopeStateUsps?: string | null;
    dashboardStateCd?: string;
    jurisdiction?: SubAdminJurisdiction | null;
  },
): Promise<RiskExposureSnapshot | null> {
  const scopedRows = await resolveAlertRowsForCensusExposure(rows, options?.jurisdiction);
  const textHints = collectCountyHintsFromAlertRows(scopedRows, options).filter((h) =>
    isCensusCountyStem(h.countyStem),
  );
  const coordHints = await collectCoordinateCountyHints(scopedRows, {
    scopeStateUsps: options?.scopeStateUsps,
    jurisdiction: options?.jurisdiction,
  });
  const geocodedHints = await collectGeocodedCountyHints(scopedRows, {
    scopeStateUsps: options?.scopeStateUsps,
    jurisdiction: options?.jurisdiction,
  });
  /** Coordinate + geocoded hints first; text hints last (FEMA reservations are not ACS counties). */
  const hints = mergeCountyHints(coordHints, geocodedHints, textHints);
  const dashboardStateCd = (options?.dashboardStateCd ?? options?.scopeStateUsps ?? 'us')
    .trim()
    .toLowerCase();

  const radiusNote =
    options?.jurisdiction?.coverageType === 'radius'
      ? `; ${options.jurisdiction.radiusMile} mi license radius`
      : '';

  const censusVintageLabel =
    dashboardStateCd === 'us'
      ? `U.S. Census ACS ${ACS_YEAR_DEFAULT} (5-year) county / parish totals (B01003); active alert areas (nationwide)${radiusNote}`
      : `U.S. Census ACS ${ACS_YEAR_DEFAULT} (5-year) county / parish totals (B01003); active alert areas (${dashboardStateCd.toUpperCase()})${radiusNote}`;

  if (!hints.length) {
    return {
      populationAffectedEstimate: 0,
      censusVintageLabel,
      countiesResolved: [],
      countyHintsApplied: [],
      countyMatchHints: [],
      centroids: [],
      dashboardStateCd,
    };
  }

  const statesNeeded = [...new Set(hints.map((h) => h.stateAbbr.toLowerCase()))].filter(
    (st) => STATE_USPS_TO_FIPS[st],
  );
  const slugMaps = new Map<string, Map<string, number>>();
  await Promise.all(
    statesNeeded.map(async (st) => {
      slugMaps.set(st, await fetchCountyPopulationSlugMap(st));
    }),
  );

  /** stem → FIPS from incident coordinates (FIRMS / earthquakes without NWS areaDesc). */
  const fipsByCountyKey = new Map<string, string>();
  for (const row of scopedRows) {
    const coords = extractAlertRowCoordinates({
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
      location: typeof row.location === 'string' ? row.location : '',
    });
    if (!coords) continue;
    const coordHint = await countyHintFromCoordinates(coords.lat, coords.lng);
    if (!coordHint?.countyFips) continue;
    const key = `${coordHint.stateAbbr}:${coordHint.countyStem}`.toLowerCase();
    fipsByCountyKey.set(key, coordHint.countyFips);
  }

  let sum = 0;
  const resolved: RiskExposureSnapshot['countiesResolved'] = [];
  const applied: string[] = [];
  const countyMatchHints = hints.map(({ stateAbbr, countyStem }) => ({ stateAbbr, countyStem }));

  for (const h of hints) {
    const stLow = h.stateAbbr.toLowerCase();
    const map = slugMaps.get(stLow);
    let pop = lookupCountyPopulation(map, h.countyStem);
    const hintKey = `${h.stateAbbr}:${h.countyStem}`.toLowerCase();
    const fips = h.countyFips ?? fipsByCountyKey.get(hintKey);
    if ((pop == null || pop <= 0) && fips) {
      pop = (await fetchSingleCountyPopulation(stLow, fips)) ?? undefined;
    }
    applied.push(`${h.countyStem} (${h.stateAbbr})`);
    if (pop != null && pop > 0) {
      sum += pop;
      resolved.push({
        stateAbbr: h.stateAbbr,
        countyStem: h.countyStem,
        label: `${h.countyStem.replace(/\b\w/g, (c) => c.toUpperCase())} County, ${h.stateAbbr}`,
        population: pop,
      });
    }
  }

  let finalVintageLabel = censusVintageLabel;
  if (hints.length > 0 && resolved.length === 0) {
    const censusErr = getLastCensusFetchError();
    if (!censusApiKeyPresent()) {
      finalVintageLabel += '; Set a valid CENSUS_API_KEY in server environment and restart.';
    } else if (censusErr) {
      finalVintageLabel += `; Census API error: ${censusErr}`;
    } else {
      finalVintageLabel += `; Counties identified (${applied.join(', ')}) but population totals could not be matched.`;
    }
  }

  return {
    populationAffectedEstimate: Math.max(0, Math.round(sum)),
    censusVintageLabel: finalVintageLabel,
    countiesResolved: resolved.sort((a, b) => b.population - a.population),
    countyHintsApplied: [...new Set(applied)],
    countyMatchHints,
    centroids: [],
    dashboardStateCd,
  };
}
