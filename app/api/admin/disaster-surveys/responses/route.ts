import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { listDisasterSurveyResponses } from '@/lib/services/disaster-survey-service';
import type { DisasterSurveyFundingStatus } from '@/lib/types/disaster-survey';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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

        const url = new URL(req.url);
        const campaignId = url.searchParams.get('campaignId') ?? undefined;
        const fundingStatus = url.searchParams.get('fundingStatus') as
            | DisasterSurveyFundingStatus
            | undefined;

        const responses = await listDisasterSurveyResponses(role, String(session.user.id), {
            campaignId,
            fundingStatus,
        });
        return NextResponse.json({ responses });
    } catch (e) {
        console.error('GET admin/disaster-surveys/responses:', e);
        return NextResponse.json({ error: 'Failed to load responses' }, { status: 500 });
    }
}
