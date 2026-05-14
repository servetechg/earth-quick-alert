import AlertCommunication from '@/models/AlertCommunication';
import { alertCommunicationFeedFilter } from '@/lib/constants/alert-communication-feed';
import { syncNwsAlertsNow, syncNwsAlertsIfStale } from '@/lib/services/alert-communication-nws-sync';
import { syncAllSourcesNow, syncAllSourcesIfStale } from '@/lib/services/alert-communication-multi-sync';

type MultiReport = Awaited<ReturnType<typeof syncAllSourcesNow>>;

/** Immediate NWS + multi-source pull (used by `POST /api/alerts-communication`). */
export async function forceSyncAllAlertCommunicationFeedsNow(): Promise<{
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

/**
 * Same upstream refresh gate as `GET /api/alerts-communication` (empty DB → full pull, else throttled stale sync).
 * Caller must `await dbConnect()` first.
 */
export async function syncAlertCommunicationFeedsGate(): Promise<void> {
    const feedFilter = alertCommunicationFeedFilter();
    const hasLiveRows = !!(await AlertCommunication.findOne(feedFilter).select('_id').lean());
    if (!hasLiveRows) {
        await forceSyncAllAlertCommunicationFeedsNow();
    } else {
        await Promise.all([syncNwsAlertsIfStale(), syncAllSourcesIfStale()]);
    }
}
