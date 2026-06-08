import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { fetchPopulationAtRiskAlignedEventFeed } from '@/lib/services/alert-communication-aligned-feed';
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
    count: number;
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
            return NextResponse.json({ count: users.length, users } satisfies PopulationAtRiskResponse);
        }

        const url = new URL(req.url);
        const bodyStateCd = url.searchParams.get('stateCd') ?? undefined;
        const bodyNationwide = url.searchParams.get('nationwide') !== 'false';

        const scope = await resolveRiskIngestScopeForSession(role, session.user.id as string | undefined, {
            nationwide: bodyNationwide,
            stateCd: bodyStateCd,
        });

        const cacheKey = buildPopulationAtRiskCacheKey(session.user.id as string, scope.stateCd);
        const cached = getPopulationAtRiskCache(cacheKey);
        if (cached) {
            return NextResponse.json({ count: cached.length, users: cached } satisfies PopulationAtRiskResponse);
        }

        const alignedCards = await fetchPopulationAtRiskAlignedEventFeed({
            userId: session.user.id as string | undefined,
            role,
        });

        const jurisdiction =
            role === 'sub-admin'
                ? await resolveSubAdminJurisdiction(session.user.id as string)
                : null;

        const users = await listUsersInAlignedAlertAreas(alignedCards, jurisdiction);
        setPopulationAtRiskCache(cacheKey, users);

        return NextResponse.json({ count: users.length, users } satisfies PopulationAtRiskResponse);
    } catch (e: unknown) {
        console.error('risk-assessment/population-at-risk:', e);
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to load population at risk', message },
            { status: 500 },
        );
    }
}
