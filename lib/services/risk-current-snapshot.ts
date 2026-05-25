import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { normalizeUnifiedEventCategory } from '@/lib/unified-event/category-infer';
import type { ConfidenceFactor, DistroPoint, RiskSummaryPayload } from '@/lib/types/risk-assessment';
import { computeAiConfidence } from '@/lib/services/risk-ai-confidence';

export interface SeverityCategoryGroup {
    category: string;
    events: UnifiedEventDoc[];
}

export interface SeverityBucketRaw {
    severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
    categories: SeverityCategoryGroup[];
}

export interface RiskSnapshot extends RiskSummaryPayload {
    severity_buckets: SeverityBucketRaw[];
    ai_confidence_breakdown: ConfidenceFactor[];
}

const SEVERITY_SCORE: Record<string, number> = {
    Low: 1,
    Moderate: 2,
    High: 3,
    Extreme: 4,
};

const SEVERITY_ORDER: Array<'Extreme' | 'High' | 'Moderate' | 'Low'> = [
    'Extreme',
    'High',
    'Moderate',
    'Low',
];

function deriveOverallThreatLevel(avg: number): string {
    if (avg >= 3.5) return 'SEVERE';
    if (avg >= 2.75) return 'HIGH';
    if (avg >= 2.0) return 'ELEVATED';
    if (avg >= 1.5) return 'MODERATE';
    return 'LOW';
}

export function computeRiskSnapshot(
    events: UnifiedEventDoc[],
    opts: { aiAvailable?: boolean } = {},
): RiskSnapshot {
    const alerts_count = events.length;
    const major_incidents = events.filter(
        (e) => e.severity === 'High' || e.severity === 'Extreme',
    ).length;
    const minor_incidents = alerts_count - major_incidents;

    const avgScore =
        alerts_count > 0
            ? events.reduce((sum, e) => sum + (SEVERITY_SCORE[e.severity] ?? 2), 0) / alerts_count
            : 0;
    const overall_risk_level = deriveOverallThreatLevel(avgScore);

    // Incident distribution grouped by category
    const catCountMap = new Map<string, number>();
    for (const e of events) {
        const cat = normalizeUnifiedEventCategory(e.category);
        catCountMap.set(cat, (catCountMap.get(cat) ?? 0) + 1);
    }
    const incident_distribution: DistroPoint[] = [...catCountMap.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
    const active_categories = incident_distribution.map((d) => d.category);

    // Severity buckets: group events by severity then by category
    const sevMap = new Map<string, Map<string, UnifiedEventDoc[]>>();
    for (const e of events) {
        if (!sevMap.has(e.severity)) sevMap.set(e.severity, new Map());
        const cm = sevMap.get(e.severity)!;
        const cat = normalizeUnifiedEventCategory(e.category);
        if (!cm.has(cat)) cm.set(cat, []);
        cm.get(cat)!.push(e);
    }

    const active_severities = SEVERITY_ORDER.filter((s) => sevMap.has(s));
    const severity_buckets: SeverityBucketRaw[] = active_severities.map((sev) => ({
        severity: sev,
        categories: [...sevMap.get(sev)!.entries()].map(([category, evts]) => ({
            category,
            events: evts,
        })),
    }));

    const distinctSources = new Set(events.map((e) => e.source));

    const confidence = computeAiConfidence({
        events,
        aiAvailable: opts.aiAvailable ?? false,
    });

    return {
        generated_at: new Date().toISOString(),
        overall_risk_level,
        alerts_count,
        major_incidents,
        minor_incidents,
        incident_distribution,
        active_categories,
        active_severities,
        ai_confidence: confidence.score,
        ai_confidence_breakdown: confidence.breakdown,
        populations_at_risk: 0, // deferred; UI shows em-dash when 0
        sources_count: distinctSources.size,
        severity_buckets,
    };
}
