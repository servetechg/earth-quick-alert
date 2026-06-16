import type {
  HistoricalTabPayload,
  RiskSummaryPayload,
  SeverityBucket,
} from '@/lib/types/risk-assessment';

const CACHE_VERSION = 5;
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

export type CachedAiRiskReport = {
  v: typeof CACHE_VERSION;
  savedAt: string;
  summary: RiskSummaryPayload;
  severityBuckets: SeverityBucket[];
  tabDataMap: Record<string, HistoricalTabPayload>;
};

/** Scope-aware key so sub-admin state reports do not collide with nationwide. */
export function buildAiRiskReportCacheKey(scope: Record<string, unknown>): string {
  if (scope.nationwide === false && typeof scope.stateCd === 'string' && scope.stateCd) {
    return `r2g:ai-risk-report:v${CACHE_VERSION}:state:${scope.stateCd}`;
  }
  return `r2g:ai-risk-report:v${CACHE_VERSION}:nationwide`;
}

export function loadCachedAiRiskReport(cacheKey: string): CachedAiRiskReport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAiRiskReport;
    if (parsed?.v !== CACHE_VERSION || !parsed.summary) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_MS) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedAiRiskReport(
  cacheKey: string,
  data: Omit<CachedAiRiskReport, 'v' | 'savedAt'>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedAiRiskReport = {
      v: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      ...data,
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // Quota exceeded or private mode — ignore silently
  }
}

export function clearCachedAiRiskReport(cacheKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(cacheKey);
  } catch {
    /* ignore */
  }
}

/* ── Threat Detection card row (small, scope-keyed) — mirrors the helpers above ── */

// v2: KPIs now sourced from computeRiskSnapshot on both /summary and /analyze (aligned formulas);
// bump invalidates rows cached under the old, divergent /analyze values.
// v3: affected-area fallback now defaults to "United States" (never "Regional scope");
// bump discards rows cached with the old vague label.
const THREAT_CARD_VERSION = 3;

export type ThreatCardRow = {
  relevance: 'High' | 'Medium' | 'Low';
  severity: string;
  affectedAreas: string;
  confidence: number;
};

type CachedThreatRow = { v: number; savedAt: string; row: ThreatCardRow };

/** The most-recent row regardless of scope — lets the card paint instantly before scope resolves. */
export const THREAT_CARD_LAST_KEY = `r2g:threat-card:v${THREAT_CARD_VERSION}:last`;

/** Scope-aware key (per resolved affected-area label) so different states don't collide. */
export function buildThreatCardCacheKey(scopeLabel: string): string {
  const safe = (scopeLabel || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return `r2g:threat-card:v${THREAT_CARD_VERSION}:${safe}`;
}

export function loadCachedThreatRow(cacheKey: string): ThreatCardRow | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedThreatRow;
    if (parsed?.v !== THREAT_CARD_VERSION || !parsed.row) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_MS) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.row;
  } catch {
    return null;
  }
}

/** Saves under both the scoped key and the generic ":last" key. */
export function saveCachedThreatRow(cacheKey: string, row: ThreatCardRow): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedThreatRow = { v: THREAT_CARD_VERSION, savedAt: new Date().toISOString(), row };
    const serialized = JSON.stringify(payload);
    sessionStorage.setItem(cacheKey, serialized);
    if (cacheKey !== THREAT_CARD_LAST_KEY) sessionStorage.setItem(THREAT_CARD_LAST_KEY, serialized);
  } catch {
    // Quota exceeded or private mode — ignore silently
  }
}
