import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { getCurrentEvents } from '@/lib/services/unified-event-repo';
import { computeRiskSnapshot } from '@/lib/services/risk-current-snapshot';
import { resolveRiskIngestScopeForSession } from '@/lib/risk-assessment/resolve-ingest-scope';
import { openaiService } from '@/lib/services/openai-service';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

/** In-process cache: keyed by `userId:stateCd`, 60-second TTL */
const cache = new Map<string, { data: unknown; expiresAt: number }>();

export async function GET(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(req.url);
        const bodyStateCd = url.searchParams.get('stateCd') ?? undefined;
        const bodyNationwide = url.searchParams.get('nationwide') !== 'false';

        const scope = await resolveRiskIngestScopeForSession(
            role,
            session.user.id as string | undefined,
            { nationwide: bodyNationwide, stateCd: bodyStateCd },
        );

        const cacheKey = `${session.user.id}:${scope.stateCd}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return NextResponse.json(cached.data);
        }

        const events = await getCurrentEvents({ stateCd: scope.nationwide ? undefined : scope.stateCd });
        const aiAvailable = openaiService.isAvailable();
        const snapshot = computeRiskSnapshot(events, { aiAvailable });

        // Strip raw event arrays from the response (only needed server-side)
        const { severity_buckets, ...rest } = snapshot;
        const response = {
            ...rest,
            ai_available: aiAvailable,
            severity_buckets: severity_buckets.map((b) => ({
                severity: b.severity,
                categories: b.categories.map((c) => ({
                    category: c.category,
                    eventCount: c.events.length,
                })),
            })),
        };

        cache.set(cacheKey, { data: response, expiresAt: Date.now() + 60_000 });
        return NextResponse.json(response);
    } catch (e: any) {
        console.error('risk-assessment/summary:', e);
        return NextResponse.json({ error: 'Failed to compute summary', message: e?.message }, { status: 500 });
    }
}
