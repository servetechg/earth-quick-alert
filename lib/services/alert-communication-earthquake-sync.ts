/**
 * Sync recent USGS earthquakes into `UnifiedEvent` (same live feed as Alerts & Communication + mobile).
 */

import { buildUnifiedEventFromEarthquakeFeature } from '@/lib/unified-event/build-from-earthquake';
import type { UsgsEarthquakeFeature } from '@/lib/unified-event/build-from-earthquake';
import { upsertAndPruneUnifiedEvents } from '@/lib/unified-event/repository';

const DEFAULT_FEED =
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

function syncMinMagnitude(): number {
    const n = parseFloat(process.env.USGS_EQ_SYNC_MIN_MAG ?? '2.5');
    return Number.isFinite(n) ? n : 2.5;
}

function syncMaxEvents(): number {
    const n = parseInt(process.env.USGS_EQ_SYNC_MAX_EVENTS ?? '500', 10);
    return Number.isFinite(n) ? Math.max(1, Math.min(2000, n)) : 500;
}

/** Fetch + upsert recent earthquakes as `dataStatus: current`; mark stale rows `past`. */
export async function syncEarthquakeAlertsToUnifiedEvents(): Promise<{
    upserted: number;
    removed: number;
}> {
    const feedUrl = (process.env.USGS_EQ_SYNC_FEED ?? DEFAULT_FEED).trim() || DEFAULT_FEED;
    const minMag = syncMinMagnitude();
    const maxEvents = syncMaxEvents();

    const res = await fetch(feedUrl, {
        headers: {
            Accept: 'application/geo+json, application/json',
            'User-Agent':
                process.env.USGS_USER_AGENT ||
                'ready2go-emergency-dashboard (earthquake-sync)',
        },
        next: { revalidate: 0 },
    });

    if (!res.ok) {
        throw new Error(`USGS earthquake feed HTTP ${res.status}`);
    }

    const geo = (await res.json()) as { features?: UsgsEarthquakeFeature[] };
    const features = Array.isArray(geo.features) ? geo.features : [];

    const events = [];
    for (const feature of features) {
        if (events.length >= maxEvents) break;
        const mag = feature.properties?.mag;
        if (mag != null && Number.isFinite(mag) && mag < minMag) continue;
        const built = buildUnifiedEventFromEarthquakeFeature(feature);
        if (built) events.push(built);
    }

    return upsertAndPruneUnifiedEvents('earthquake', events);
}

let lastSyncMs = 0;
const DEFAULT_MIN_INTERVAL_MS = 120_000;

export async function syncEarthquakeAlertsIfStale(): Promise<void> {
    if (process.env.USGS_EQ_SYNC_ENABLED === 'false') return;

    const minMs = parseInt(
        process.env.USGS_EQ_SYNC_MIN_INTERVAL_MS ?? `${DEFAULT_MIN_INTERVAL_MS}`,
        10,
    );
    const now = Date.now();
    if (now - lastSyncMs < minMs) return;

    lastSyncMs = now;
    await syncEarthquakeAlertsToUnifiedEvents().catch((err) => {
        console.error('[earthquake-sync]', err);
        lastSyncMs = 0;
    });
}

export async function syncEarthquakeAlertsNow(): Promise<{ upserted: number; removed: number }> {
    lastSyncMs = Date.now();
    return syncEarthquakeAlertsToUnifiedEvents();
}
