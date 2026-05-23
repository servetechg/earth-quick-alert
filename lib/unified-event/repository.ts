import type { AnyBulkWriteOperation } from 'mongoose';
import UnifiedEvent from '@/models/UnifiedEvent';
import type { UnifiedEventInsert } from '@/lib/unified-event/types';
import { normalizeUnifiedEventCategory } from '@/lib/unified-event/category-infer';

const DATA_STATUS_TTL_MS = 24 * 60 * 60 * 1000;

export interface UnifiedSyncStats {
    upserted: number;
    /** Rows no longer in the active upstream set — marked `past`, not deleted. */
    markedPast: number;
    /** Same as `markedPast` (kept for existing sync stats callers). */
    removed: number;
}

/**
 * Upsert live rows for a source; mark documents no longer in the active upstream set as `past`.
 * Each upsert sets `dataStatus: 'current'` and refreshes `updatedAt` (via timestamps).
 */
export async function upsertAndPruneUnifiedEvents(
    legacySource: string,
    events: UnifiedEventInsert[],
): Promise<UnifiedSyncStats> {
    const activeIds = new Set<string>();
    const ops: AnyBulkWriteOperation<Record<string, unknown>>[] = [];

    for (const ev of events) {
        activeIds.add(ev.externalId);
        const category = normalizeUnifiedEventCategory(ev.category);
        const rawProps = (ev.properties ?? {}) as Record<string, unknown>;
        const catProps =
            rawProps[category] ??
            rawProps[ev.category] ??
            (ev.category === 'hurricane_typhoon' ? rawProps.hurricane_typhoon : undefined) ??
            {};
        const properties = { [category]: catProps };

        ops.push({
            updateOne: {
                filter: { externalId: ev.externalId },
                update: {
                    $set: {
                        externalId: ev.externalId,
                        source: ev.source,
                        category,
                        name: ev.name,
                        description: ev.description ?? '',
                        severity: ev.severity,
                        type: ev.type,
                        iconType: ev.iconType,
                        location: ev.location,
                        lat: ev.lat ?? null,
                        lng: ev.lng ?? null,
                        coordinates: ev.coordinates ?? null,
                        geometry: ev.geometry ?? null,
                        issuedAt: ev.issuedAt,
                        expiresAt: ev.expiresAt,
                        instructions: ev.instructions ?? [],
                        properties,
                        dataStatus: 'current',
                        status: ev.status,
                    },
                },
                upsert: true,
            },
        });
    }

    if (ops.length > 0) {
        await UnifiedEvent.bulkWrite(ops, { ordered: false });
    }

    const modelSource = legacySourceToModelSource(legacySource);
    const markPastResult = await UnifiedEvent.updateMany(
        {
            source: modelSource,
            externalId: { $exists: true, $nin: [...activeIds] },
            dataStatus: 'current',
        },
        { $set: { dataStatus: 'past' } },
    );

    const markedPast = markPastResult.modifiedCount ?? 0;

    return {
        upserted: ops.length,
        markedPast,
        removed: markedPast,
    };
}

function legacySourceToModelSource(legacy: string): string {
    const s = legacy.toLowerCase();
    if (s === 'firms') return 'nasa_firms';
    return s;
}

export interface HistoricalUpsertStats {
    upserted: number;
    skippedCurrent: number;
}

/**
 * Upsert historical rows as `dataStatus: 'past'`.
 * Never overwrites rows already marked `current` (live sync wins).
 */
export async function upsertHistoricalUnifiedEvents(
    events: UnifiedEventInsert[],
): Promise<HistoricalUpsertStats> {
    if (events.length === 0) return { upserted: 0, skippedCurrent: 0 };

    const externalIds = events.map((e) => e.externalId);
    const currentRows = await UnifiedEvent.find({
        externalId: { $in: externalIds },
        dataStatus: 'current',
    })
        .select('externalId')
        .lean();
    const currentIds = new Set(currentRows.map((r) => String(r.externalId)));

    const ops: AnyBulkWriteOperation<Record<string, unknown>>[] = [];
    let skippedCurrent = 0;

    for (const ev of events) {
        if (currentIds.has(ev.externalId)) {
            skippedCurrent += 1;
            continue;
        }
        const category = normalizeUnifiedEventCategory(ev.category);
        const rawProps = (ev.properties ?? {}) as Record<string, unknown>;
        const catProps =
            rawProps[category] ??
            rawProps[ev.category] ??
            (ev.category === 'hurricane_typhoon' ? rawProps.hurricane_typhoon : undefined) ??
            {};
        const properties = { [category]: catProps };

        ops.push({
            updateOne: {
                filter: { externalId: ev.externalId },
                update: {
                    $set: {
                        externalId: ev.externalId,
                        source: ev.source,
                        category,
                        name: ev.name,
                        description: ev.description ?? '',
                        severity: ev.severity,
                        type: ev.type,
                        iconType: ev.iconType,
                        location: ev.location,
                        lat: ev.lat ?? null,
                        lng: ev.lng ?? null,
                        coordinates: ev.coordinates ?? null,
                        geometry: ev.geometry ?? null,
                        issuedAt: ev.issuedAt,
                        expiresAt: ev.expiresAt,
                        instructions: ev.instructions ?? [],
                        properties,
                        dataStatus: 'past',
                        status: ev.status,
                    },
                },
                upsert: true,
            },
        });
    }

    if (ops.length > 0) {
        await UnifiedEvent.bulkWrite(ops, { ordered: false });
    }

    return { upserted: ops.length, skippedCurrent };
}

/** Mark stale rows as `past` when not updated within 24 hours (per unified model spec). */
export async function refreshUnifiedEventDataStatus(): Promise<number> {
    const cutoff = new Date(Date.now() - DATA_STATUS_TTL_MS);
    const result = await UnifiedEvent.updateMany(
        { dataStatus: 'current', updatedAt: { $lt: cutoff } },
        { $set: { dataStatus: 'past' } },
    );
    return result.modifiedCount ?? 0;
}
