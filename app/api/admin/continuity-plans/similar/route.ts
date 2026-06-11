import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ContinuityPlan from '@/models/ContinuityPlan';
import { getSession } from '@/lib/auth';
import { fetchSimilarFilesViaPython } from '@/lib/services/python-integrity-client';

export const runtime = 'nodejs';

function canManageEmergencyPlans(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin' || role === 'admin';
}

/**
 * Live duplicate / related files for one attachment across the tenant vault (§4.3).
 * GET ?attachmentId=...  →  { success, data: SimilarFile[] } enriched with the plan label.
 */
export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const attachmentId = new URL(req.url).searchParams.get('attachmentId')?.trim();
        if (!attachmentId) {
            return NextResponse.json({ success: false, error: 'attachmentId is required' }, { status: 400 });
        }

        await connectDB();
        const ownerUserId = session.user.id;

        const similar = await fetchSimilarFilesViaPython(String(ownerUserId), attachmentId);

        // Enrich each match with a human-readable plan label.
        let labelByPlanId: Record<string, string> = {};
        if (similar.length) {
            const plans = await ContinuityPlan.find({ ownerUserId })
                .select('planId label')
                .lean<Array<{ planId: string; label: string }>>();
            labelByPlanId = Object.fromEntries(plans.map((p) => [p.planId, p.label]));
        }

        const data = similar.map((s) => ({
            ...s,
            planLabel: labelByPlanId[s.planId] ?? s.planId,
        }));

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('ContinuityPlan similar error:', error);
        // Degrade gracefully — never block the modal on a vector-store hiccup.
        return NextResponse.json({ success: true, data: [] });
    }
}
