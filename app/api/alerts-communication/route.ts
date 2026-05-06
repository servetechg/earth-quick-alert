import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AlertCommunication from '@/models/AlertCommunication';
import { alertCommunicationFeedFilter } from '@/lib/constants/alert-communication-feed';
import { syncNwsAlertsNow, syncNwsAlertsIfStale } from '@/lib/services/alert-communication-nws-sync';
import { syncAllSourcesNow, syncAllSourcesIfStale } from '@/lib/services/alert-communication-multi-sync';

type MultiReport = Awaited<ReturnType<typeof syncAllSourcesNow>>;

/** Full upstream pull (no throttle). NWS + multi-source in parallel; failures are logged and do not block the other source. */
async function syncAllLiveFeedsNow(): Promise<{
    nws: { upserted: number; removed: number };
    multi: MultiReport;
}> {
    const [nws, multi] = await Promise.all([
        process.env.NWS_ALERT_SYNC_ENABLED === 'false'
            ? Promise.resolve({ upserted: 0, removed: 0 })
            : syncNwsAlertsNow().catch((e) => {
                  console.error('[nws-sync]', e);
                  return { upserted: 0, removed: 0 };
              }),
        process.env.MULTI_ALERT_SYNC_ENABLED === 'false'
            ? Promise.resolve({} as MultiReport)
            : syncAllSourcesNow().catch((e) => {
                  console.error('[multi-source-sync]', e);
                  return {} as MultiReport;
              }),
    ]);
    return { nws, multi };
}

/** Throttled upstream refresh (see `NWS_SYNC_MIN_INTERVAL_MS`, `MULTI_ALERT_SYNC_MIN_INTERVAL_MS`). */
async function syncLiveFeedsIfStale(): Promise<void> {
    await Promise.all([syncNwsAlertsIfStale(), syncAllSourcesIfStale()]);
}

export async function GET() {
    try {
        await dbConnect();
        const feedFilter = alertCommunicationFeedFilter();
        /**
         * If the live-ingested feed is empty (fresh DB, manual delete, etc.), always pull upstream.
         * Stale-only sync would skip and leave `[]` until the throttle window expires or POST runs.
         */
        const hasLiveRows = !!(await AlertCommunication.findOne(feedFilter).select('_id').lean());
        if (!hasLiveRows) {
            await syncAllLiveFeedsNow();
        } else {
            await syncLiveFeedsIfStale();
        }
        /** Live feeds only (NWS + USGS + FIRMS + InciWeb). Set `ALERTS_COMMUNICATION_INCLUDE_MANUAL=true` to show manual/seed rows. */
        const data = await AlertCommunication.find(feedFilter).sort({ createdAt: -1 }).lean();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/** Force an immediate pull from every source (no throttle). Per-source env flags still gate work. */
export async function POST() {
    try {
        await dbConnect();
        const { nws, multi } = await syncAllLiveFeedsNow();
        const data = await AlertCommunication.find(alertCommunicationFeedFilter())
            .sort({ createdAt: -1 })
            .lean();
        return NextResponse.json({ stats: { nws, ...multi }, data });
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
