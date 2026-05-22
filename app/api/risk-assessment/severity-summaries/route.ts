import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { getCurrentEvents } from '@/lib/services/unified-event-repo';
import { computeRiskSnapshot } from '@/lib/services/risk-current-snapshot';
import { openaiService } from '@/lib/services/openai-service';
import { resolveRiskIngestScopeForSession } from '@/lib/risk-assessment/resolve-ingest-scope';
import type { SeverityBucket } from '@/lib/types/risk-assessment';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

const cache = new Map<string, { data: unknown; expiresAt: number }>();

/** Simple semaphore to limit concurrent OpenAI calls */
async function withConcurrencyLimit<T>(
    tasks: (() => Promise<T>)[],
    limit: number,
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let index = 0;

    async function worker() {
        while (index < tasks.length) {
            const i = index++;
            results[i] = await tasks[i]();
        }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
    await Promise.all(workers);
    return results;
}

export async function POST(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: { stateCd?: string; nationwide?: boolean } = {};
        try { body = await req.json(); } catch { /* empty body */ }

        const scope = await resolveRiskIngestScopeForSession(
            role,
            session.user.id as string | undefined,
            body,
        );

        const cacheKey = `sev:${session.user.id}:${scope.stateCd}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return NextResponse.json(cached.data);
        }

        const events = await getCurrentEvents({ stateCd: scope.nationwide ? undefined : scope.stateCd });
        const snapshot = computeRiskSnapshot(events);

        // Build one AI task per (severity, category) pair
        type BucketResult = { severity: string; category: string; eventCount: number; bullets: string[] };
        const tasks: (() => Promise<BucketResult>)[] = [];

        for (const bucket of snapshot.severity_buckets) {
            for (const catGroup of bucket.categories) {
                tasks.push(async () => {
                    const bullets = await openaiService.generateSeverityCategorySummary({
                        severity: bucket.severity,
                        category: catGroup.category,
                        events: catGroup.events,
                    });
                    return {
                        severity: bucket.severity,
                        category: catGroup.category,
                        eventCount: catGroup.events.length,
                        bullets,
                    };
                });
            }
        }

        const flat = await withConcurrencyLimit(tasks, 6);

        // Re-group into severity buckets
        const bucketMap = new Map<string, SeverityBucket>();
        for (const item of flat) {
            if (!bucketMap.has(item.severity)) {
                bucketMap.set(item.severity, {
                    severity: item.severity as SeverityBucket['severity'],
                    categories: [],
                });
            }
            bucketMap.get(item.severity)!.categories.push({
                category: item.category,
                eventCount: item.eventCount,
                bullets: item.bullets,
            });
        }

        const buckets = ['Extreme', 'High', 'Moderate', 'Low']
            .filter((s) => bucketMap.has(s))
            .map((s) => bucketMap.get(s)!);

        const response = { buckets };
        cache.set(cacheKey, { data: response, expiresAt: Date.now() + 60_000 });
        return NextResponse.json(response);
    } catch (e: any) {
        console.error('risk-assessment/severity-summaries:', e);
        return NextResponse.json({ error: 'Failed to generate severity summaries', message: e?.message }, { status: 500 });
    }
}
