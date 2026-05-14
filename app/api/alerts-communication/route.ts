import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AlertCommunication from '@/models/AlertCommunication';
import User from '@/models/User';
import { alertCommunicationFeedFilter } from '@/lib/constants/alert-communication-feed';
import {
    forceSyncAllAlertCommunicationFeedsNow,
    syncAlertCommunicationFeedsGate,
} from '@/lib/services/alert-communication-feed-sync-gate';
import { hydrateAlertCommunicationRows } from '@/lib/utils/alert-communication-hydrate';
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
        const feedFilter = alertCommunicationFeedFilter();
        /** Live feeds only (NWS + USGS + FIRMS + InciWeb). Set `ALERTS_COMMUNICATION_INCLUDE_MANUAL=true` to show manual/seed rows. */
        const data = await AlertCommunication.find(feedFilter).sort({ createdAt: -1 }).lean();
        const hydrated = hydrateAlertCommunicationRows(data as any[]);

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
        const data = await AlertCommunication.find(alertCommunicationFeedFilter())
            .sort({ createdAt: -1 })
            .lean();
        const hydrated = hydrateAlertCommunicationRows(data as any[]);

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
        const updated = await AlertCommunication.findByIdAndUpdate(id, { status }, { new: true });
        return NextResponse.json(updated);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
