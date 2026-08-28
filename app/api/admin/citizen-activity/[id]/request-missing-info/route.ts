import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import {
    CITIZEN_ACTIVITY_MISSING_FIELDS,
    type CitizenActivityMissingField,
} from '@/lib/citizen-activity/types';
import {
    getCitizenActivityDetailForAdmin,
    requestCitizenActivityMissingInfo,
} from '@/lib/services/citizen-activity-service';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const ALLOWED_ROLES = new Set(['super-admin', 'admin', 'sub-admin', 'manager']);

export async function POST(req: Request, context: RouteContext) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await context.params;
        const existing = await getCitizenActivityDetailForAdmin(id).catch(() => null);
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const body = (await req.json().catch(() => ({}))) as {
            fields?: CitizenActivityMissingField[];
        };
        const fields = Array.isArray(body.fields)
            ? body.fields.filter((f): f is CitizenActivityMissingField =>
                  (CITIZEN_ACTIVITY_MISSING_FIELDS as readonly string[]).includes(f),
              )
            : undefined;

        const result = await requestCitizenActivityMissingInfo(
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
                { error: 'User already provided details, pictures, and videos' },
                { status: 400 },
            );
        }
        if (msg === 'NOT_FOUND' || msg === 'USER_NOT_FOUND') {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        console.error('POST admin/citizen-activity/[id]/request-missing-info:', e);
        return NextResponse.json({ error: 'Failed to send missing-info request' }, { status: 500 });
    }
}
