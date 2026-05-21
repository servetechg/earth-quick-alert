import type { UnifiedEventCategory } from '@/lib/unified-event/types';
import { unifiedSourceToLegacy } from '@/lib/unified-event/legacy-source';

/** Shape expected by Alerts & Communication UI and risk alignment (legacy `AlertCommunication` card). */
export function unifiedEventToLegacyAlertCard(row: Record<string, unknown>): Record<string, unknown> {
    const id = String(row._id ?? '');
    const category = String(row.category ?? '') as UnifiedEventCategory;
    const props = (row.properties ?? {}) as Record<string, unknown>;
    const catBlock = (props[category] ?? {}) as Record<string, unknown>;
    const intensity = catBlock.intensity ?? null;

    return {
        _id: id,
        id,
        externalId: row.externalId,
        source: unifiedSourceToLegacy(String(row.source ?? '')),
        category,
        dataStatus: row.dataStatus ?? 'current',
        name: row.name,
        type: row.type,
        iconType: row.iconType,
        location: row.location,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
        status: row.status,
        description: row.description,
        instructions: row.instructions ?? [],
        severity: row.severity,
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        intensity,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
