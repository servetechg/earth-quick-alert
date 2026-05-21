import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { syncAllHistoricalUnifiedEvents } from '@/lib/services/unified-event-historical-ingest';

const ALLOWED_ROLES = new Set([
    'admin',
    'super-admin',
    'sub-admin',
    'eoc-manager',
    'eoc-observer',
    'manager',
]);

/** Force historical backfill from FEMA, USGS EQ, FIRMS, USGS NWIS into `unifiedevents` as `past`. */
export async function POST() {
    try {
        const session = await getSession();
        const role = String(session?.user?.role ?? '').toLowerCase();
        if (!session?.user?.id || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const report = await syncAllHistoricalUnifiedEvents();
        return NextResponse.json({ ok: true, report });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Historical sync failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
