import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { computeRiskSnapshot } from '@/lib/services/risk-current-snapshot';
import { applyRiskReportToAlignedAlertFeed } from '@/lib/services/risk-report-alert-alignment';
import { openaiService } from '@/lib/services/openai-service';
import { listUsersInAlignedAlertAreas } from '@/lib/services/users-in-aligned-alert-areas';
import {
    buildPopulationAtRiskCacheKey,
    setPopulationAtRiskCache,
} from '@/lib/services/population-at-risk-cache';
import { resolveSubAdminJurisdiction } from '@/lib/sub-admin/jurisdiction';
import { computeCensusExposureFromAlertRows } from '@/lib/services/alert-area-census-exposure';
import { computeCriticalInfraAtRiskFromAlertRows } from '@/lib/services/alert-area-critical-infra-exposure';
import {
    fetchPopulationAtRiskAlignedEventFeed,
    loadAlignedUnifiedEventBundle,
} from '@/lib/services/alert-communication-aligned-feed';
import type { ResolvedRiskIngestScope } from '@/lib/risk-assessment/resolve-ingest-scope';

export interface RiskSummaryEnrichment {
    populations_at_risk: number;
    ready2go_users_at_risk: number;
    population_exposure: Awaited<ReturnType<typeof computeCensusExposureFromAlertRows>>;
    population_at_risk_users: Awaited<ReturnType<typeof listUsersInAlignedAlertAreas>>;
    critical_infrastructure_at_risk: Awaited<ReturnType<typeof computeCriticalInfraAtRiskFromAlertRows>>;
}

function stripSeverityBuckets(snapshot: ReturnType<typeof computeRiskSnapshot>) {
    const { severity_buckets, ...rest } = snapshot;
    return {
        rest,
        severity_buckets: severity_buckets.map((b) => ({
            severity: b.severity,
            categories: b.categories.map((c) => ({
                category: c.category,
                eventCount: c.events.length,
            })),
        })),
    };
}

export async function buildLiteRiskSummary(options: {
    userId: string | undefined;
    role: string;
    events: UnifiedEventDoc[];
    alignedCards: Record<string, unknown>[];
}) {
    const aiAvailable = openaiService.isAvailable();
    const snapshot = computeRiskSnapshot(options.events, { aiAvailable });
    const aligned = applyRiskReportToAlignedAlertFeed(
        {
            ...snapshot,
            recommendations: '',
            recommendations_list: [],
            historical_analysis: {},
        } as unknown as Parameters<typeof applyRiskReportToAlignedAlertFeed>[0],
        options.alignedCards,
    );
    const { rest, severity_buckets } = stripSeverityBuckets(snapshot);

    return {
        ...rest,
        alerts_count: aligned.alerts_count,
        major_incidents: aligned.major_incidents,
        minor_incidents: aligned.minor_incidents,
        incident_distribution: aligned.incident_distribution,
        populations_at_risk: 0,
        ready2go_users_at_risk: 0,
        population_exposure: null,
        population_at_risk_users: [] as RiskSummaryEnrichment['population_at_risk_users'],
        critical_infrastructure_at_risk: [] as RiskSummaryEnrichment['critical_infrastructure_at_risk'],
        ai_available: aiAvailable,
        severity_buckets,
    };
}

export async function buildRiskSummaryEnrichment(options: {
    userId: string | undefined;
    role: string;
    scope: ResolvedRiskIngestScope;
    alignedCards: Record<string, unknown>[];
}): Promise<RiskSummaryEnrichment> {
    const jurisdiction =
        options.role === 'sub-admin' && options.userId
            ? await resolveSubAdminJurisdiction(options.userId)
            : null;

    const populationAtRiskRows = await fetchPopulationAtRiskAlignedEventFeed({
        userId: options.userId,
        role: options.role,
    });

    const scopeStateUsps =
        jurisdiction?.stateCode ??
        (options.scope.stateCd !== 'us' ? options.scope.stateCd.toUpperCase() : null);

    const [populationAtRiskUsers, populationExposure, criticalInfrastructureAtRisk] =
        await Promise.all([
            listUsersInAlignedAlertAreas(populationAtRiskRows, jurisdiction),
            computeCensusExposureFromAlertRows(options.alignedCards, {
                defaultStateUsps: scopeStateUsps,
                scopeStateUsps,
                dashboardStateCd: options.scope.stateCd,
                jurisdiction,
            }),
            computeCriticalInfraAtRiskFromAlertRows(options.alignedCards, { jurisdiction }),
        ]);

    if (options.userId) {
        await setPopulationAtRiskCache(
            buildPopulationAtRiskCacheKey(options.userId, options.scope.stateCd),
            populationAtRiskUsers,
        );
    }

    return {
        populations_at_risk: populationExposure?.populationAffectedEstimate ?? 0,
        ready2go_users_at_risk: populationAtRiskUsers.length,
        population_exposure: populationExposure,
        population_at_risk_users: populationAtRiskUsers,
        critical_infrastructure_at_risk: criticalInfrastructureAtRisk,
    };
}

export async function loadAlignedEventsForRiskSummary(options: {
    userId: string | undefined;
    role: string;
}) {
    return loadAlignedUnifiedEventBundle({
        userId: options.userId,
        role: options.role,
        syncFeeds: false,
    });
}
