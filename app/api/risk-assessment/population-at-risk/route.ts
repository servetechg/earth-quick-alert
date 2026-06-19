import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { fetchAlignedUnifiedEventFeed, fetchPopulationAtRiskAlignedEventFeed } from '@/lib/services/alert-communication-aligned-feed';
import { resolveRiskIngestScopeForSession } from '@/lib/risk-assessment/resolve-ingest-scope';
import { listUsersInAlignedAlertAreas } from '@/lib/services/users-in-aligned-alert-areas';
import {
    buildPopulationAtRiskCacheKey,
    getPopulationAtRiskCache,
    setPopulationAtRiskCache,
} from '@/lib/services/population-at-risk-cache';
import { resolveSubAdminJurisdiction } from '@/lib/sub-admin/jurisdiction';
import { resolveDemoSessionContext } from '@/lib/demo/provider';
import { DEMO_CITIZEN_MARKERS } from '@/lib/demo/data/little-rock-tornado-2023';
import { buildDemoAnalyzeResponse } from '@/lib/demo/build-risk-responses';
import { computeCensusExposureFromAlertRows } from '@/lib/services/alert-area-census-exposure';
import type { RiskExposureSnapshot } from '@/lib/types/risk-assessment';

const ALLOWED_ROLES = new Set([
    'admin',
    'super-admin',
    'sub-admin',
    'eoc-manager',
    'eoc-observer',
    'manager',
    'responder',
    'observer',
]);

export type PopulationAtRiskResponse = {
    /** U.S. Census ACS estimate for counties in active alert areas. */
    census_population_estimate: number;
    census_vintage_label?: string;
    counties_resolved?: RiskExposureSnapshot['countiesResolved'];
    ready2go_users_count: number;
    users: Array<{
        id: string;
        name: string;
        email: string;
        address: string;
    }>;
};

export async function GET(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );
        if (demoCtx) {
            const users = DEMO_CITIZEN_MARKERS.map((c, i) => ({
                id: c.id,
                name: c.title,
                email: `citizen${i + 1}@demo.ready2go.app`,
                address: c.location,
            }));
            const demoAnalyze = buildDemoAnalyzeResponse();
            const exposure = demoAnalyze.population_exposure;
            return NextResponse.json({
                census_population_estimate: exposure?.populationAffectedEstimate ?? 412_000,
                census_vintage_label: exposure?.censusVintageLabel,
                counties_resolved: exposure?.countiesResolved ?? [],
                ready2go_users_count: users.length,
                users,
            } satisfies PopulationAtRiskResponse);
        }

        const url = new URL(req.url);
        const bodyStateCd = url.searchParams.get('stateCd') ?? undefined;
        const bodyNationwide = url.searchParams.get('nationwide') !== 'false';

        const scope = await resolveRiskIngestScopeForSession(role, session.user.id as string | undefined, {
            nationwide: bodyNationwide,
            stateCd: bodyStateCd,
        });

        const cacheKey = buildPopulationAtRiskCacheKey(session.user.id as string, scope.stateCd);
        const cached = await getPopulationAtRiskCache(cacheKey);
        if (cached) {
            return NextResponse.json({
                census_population_estimate: 0,
                ready2go_users_count: cached.length,
                users: cached,
            } satisfies PopulationAtRiskResponse);
        }

        const jurisdiction =
            role === 'sub-admin'
                ? await resolveSubAdminJurisdiction(session.user.id as string)
                : null;

        const scopeStateUsps = jurisdiction?.stateCode ?? (scope.stateCd !== 'us' ? scope.stateCd.toUpperCase() : null);

        const censusRows = await fetchAlignedUnifiedEventFeed({
            userId: session.user.id as string | undefined,
            role,
        });
        const userRows = await fetchPopulationAtRiskAlignedEventFeed({
            userId: session.user.id as string | undefined,
            role,
        });

        const populationExposure = await computeCensusExposureFromAlertRows(censusRows, {
            defaultStateUsps: scopeStateUsps,
            scopeStateUsps,
            dashboardStateCd: scope.stateCd,
            jurisdiction,
        });

        const users = await listUsersInAlignedAlertAreas(userRows, jurisdiction);
        await setPopulationAtRiskCache(cacheKey, users);

        return NextResponse.json({
            census_population_estimate: populationExposure?.populationAffectedEstimate ?? 0,
            census_vintage_label: populationExposure?.censusVintageLabel,
            counties_resolved: populationExposure?.countiesResolved ?? [],
            ready2go_users_count: users.length,
            users,
        } satisfies PopulationAtRiskResponse);
    } catch (e: unknown) {
        console.error('risk-assessment/population-at-risk:', e);
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to load population at risk', message },
            { status: 500 },
        );
    }
}
