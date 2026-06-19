import UnifiedEvent from '@/models/UnifiedEvent';
import { unifiedEventFeedFilter } from '@/lib/constants/unified-event-feed';
import { syncNwsAlertsNow, syncNwsAlertsIfStale } from '@/lib/services/alert-communication-nws-sync';
import { syncAllSourcesNow, syncAllSourcesIfStale } from '@/lib/services/alert-communication-multi-sync';
import {
    syncAllHistoricalUnifiedEvents,
    syncHistoricalUnifiedEventsIfStale,
} from '@/lib/services/unified-event-historical-ingest';

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
    const feedFilter = unifiedEventFeedFilter();
    const hasLiveRows = !!(await UnifiedEvent.findOne(feedFilter).select('_id').lean());
    if (!hasLiveRows) {
        void (async () => {
            await forceSyncAllAlertCommunicationFeedsNow();
            if (process.env.UNIFIED_EVENT_HISTORICAL_ENABLED !== 'false') {
                await syncAllHistoricalUnifiedEvents().catch((e) =>
                    console.error('[unified-historical:bootstrap]', e),
                );
            }
        })().catch((e) => console.error('[feed-sync-gate:cold-start]', e));
    } else {
        void Promise.all([syncNwsAlertsIfStale(), syncAllSourcesIfStale()])
            .catch((e) => console.error('[feed-sync-gate:stale]', e));
    }

    void syncHistoricalUnifiedEventsIfStale();
}
