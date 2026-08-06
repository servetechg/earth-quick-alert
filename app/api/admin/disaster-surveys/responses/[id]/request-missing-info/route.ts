import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import {
    getDisasterSurveyResponseDetail,
    requestDisasterSurveyMissingInfo,
} from '@/lib/services/disaster-survey-service';
import type { DisasterSurveyMissingField } from '@/lib/types/disaster-survey';
import { DISASTER_SURVEY_MISSING_FIELDS } from '@/lib/types/disaster-survey';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: RouteContext) {
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

        const { id } = await context.params;
        const existing = await getDisasterSurveyResponseDetail(id, role, String(session.user.id));
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const body = (await req.json().catch(() => ({}))) as {
            fields?: DisasterSurveyMissingField[];
        };
        const fields = Array.isArray(body.fields)
            ? body.fields.filter((f): f is DisasterSurveyMissingField =>
                  (DISASTER_SURVEY_MISSING_FIELDS as readonly string[]).includes(f),
              )
            : undefined;

        const result = await requestDisasterSurveyMissingInfo(
            id,
            String(session.user.id),
            fields,
        );

        return NextResponse.json({
            message: 'Missing-info request sent',
            ...result,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'NOTHING_MISSING') {
            return NextResponse.json(
                { error: 'User already provided comments, pictures, and videos' },
                { status: 400 },
            );
        }
        if (msg === 'RESPONSE_NOT_FOUND' || msg === 'USER_NOT_FOUND') {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        console.error('POST admin/disaster-surveys/responses/[id]/request-missing-info:', e);
        return NextResponse.json({ error: 'Failed to send missing-info request' }, { status: 500 });
    }
}
