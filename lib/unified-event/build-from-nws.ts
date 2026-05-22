import type { WeatherAlert as APIWeatherAlert } from '@/lib/types/api-alerts';
import type { UnifiedEventInsert } from '@/lib/unified-event/types';
import { inferCategoryFromLegacyRow } from '@/lib/unified-event/category-infer';
import { normalizeExternalId } from '@/lib/unified-event/legacy-source';

export function buildUnifiedEventFromNwsAlert(
    a: APIWeatherAlert,
    fields: {
        eventName: string;
        location: string;
        issuedAt: string;
        expiresAt: string;
        description: string;
        instructions: string[];
        severity: string;
        type: 'Watch' | 'Warning';
        iconType: 'triangle' | 'lightning' | 'cloud';
    },
): UnifiedEventInsert {
    const externalId = normalizeExternalId('nws', a.id);
    const category = inferCategoryFromLegacyRow({
        source: 'nws',
        name: fields.eventName,
        description: fields.description,
        externalId,
    });

    const lat = a.coordinates?.lat ?? null;
    const lng = a.coordinates?.lon ?? null;

    const properties: Record<string, unknown> = {
        [category]: {
            intensity: {
                metric: 'nws_alert_severity',
                value: severityToScore(fields.severity),
                unit: 'level',
                display: fields.severity,
            },
            affectedCounties: a.areaDesc
                ? a.areaDesc.split(';').map((p) => p.trim()).filter(Boolean)
                : a.affectedAreas ?? null,
            urgency: null,
            certainty: null,
            nwsEventCode: null,
            nwsVtec: null,
            senderName: null,
            effectiveAt: a.timestamp ?? null,
            onsetAt: null,
            endsAt: a.expiresAt ?? null,
        },
    };

    return {
        externalId,
        source: 'nws',
        category,
        name: fields.eventName,
        description: fields.description,
        severity: toUnifiedSeverity(fields.severity),
        type: fields.type,
        iconType: fields.iconType,
        status: 'Take Action',
        location: fields.location,
        lat,
        lng,
        issuedAt: fields.issuedAt,
        expiresAt: fields.expiresAt,
        instructions: fields.instructions,
        properties,
    };
}

function toUnifiedSeverity(raw: string): UnifiedEventInsert['severity'] {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === 'extreme' || s === 'severe') return 'Extreme';
    if (s === 'high') return 'High';
    if (s === 'low' || s === 'info') return 'Low';
    return 'Moderate';
}

function severityToScore(sev: string): number {
    const s = sev.toLowerCase();
    if (s === 'extreme') return 4;
    if (s === 'high') return 3;
    if (s === 'moderate') return 2;
    return 1;
}
