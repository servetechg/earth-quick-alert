import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { normalizeUnifiedEventCategory } from '@/lib/unified-event/category-infer';
import type { DistroPoint, RiskSummaryPayload } from '@/lib/types/risk-assessment';

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

function deriveAiConfidence(events: UnifiedEventDoc[]): number {
    if (events.length === 0) return 0;
    const distinctSources = new Set(events.map((e) => e.source)).size;
    const distinctCats = new Set(events.map((e) => normalizeUnifiedEventCategory(e.category))).size;
    const hasProps = events.some(
        (e) => e.properties && Object.keys(e.properties).length > 0,
    );
    let conf = 60;
    if (events.length >= 5) conf += 15;
    if (distinctCats >= 3) conf += 10;
    if (hasProps) conf += 10;
    if (distinctSources >= 3) conf += 5;
    return Math.min(100, conf);
}

export function computeRiskSnapshot(events: UnifiedEventDoc[]): RiskSnapshot {
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

    return {
        generated_at: new Date().toISOString(),
        overall_risk_level,
        alerts_count,
        major_incidents,
        minor_incidents,
        incident_distribution,
        active_categories,
        active_severities,
        ai_confidence: deriveAiConfidence(events),
        populations_at_risk: 0, // deferred; UI shows em-dash when 0
        sources_count: distinctSources.size,
        severity_buckets,
    };
}
