import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { requestIdaMissingInfo } from '@/lib/services/ida-service';
import { IDA_MISSING_FIELD_IDS, type IdaMissingFieldId } from '@/lib/types/ida';

export const dynamic = 'force-dynamic';

export async function POST(
    req: Request,
    ctx: { params: Promise<{ id: string }> },
) {
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

        const { id } = await ctx.params;
        const body = (await req.json()) as { fields?: string[] };
        const fields = (body.fields ?? []).filter((f): f is IdaMissingFieldId =>
            (IDA_MISSING_FIELD_IDS as readonly string[]).includes(f),
        );
        if (fields.length === 0) {
            return NextResponse.json({ error: 'Select at least one field' }, { status: 400 });
        }

        const result = await requestIdaMissingInfo(id, String(session.user.id), fields);
        return NextResponse.json(result);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'REQUEST_FAILED';
        if (msg === 'NOT_FOUND') {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        console.error('POST request-missing-info IDA:', e);
        return NextResponse.json({ error: 'Failed to request missing info' }, { status: 500 });
    }
}
