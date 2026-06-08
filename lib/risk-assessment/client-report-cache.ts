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
