import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { openaiService } from '@/lib/services/openai-service';
import type { RecommendationItem } from '@/lib/types/risk-assessment';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

export async function POST(req: Request) {
    try {
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: { futureMeasuresByCategory?: Record<string, string[]> } = {};
        try { body = await req.json(); } catch { /* empty body */ }

        const futureMeasuresByCategory = body.futureMeasuresByCategory ?? {};

        const recommendations_list: RecommendationItem[] = await openaiService.generateStrategicPlan({
            futureMeasuresByCategory,
        });

        return NextResponse.json({ recommendations_list });
    } catch (e: any) {
        console.error('risk-assessment/strategic-plan:', e);
        return NextResponse.json({ error: 'Failed to generate strategic plan', message: e?.message }, { status: 500 });
    }
}
