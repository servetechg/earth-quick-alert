import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import {
    getDisasterSurveyResponseDetail,
    updateDisasterSurveyFunding,
} from '@/lib/services/disaster-survey-service';
import type { DisasterSurveyFundingStatus } from '@/lib/types/disaster-survey';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
    try {
        await connectDB();
        const session = await getSession(_req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const role = String(session.user.role ?? '').toLowerCase();
        if (role !== 'super-admin' && role !== 'sub-admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await context.params;
        const detail = await getDisasterSurveyResponseDetail(id, role, String(session.user.id));
        if (!detail) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        return NextResponse.json({ response: detail });
    } catch (e) {
        console.error('GET admin/disaster-surveys/responses/[id]:', e);
        return NextResponse.json({ error: 'Failed to load response' }, { status: 500 });
    }
}

export async function PATCH(req: Request, context: RouteContext) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const role = String(session.user.role ?? '').toLowerCase();
        if (role !== 'super-admin' && role !== 'sub-admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = (await req.json()) as {
            fundingStatus?: DisasterSurveyFundingStatus;
            fundingNotes?: string;
        };
        const allowed: DisasterSurveyFundingStatus[] = [
            'pending',
            'approved',
            'denied',
            'needs_info',
        ];
        if (!body.fundingStatus || !allowed.includes(body.fundingStatus)) {
            return NextResponse.json({ error: 'Invalid fundingStatus' }, { status: 400 });
        }

        const { id } = await context.params;
        const existing = await getDisasterSurveyResponseDetail(id, role, String(session.user.id));
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const updated = await updateDisasterSurveyFunding(id, String(session.user.id), {
            fundingStatus: body.fundingStatus,
            fundingNotes: body.fundingNotes,
        });
        return NextResponse.json({ response: updated });
    } catch (e) {
        console.error('PATCH admin/disaster-surveys/responses/[id]:', e);
        return NextResponse.json({ error: 'Failed to update funding status' }, { status: 500 });
    }
}
