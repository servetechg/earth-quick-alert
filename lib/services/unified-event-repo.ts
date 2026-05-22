import UnifiedEvent from '@/models/UnifiedEvent';
import dbConnect from '@/lib/mongodb';

export interface UnifiedEventDoc {
    _id: string;
    externalId: string;
    source: string;
    category: string;
    name: string;
    description: string;
    severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
    type: string;
    status: string;
    location: string;
    lat: number | null;
    lng: number | null;
    issuedAt: string;
    expiresAt: string;
    instructions: string[];
    properties: Record<string, Record<string, unknown>>;
    dataStatus: 'current' | 'past';
    createdAt: string;
    updatedAt: string;
}

/** Build a location regex filter for jurisdiction scoping. */
function locationFilter(stateCd: string | undefined): Record<string, unknown> | null {
    if (!stateCd || stateCd === 'us') return null;
    // Match 2-letter state abbreviation as whole word (case-insensitive)
    return { location: { $regex: new RegExp(`\\b${stateCd.toUpperCase()}\\b`) } };
}

/**
 * All events with dataStatus='current', optionally scoped to a state.
 * Index hint: { dataStatus:1, updatedAt:-1 }
 */
export async function getCurrentEvents(opts?: { stateCd?: string }): Promise<UnifiedEventDoc[]> {
    await dbConnect();
    const filter: Record<string, unknown> = { dataStatus: 'current' };
    const loc = locationFilter(opts?.stateCd);
    if (loc) Object.assign(filter, loc);
    return UnifiedEvent.find(filter).sort({ updatedAt: -1 }).lean() as unknown as UnifiedEventDoc[];
}

/**
 * Past events for a specific category, optionally scoped to a state.
 * Index hint: { category:1, dataStatus:1, updatedAt:-1 }
 */
export async function getPastEventsByCategory(
    category: string,
    opts?: { stateCd?: string; limit?: number },
): Promise<UnifiedEventDoc[]> {
    await dbConnect();
    const filter: Record<string, unknown> = { dataStatus: 'past', category };
    const loc = locationFilter(opts?.stateCd);
    if (loc) Object.assign(filter, loc);
    return UnifiedEvent
        .find(filter)
        .sort({ updatedAt: -1 })
        .limit(opts?.limit ?? 200)
        .lean() as unknown as UnifiedEventDoc[];
}

/**
 * Get the nested numeric property value from a UnifiedEventDoc's properties object.
 * Properties are stored as { [category]: { field: value, ... } }.
 * Returns null if not found or not a finite number.
 */
export function getEventPropertyValue(doc: UnifiedEventDoc, fieldPath: string): number | null {
    // fieldPath like "earthquake.magnitude" or "flood.intensity.value"
    const parts = fieldPath.split('.');
    let cursor: unknown = doc.properties;
    for (const part of parts) {
        if (cursor == null || typeof cursor !== 'object') return null;
        cursor = (cursor as Record<string, unknown>)[part];
    }
    const n = Number(cursor);
    return Number.isFinite(n) ? n : null;
}

/**
 * Get a string property value from properties.
 */
export function getEventPropertyString(doc: UnifiedEventDoc, fieldPath: string): string | null {
    const parts = fieldPath.split('.');
    let cursor: unknown = doc.properties;
    for (const part of parts) {
        if (cursor == null || typeof cursor !== 'object') return null;
        cursor = (cursor as Record<string, unknown>)[part];
    }
    return typeof cursor === 'string' ? cursor : null;
}
