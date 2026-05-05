/**
 * Sources written by upstream sync jobs (`alert-communication-nws-sync`, `alert-communication-multi-sync`).
 * Excludes operator/demo rows (`manual`, `seed`).
 */
export const LIVE_ALERT_COMMUNICATION_SOURCES = [
    'nws',
    'usgs',
    'firms',
    'inciweb',
    'nwps',
    'fema',
] as const;

export type LiveAlertCommunicationSource = (typeof LIVE_ALERT_COMMUNICATION_SOURCES)[number];

/** Mongo query: only live-ingested rows unless env opts into manual/seed. */
export function alertCommunicationFeedFilter(): { source?: { $in: string[] } } {
    if (process.env.ALERTS_COMMUNICATION_INCLUDE_MANUAL === 'true') {
        return {};
    }
    return { source: { $in: [...LIVE_ALERT_COMMUNICATION_SOURCES] } };
}
