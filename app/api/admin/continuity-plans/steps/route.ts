import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ContinuityPlan from '@/models/ContinuityPlan';
import { getSession } from '@/lib/auth';

function canManageEmergencyPlans(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin' || role === 'admin';
}

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const { planId, steps } = await req.json();

        if (!planId || !Array.isArray(steps)) {
            return NextResponse.json({ success: false, error: 'Missing plan ID or valid steps array' }, { status: 400 });
        }

        const ownerUserId = session.user.id;
        let plan = await ContinuityPlan.findOne({ ownerUserId, planId });
        if (!plan) {
            plan = new ContinuityPlan({
                ownerUserId,
                licenseId: session.user.licenseId ?? null,
                planId,
                label: planId.replace(/_/g, ' ').toUpperCase(),
                overview: `Emergency Plan for ${planId}`,
                steps: steps,
                attachments: []
            });
        } else {
            plan.steps = steps;
        }

        await plan.save();

        return NextResponse.json({ success: true, message: 'Steps updated successfully', data: plan });
    } catch (error) {
        console.error('ContinuityPlan Steps POST error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
