/**
 * Live ingest sources for the unified event collection (replaces `alert-communication-feed` reads).
 */
export const LIVE_UNIFIED_EVENT_SOURCES = [
    'nws',
    'usgs',
    'nasa_firms',
    'inciweb',
    'nwps',
    'fema',
    'earthquake',
] as const;

/** Mongo query: current live-ingested rows unless env opts into manual/seed. */
export function unifiedEventFeedFilter(): Record<string, unknown> {
    const base: Record<string, unknown> = { dataStatus: 'current' };
    if (process.env.ALERTS_COMMUNICATION_INCLUDE_MANUAL === 'true') {
        return base;
    }
    return {
        ...base,
        source: { $in: [...LIVE_UNIFIED_EVENT_SOURCES] },
    };
}
