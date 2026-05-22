import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import UnifiedEvent from '@/models/UnifiedEvent';
import User from '@/models/User';
import {
    forceSyncAllAlertCommunicationFeedsNow,
    syncAlertCommunicationFeedsGate,
} from '@/lib/services/alert-communication-feed-sync-gate';
import { fetchUnifiedEventLegacyCards } from '@/lib/unified-event/feed';
import { unifiedEventToLegacyAlertCard } from '@/lib/unified-event/legacy-card';
import { getSession } from '@/lib/auth';
import { filterHydratedForSubAdminState } from '@/lib/services/alert-communication-aligned-feed';

/** Sub-admins see alerts whose geography text matches their profile `state` (server-side). */
async function resolveSubAdminStateFilterRaw(): Promise<string | null> {
    try {
        const session = await getSession();
        const role = String(session?.user?.role ?? '').toLowerCase();
        const userId = session?.user?.id as string | undefined;
        if (role !== 'sub-admin' || !userId) return null;
        const u = await User.findById(userId).select('state').lean();
        const st = typeof u?.state === 'string' ? u.state.trim() : '';
        return st || null;
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        await dbConnect();
        await syncAlertCommunicationFeedsGate();
        const hydrated = await fetchUnifiedEventLegacyCards();

        const subAdminStateFilter = await resolveSubAdminStateFilterRaw();
        const filtered =
            subAdminStateFilter != null ? filterHydratedForSubAdminState(hydrated, subAdminStateFilter) : hydrated;

        return NextResponse.json(filtered);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/** Force an immediate pull from every source (no throttle). Per-source env flags still gate work. */
export async function POST() {
    try {
        await dbConnect();
        const { nws, multi } = await forceSyncAllAlertCommunicationFeedsNow();
        const hydrated = await fetchUnifiedEventLegacyCards();

        const subAdminStateFilter = await resolveSubAdminStateFilterRaw();
        const filtered =
            subAdminStateFilter != null ? filterHydratedForSubAdminState(hydrated, subAdminStateFilter) : hydrated;

        return NextResponse.json({ stats: { nws, ...multi }, data: filtered });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        await dbConnect();
        const { id, status } = await request.json();
        const updated = await UnifiedEvent.findByIdAndUpdate(id, { status }, { new: true }).lean();
        if (!updated) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        return NextResponse.json(unifiedEventToLegacyAlertCard(updated as Record<string, unknown>));
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
