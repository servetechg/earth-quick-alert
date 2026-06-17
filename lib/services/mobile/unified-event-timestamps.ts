import { extractEventTimestamp } from '@/lib/services/event-formatters';
import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';

/** Relative phrases stored at ingest time — not parseable as dates. */
const RELATIVE_ISSUED =
    /^\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i;

function parseIso(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s || RELATIVE_ISSUED.test(s)) return null;
    const ms = new Date(s).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Resolve a stable ISO issue time for mobile display.
 * UnifiedEvent.issuedAt is often a relative string ("14 days ago"); prefer properties.effectiveAt or createdAt.
 */
export function resolveUnifiedEventIssuedIso(doc: UnifiedEventDoc): string {
    const fromProperties = extractEventTimestamp(doc);
    if (fromProperties) return fromProperties.toISOString();

    const fromIssued = parseIso(doc.issuedAt);
    if (fromIssued) return fromIssued;

    const fromCreated = parseIso(doc.createdAt);
    if (fromCreated) return fromCreated;

    return new Date().toISOString();
}

export function resolveUnifiedEventExpiresIso(doc: UnifiedEventDoc): string | undefined {
    const category = String(doc.category ?? '').trim();
    const props = (doc.properties ?? {}) as Record<string, Record<string, unknown>>;
    const catBlock = props[category] ?? props.hurricane_typhoon;

    if (catBlock && typeof catBlock === 'object') {
        for (const key of ['endsAt', 'expiresAt', 'incidentEndDate']) {
            const iso = parseIso(catBlock[key]);
            if (iso) return iso;
        }
    }

    return parseIso(doc.expiresAt) ?? undefined;
}
