import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { extractEventTimestamp } from '@/lib/services/event-formatters';
import type { ConfidenceFactor, AiConfidenceResult } from '@/lib/types/risk-assessment';

/**
 * Computes a transparent, multi-factor AI Confidence score (0-100).
 *
 * Four earnable factors:
 *   1. Source Diversity      — multi-feed corroboration              (max 30)
 *   2. Data Freshness        — median event age                      (max 30)
 *   3. Data Completeness     — properties + geolocation coverage     (max 25)
 *   4. AI Service Availability — OpenAI configured                   (max 15)
 *                                                                Σ = 100
 */

export function computeAiConfidence(input: {
    events: UnifiedEventDoc[];
    aiAvailable: boolean;
}): AiConfidenceResult {
    const { events, aiAvailable } = input;

    if (events.length === 0) {
        return {
            score: 0,
            breakdown: [
                {
                    factor: 'No active events',
                    score: 0,
                    max: 100,
                    reason: 'No live data is available to assess.',
                },
            ],
        };
    }

    const breakdown: ConfidenceFactor[] = [];

    // ── 1. Source Diversity (max 30) ─────────────────────────────────────────
    const sources = new Set(events.map((e) => e.source));
    const ns = sources.size;
    let srcScore: number;
    let srcReason: string;
    if (ns >= 5) { srcScore = 30; srcReason = `${ns} authoritative feeds corroborating — full cross-source coverage.`; }
    else if (ns === 4) { srcScore = 24; srcReason = `4 sources corroborating.`; }
    else if (ns === 3) { srcScore = 18; srcReason = `3 sources corroborating.`; }
    else if (ns === 2) { srcScore = 12; srcReason = `2 sources — limited cross-feed validation.`; }
    else {
        const only = [...sources][0] ?? 'unknown';
        srcScore = 4;
        srcReason = `Single source (${only}) — no cross-feed validation.`;
    }
    breakdown.push({ factor: 'Source Diversity', score: srcScore, max: 30, reason: srcReason });

    // ── 2. Data Freshness (max 30) ───────────────────────────────────────────
    const now = Date.now();
    const agesHours = events
        .map((e) => extractEventTimestamp(e))
        .filter((d): d is Date => d != null)
        .map((d) => (now - d.getTime()) / (1000 * 60 * 60));
    agesHours.sort((a, b) => a - b);
    const median = agesHours.length ? agesHours[Math.floor(agesHours.length / 2)] : null;

    let freshScore: number;
    let freshReason: string;
    if (median == null) {
        freshScore = 2;
        freshReason = 'No parseable timestamps — freshness unknown.';
    } else if (median < 1) {
        freshScore = 30; freshReason = `Median event age ${formatHours(median)} — very fresh.`;
    } else if (median < 6) {
        freshScore = 24; freshReason = `Median event age ${formatHours(median)} — fresh.`;
    } else if (median < 24) {
        freshScore = 16; freshReason = `Median event age ${formatHours(median)} — recent.`;
    } else if (median < 72) {
        freshScore = 8; freshReason = `Median event age ${formatHours(median)} — aging.`;
    } else {
        freshScore = 2; freshReason = `Median event age ${formatHours(median)} — stale.`;
    }
    breakdown.push({ factor: 'Data Freshness', score: freshScore, max: 30, reason: freshReason });

    // ── 3. Data Completeness (max 25) ────────────────────────────────────────
    const n = events.length;
    const withProps = events.filter((e) => e.properties && Object.keys(e.properties).length > 0).length;
    const withGeo = events.filter((e) => e.lat != null && e.lng != null).length;
    const propsPct = withProps / n;
    const geoPct = withGeo / n;
    const completePct = (propsPct + geoPct) / 2;

    let compScore: number;
    if (completePct >= 0.95) compScore = 25;
    else if (completePct >= 0.85) compScore = 20;
    else if (completePct >= 0.60) compScore = 14;
    else if (completePct >= 0.30) compScore = 8;
    else compScore = 2;
    const compReason = `${Math.round(propsPct * 100)}% have category properties, ${Math.round(geoPct * 100)}% are geolocated.`;
    breakdown.push({ factor: 'Data Completeness', score: compScore, max: 25, reason: compReason });

    // ── 4. AI Service Availability (max 15) ──────────────────────────────────
    const aiScore = aiAvailable ? 15 : 0;
    const aiReason = aiAvailable
        ? 'OpenAI active — AI-generated narratives in use.'
        : 'OpenAI key not configured — deterministic fallbacks only.';
    breakdown.push({ factor: 'AI Service Availability', score: aiScore, max: 15, reason: aiReason });

    const earned = breakdown.reduce((s, f) => s + f.score, 0);
    return { score: Math.min(100, Math.round(earned)), breakdown };
}

function formatHours(h: number): string {
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
}
