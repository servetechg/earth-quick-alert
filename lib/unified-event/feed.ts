import UnifiedEvent from '@/models/UnifiedEvent';
import { unifiedEventFeedFilter } from '@/lib/constants/unified-event-feed';
import { unifiedEventToLegacyAlertCard } from '@/lib/unified-event/legacy-card';
import { hydrateAlertCommunicationRows } from '@/lib/utils/alert-communication-hydrate';
import { refreshUnifiedEventDataStatus } from '@/lib/unified-event/repository';

/** Load current unified events and map to admin alert cards (Alerts & Communication, AI Risk alignment). */
export async function fetchUnifiedEventLegacyCards(): Promise<Record<string, unknown>[]> {
    await refreshUnifiedEventDataStatus();

    const filter = unifiedEventFeedFilter();
    const rows = await UnifiedEvent.find(filter).sort({ updatedAt: -1 }).lean();

    const cards = rows.map((r) => unifiedEventToLegacyAlertCard(r as Record<string, unknown>));
    return hydrateAlertCommunicationRows(cards);
}
