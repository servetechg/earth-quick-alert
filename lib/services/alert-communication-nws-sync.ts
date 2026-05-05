/**
 * Sync National Weather Service active alerts into `AlertCommunication` for the Alerts & Communication admin UI.
 */

import { format, formatDistanceToNow } from 'date-fns';
import type { WeatherAlert as APIWeatherAlert } from '@/lib/types/api-alerts';
import { AlertSeverity } from '@/lib/types/api-alerts';
import type { AnyBulkWriteOperation } from 'mongoose';
import { weatherAPI } from '@/lib/services/weather-api';
import AlertCommunication from '@/models/AlertCommunication';

function syncCoordinates(): { lat: number; lon: number } {
    const lat = parseFloat(process.env.NWS_ALERT_SYNC_LAT ?? '41.8781');
    const lon = parseFloat(process.env.NWS_ALERT_SYNC_LON ?? '-87.6298');
    return {
        lat: Number.isFinite(lat) ? lat : 41.8781,
        lon: Number.isFinite(lon) ? lon : -87.6298,
    };
}

/**
 * `national` (default) — all active USA alerts via paginated `/alerts/active`.
 * `point` — only alerts affecting `NWS_ALERT_SYNC_LAT` / `NWS_ALERT_SYNC_LON`.
 */
function useNwsNationwideSync(): boolean {
    const scope = (process.env.NWS_ALERT_SYNC_SCOPE ?? 'national').toLowerCase().trim();
    if (scope === 'point' || scope === 'local') return false;
    return true;
}

function inferWatchOrWarning(eventName: string): 'Watch' | 'Warning' {
    return /\bwatch\b/i.test(eventName) ? 'Watch' : 'Warning';
}

function inferIconType(eventName: string): 'triangle' | 'lightning' | 'cloud' {
    const e = eventName.toLowerCase();
    if (/tornado|thunderstorm|severe|lightning|squall/.test(e)) return 'lightning';
    if (
        /flood|rain|snow|winter|hurricane|tropical|marine|coastal|blizzard|ice|freeze|tsunami|cyclone|waterspout/.test(
            e
        )
    ) {
        return 'cloud';
    }
    return 'triangle';
}

function severityToLabel(s: AlertSeverity): string {
    switch (s) {
        case AlertSeverity.EXTREME:
            return 'Extreme';
        case AlertSeverity.SEVERE:
        case AlertSeverity.HIGH:
            return 'High';
        case AlertSeverity.MODERATE:
            return 'Moderate';
        case AlertSeverity.LOW:
        case AlertSeverity.INFO:
        default:
            return 'Moderate';
    }
}

function formatExpires(expiresIso?: string): string {
    if (!expiresIso) return 'See alert text';
    try {
        return format(new Date(expiresIso), 'h:mm a');
    } catch {
        return 'Unknown';
    }
}

function formatIssued(sentIso: string): string {
    try {
        return formatDistanceToNow(new Date(sentIso), { addSuffix: true });
    } catch {
        return 'recently';
    }
}

/**
 * Pull active NWS alerts (nationwide by default, or single-point if `NWS_ALERT_SYNC_SCOPE=point`), upsert Mongo docs, prune stale NWS rows.
 */
export async function syncNwsAlertsToAlertCommunication(): Promise<{ upserted: number; removed: number }> {
    const alerts: APIWeatherAlert[] = useNwsNationwideSync()
        ? await weatherAPI.fetchNWSActiveAlertsNationwide()
        : await weatherAPI.fetchNWSActiveAlertsForPoint(syncCoordinates().lat, syncCoordinates().lon);

    const activeExternalIds = new Set<string>();
    const ops: AnyBulkWriteOperation<Record<string, unknown>>[] = [];

    for (const a of alerts) {
        if (!a.id) continue;
        activeExternalIds.add(a.id);

        const eventName = a.event || a.title || 'Weather Alert';
        const location =
            a.areaDesc ||
            (a.affectedAreas && a.affectedAreas.length > 0
                ? a.affectedAreas.join(', ')
                : 'See affected areas in description');

        const issuedAt = formatIssued(a.timestamp);
        const expiresAt = formatExpires(a.expiresAt);

        ops.push({
            updateOne: {
                filter: { externalId: a.id },
                update: {
                    $set: {
                        source: 'nws',
                        externalId: a.id,
                        name: eventName,
                        type: inferWatchOrWarning(eventName),
                        iconType: inferIconType(eventName),
                        location,
                        issuedAt,
                        expiresAt,
                        status: 'Take Action',
                        description: a.description || a.title,
                        severity: severityToLabel(a.severity),
                    },
                },
                upsert: true,
            },
        });
    }

    if (ops.length > 0) {
        await AlertCommunication.bulkWrite(ops, { ordered: false });
    }

    const removeResult = await AlertCommunication.deleteMany({
        source: 'nws',
        externalId: { $exists: true, $nin: [...activeExternalIds] },
    });

    return { upserted: ops.length, removed: removeResult.deletedCount ?? 0 };
}

let lastSyncMs = 0;
const DEFAULT_MIN_INTERVAL_MS = 90_000;

/** Rate-limit sync when called from hot paths (e.g. GET). */
export async function syncNwsAlertsIfStale(): Promise<void> {
    if (process.env.NWS_ALERT_SYNC_ENABLED === 'false') return;

    const minMs = parseInt(process.env.NWS_SYNC_MIN_INTERVAL_MS ?? `${DEFAULT_MIN_INTERVAL_MS}`, 10);
    const now = Date.now();
    if (now - lastSyncMs < minMs) return;

    lastSyncMs = now;
    await syncNwsAlertsToAlertCommunication().catch((err) => {
        console.error('[nws-sync]', err);
        lastSyncMs = 0;
    });
}

/** Bypass throttle (e.g. POST /api/alerts-communication refresh). */
export async function syncNwsAlertsNow(): Promise<{ upserted: number; removed: number }> {
    lastSyncMs = Date.now();
    return syncNwsAlertsToAlertCommunication();
}
