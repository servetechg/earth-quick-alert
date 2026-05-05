/**
 * Phase 4 — combine normalized severity, confidence, and recency into a single 0–100 score,
 * then re-derive alert_level. Used by stream processor and API routes after normalization.
 */

import type { UnifiedEvent, AlertLevel } from '@/lib/normalization/types';

interface ScoringWeights {
    severity: number;
    confidence: number;
    recency: number;
}

const WEIGHTS: ScoringWeights = {
    severity: 0.65,
    confidence: 0.2,
    recency: 0.15,
};

const CONFIDENCE_BONUS = { high: 1.0, nominal: 0.75, low: 0.5 } as const;

/** Single-event composite score (0–100). */
export function scoreEvent(event: UnifiedEvent): number {
    const severityPart = event.severity_score * WEIGHTS.severity;
    const confidencePart =
        CONFIDENCE_BONUS[event.confidence_level] * 100 * WEIGHTS.confidence;
    const recencyPart = getRecencyScore(event.valid_at) * WEIGHTS.recency;

    return Math.min(100, Math.round(severityPart + confidencePart + recencyPart));
}

/** Recency: 100 if under 15 minutes old, decays to 0 over 6 hours. */
function getRecencyScore(isoDate: string): number {
    const t = new Date(isoDate).getTime();
    if (Number.isNaN(t)) return 50;

    const ageMinutes = (Date.now() - t) / 60000;
    if (ageMinutes <= 15) return 100;
    if (ageMinutes >= 360) return 0;
    return Math.round(100 * (1 - (ageMinutes - 15) / (360 - 15)));
}

function scoreToAlertLevel(score: number): AlertLevel {
    if (score >= 75) return 'emergency';
    if (score >= 50) return 'warning';
    if (score >= 25) return 'watch';
    return 'normal';
}

/** Apply Phase 4 scoring to each event and refresh severity_score + alert_level. */
export function scoreAll(events: UnifiedEvent[]): UnifiedEvent[] {
    return events.map((event) => {
        const finalScore = scoreEvent(event);
        return {
            ...event,
            severity_score: finalScore,
            alert_level: scoreToAlertLevel(finalScore),
        };
    });
}
