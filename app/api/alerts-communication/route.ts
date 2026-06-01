import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import UnifiedEvent from '@/models/UnifiedEvent';
import { forceSyncAllAlertCommunicationFeedsNow } from '@/lib/services/alert-communication-feed-sync-gate';
import { unifiedEventToLegacyAlertCard } from '@/lib/unified-event/legacy-card';
import { getSession } from '@/lib/auth';
import {
    fetchAlignedUnifiedEventFeed,
    invalidateAlignedFeedCache,
} from '@/lib/services/alert-communication-aligned-feed';

export async function GET() {
    try {
        await dbConnect();
        const session = await getSession();
        const role = String(session?.user?.role ?? '');
        const userId = session?.user?.id as string | undefined;

        const filtered = await fetchAlignedUnifiedEventFeed({ userId, role, syncFeeds: true });

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
        const session = await getSession();
        const role = String(session?.user?.role ?? '');
        const userId = session?.user?.id as string | undefined;
        invalidateAlignedFeedCache(userId, role);
        const filtered = await fetchAlignedUnifiedEventFeed({ userId, role, syncFeeds: false });

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
