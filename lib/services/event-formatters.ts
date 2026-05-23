import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';

/**
 * Extracts a real ISO timestamp from properties[category] fields.
 * Falls back to Mongo's updatedAt. Returns null if nothing is parseable.
 */
export function extractEventTimestamp(e: UnifiedEventDoc): Date | null {
    const p = (e.properties ?? {})[e.category] as Record<string, unknown> | undefined;
    if (p) {
        const candidates = [
            p.effectiveAt, p.onsetAt, p.incidentBeginDate,
            p.beginDateTime, p.declarationDate,
        ];
        for (const c of candidates) {
            if (typeof c === 'string' && c.length) {
                const d = new Date(c);
                if (!isNaN(d.getTime())) return d;
            }
        }
    }
    return e.updatedAt ? new Date(e.updatedAt) : null;
}

/**
 * Returns a human-friendly timestamp string like "May 22, 2026, 4:11 AM".
 * Never returns an ISO string or "Invalid Date".
 */
export function formatEventTimestamp(e: UnifiedEventDoc): string {
    const d = extractEventTimestamp(e);
    if (!d) return 'Timestamp unavailable';
    return d.toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}
