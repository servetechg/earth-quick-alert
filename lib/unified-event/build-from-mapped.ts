import type { UnifiedEventInsert, UnifiedAlertType, UnifiedSeverity, IntensityMeasurement } from '@/lib/unified-event/types';
import { inferCategoryFromLegacyRow } from '@/lib/unified-event/category-infer';
import { legacySourceToUnified, normalizeExternalId } from '@/lib/unified-event/legacy-source';

export interface AlertSyncMappedDoc {
    externalId: string;
    name: string;
    type: 'Watch' | 'Warning' | 'Advisory' | 'Statement' | 'Declaration';
    iconType: 'triangle' | 'lightning' | 'cloud' | 'flame' | 'wave' | 'snowflake' | 'wind';
    location: string;
    issuedAt: string;
    expiresAt: string;
    status: string;
    description: string;
    severity: string;
    instructions?: string[];
    lat?: number | null;
    lng?: number | null;
    properties?: Record<string, unknown>;
}

function toUnifiedSeverity(raw: string): UnifiedSeverity {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === 'extreme' || s === 'severe') return 'Extreme';
    if (s === 'high') return 'High';
    if (s === 'low' || s === 'info') return 'Low';
    return 'Moderate';
}

function toUnifiedType(raw: string): UnifiedAlertType {
    const t = String(raw ?? '').trim();
    if (t === 'Watch' || t === 'Warning' || t === 'Advisory' || t === 'Statement' || t === 'Declaration') {
        return t;
    }
    return /\bwatch\b/i.test(t) ? 'Watch' : 'Warning';
}

function toUserStatus(raw: string): 'Take Action' | 'Monitor' | 'Info' {
    const s = String(raw ?? '').trim();
    if (s === 'Monitor' || s === 'Info') return s;
    return 'Take Action';
}

export function buildUnifiedEventFromMappedDoc(
    legacySource: string,
    doc: AlertSyncMappedDoc,
    options?: { instructions?: string[] },
): UnifiedEventInsert {
    const source = legacySourceToUnified(legacySource);
    const externalId = normalizeExternalId(source, doc.externalId);
    const category = inferCategoryFromLegacyRow({
        source,
        name: doc.name,
        description: doc.description,
        externalId,
    });

    const intensity = (doc.properties?.intensity as IntensityMeasurement | undefined) ?? null;
    const properties: Record<string, unknown> = {
        [category]: {
            intensity,
            ...(doc.properties?.[category] as Record<string, unknown> | undefined),
        },
    };

    return {
        externalId,
        source,
        category,
        name: doc.name,
        description: doc.description,
        severity: toUnifiedSeverity(doc.severity),
        type: toUnifiedType(doc.type),
        iconType: doc.iconType,
        status: toUserStatus(doc.status),
        location: doc.location,
        lat: doc.lat ?? null,
        lng: doc.lng ?? null,
        issuedAt: doc.issuedAt,
        expiresAt: doc.expiresAt,
        instructions: options?.instructions ?? doc.instructions,
        properties,
    };
}
