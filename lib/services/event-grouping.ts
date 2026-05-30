import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { formatEventTimestamp } from '@/lib/services/event-formatters';
import type { EventGroupSummary, UnifiedEventSource } from '@/lib/types/risk-assessment';

export interface EventGroup {
    canonicalKey: string;
    primary: UnifiedEventDoc;
    members: UnifiedEventDoc[];
    affectedCounties: string[];
    affectedStates: string[];
    sources: string[];
    duplicateCount: number;
}

const SEVERITY_ORDER: Record<string, number> = {
    Extreme: 4,
    High: 3,
    Moderate: 2,
    Low: 1,
};

function extractState(location: string): string {
    const m = location.match(/\b([A-Z]{2})\b/);
    return m ? m[1] : '';
}

function extractAffectedCounties(e: UnifiedEventDoc): string[] {
    const p = (e.properties ?? {})[e.category] as Record<string, unknown> | undefined;
    if (!p) return [];

    const rawCounties = p.affectedCounties;
    if (Array.isArray(rawCounties)) {
        return (rawCounties as unknown[])
            .map((c) => String(c ?? '').trim())
            .filter(Boolean);
    }

    // FEMA uses designatedArea or areaName
    const area = p.designatedArea ?? p.areaName;
    if (typeof area === 'string' && area.trim()) return [area.trim()];

    return [];
}

/**
 * Returns a canonical merge key for an event.
 *
 * GUARANTEE: two distinct real-world events will NEVER produce the same key.
 * The key is built from the source's own authoritative identifier
 * (externalId or domain-specific ID). Fuzzy matching on name/time/state is
 * NEVER used — it caused legitimate distinct incidents to be merged.
 *
 * Special case: FEMA stores ONE disaster declaration as N separate county
 * documents (each with its own externalId). The disasterNumber /
 * femaDeclarationString is the authoritative federal grouping unit, so
 * FEMA — and ONLY FEMA — is grouped by that field instead of externalId.
 *
 * If a document lacks an authoritative ID it is keyed by its Mongo _id,
 * which guarantees it stays in a group of one and is never merged with
 * anything else.
 */
function canonicalKey(e: UnifiedEventDoc): string {
    const p = (e.properties ?? {})[e.category] as Record<string, unknown> | undefined;

    if (e.source === 'fema') {
        const declStr =
            (typeof p?.femaDeclarationString === 'string' && p.femaDeclarationString) ||
            (p?.disasterNumber != null && String(p.disasterNumber)) ||
            null;
        if (declStr) return `fema:decl:${declStr}`;
        // No federal declaration ID — treat as standalone, never merge with siblings.
        return `fema:standalone:${e.externalId || e._id}`;
    }

    // Every other source: externalId IS the authoritative unique identifier.
    // Two documents only merge if they share the exact same source-issued ID.
    if (e.externalId) return `${e.source}:${e.externalId}`;

    // No externalId on the document — stays in a group of one.
    return `${e.source}:standalone:${e._id}`;
}

/**
 * Groups a flat list of events by their canonical key.
 * Within each group the most-severe (or earliest) member becomes the primary.
 */
export function groupRelatedEvents(events: UnifiedEventDoc[]): EventGroup[] {
    const map = new Map<string, UnifiedEventDoc[]>();
    for (const e of events) {
        const key = canonicalKey(e);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(e);
    }

    const groups: EventGroup[] = [];
    for (const [key, members] of map.entries()) {
        // Pick the most-severe member as primary; tie-break by earliest updatedAt
        const sorted = [...members].sort((a, b) => {
            const sd = (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
            if (sd !== 0) return sd;
            return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        });
        const primary = sorted[0];

        // Union of affected counties across all members
        const countySet = new Set<string>();
        for (const m of members) {
            for (const c of extractAffectedCounties(m)) countySet.add(c);
        }

        // Unique 2-letter state codes from location strings
        const stateSet = new Set<string>();
        for (const m of members) {
            const st = extractState(m.location);
            if (st) stateSet.add(st);
        }

        // Unique sources
        const sourceSet = new Set(members.map((m) => m.source));

        groups.push({
            canonicalKey: key,
            primary,
            members,
            affectedCounties: [...countySet],
            affectedStates: [...stateSet],
            sources: [...sourceSet],
            duplicateCount: members.length,
        });
    }

    return groups;
}

/**
 * Convert a server-side EventGroup to the client-safe EventGroupSummary shape.
 */
export function toEventGroupSummary(group: EventGroup): EventGroupSummary {
    const e = group.primary;
    return {
        name: e.name,
        source: e.source as UnifiedEventSource,
        severity: e.severity,
        primaryLocation: e.location,
        state: group.affectedStates[0],
        affectedCounties: group.affectedCounties,
        duplicateCount: group.duplicateCount,
        lat: e.lat ?? undefined,
        lng: e.lng ?? undefined,
        hasCoordinates: e.lat != null && e.lng != null,
        formattedTimestamp: formatEventTimestamp(e),
        memberIds: group.members.map((m) => String(m._id)),
    };
}
