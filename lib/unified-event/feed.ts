import UnifiedEvent from '@/models/UnifiedEvent';
import AlertCommunication from '@/models/AlertCommunication';
import { unifiedEventFeedFilter } from '@/lib/constants/unified-event-feed';
import { alertCommunicationFeedFilter } from '@/lib/constants/alert-communication-feed';
import { unifiedEventToLegacyAlertCard } from '@/lib/unified-event/legacy-card';
import { hydrateAlertCommunicationRows } from '@/lib/utils/alert-communication-hydrate';
import { refreshUnifiedEventDataStatus } from '@/lib/unified-event/repository';

/** Load unified events and map to legacy alert cards for existing admin UIs. */
export async function fetchUnifiedEventLegacyCards(): Promise<Record<string, unknown>[]> {
    await refreshUnifiedEventDataStatus();

    const filter = unifiedEventFeedFilter();
    let rows = await UnifiedEvent.find(filter).sort({ updatedAt: -1 }).lean();

    if (
        rows.length === 0 &&
        process.env.UNIFIED_EVENT_LEGACY_FALLBACK !== 'false'
    ) {
        const legacy = await AlertCommunication.find(alertCommunicationFeedFilter())
            .sort({ createdAt: -1 })
            .lean();
        if (legacy.length > 0) {
            return hydrateAlertCommunicationRows(legacy as Record<string, unknown>[]);
        }
    }

    const cards = rows.map((r) => unifiedEventToLegacyAlertCard(r as Record<string, unknown>));
    return hydrateAlertCommunicationRows(cards);
}
