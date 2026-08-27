import UnifiedEvent from '@/models/UnifiedEvent';
import dbConnect from '@/lib/mongodb';
import { unifiedEventFeedFilter } from '@/lib/constants/unified-event-feed';
import { mongoUnifiedEventCategoryFilter } from '@/lib/unified-event/category-infer';
import {
    jurisdictionLatLngBBox,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { US_CENTER_LAT, US_CENTER_LNG } from '@/lib/geo/us-center-coords';

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

const STATE_NAMES: Record<string, string> = {
    'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas', 'ca': 'california',
    'co': 'colorado', 'ct': 'connecticut', 'de': 'delaware', 'fl': 'florida', 'ga': 'georgia',
    'hi': 'hawaii', 'id': 'idaho', 'il': 'illinois', 'in': 'indiana', 'ia': 'iowa',
    'ks': 'kansas', 'ky': 'kentucky', 'la': 'louisiana', 'me': 'maine', 'md': 'maryland',
    'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi',
    'mo': 'missouri', 'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada', 'nh': 'new hampshire',
    'nj': 'new jersey', 'nm': 'new mexico', 'ny': 'new york', 'nc': 'north carolina',
    'nd': 'north dakota', 'oh': 'ohio', 'ok': 'oklahoma', 'or': 'oregon', 'pa': 'pennsylvania',
    'ri': 'rhode island', 'sc': 'south carolina', 'sd': 'south dakota', 'tn': 'tennessee',
    'tx': 'texas', 'ut': 'utah', 'vt': 'vermont', 'va': 'virginia', 'wa': 'washington',
    'wv': 'west virginia', 'wi': 'wisconsin', 'wy': 'wyoming'
};

/** Build a location regex filter for jurisdiction scoping. */
function locationFilter(stateCd: string | undefined): Record<string, unknown> | null {
    if (!stateCd || stateCd === 'us') return null;
    const lowerCd = stateCd.toLowerCase();
    const stateName = STATE_NAMES[lowerCd];
    
    if (stateName) {
        // Match either the 2-letter code or the full state name
        return { 
            location: { 
                $regex: `\\b(${lowerCd}|${stateName})\\b`,
                $options: 'i'
            } 
        };
    }
    
    return { 
        location: { 
            $regex: `\\b${lowerCd}\\b`,
            $options: 'i'
        } 
    };
}

/**
 * Current events whose coordinates fall in the license bbox, plus rows missing lat/lng
 * (for geocoded radius checks). Optionally narrowed by state token in location text.
 */
export async function getCurrentEventsForJurisdiction(
    jurisdiction: SubAdminJurisdiction
): Promise<UnifiedEventDoc[]> {
    await dbConnect();

    if (jurisdiction.coverageType === 'state') {
        return getCurrentEvents({ stateCd: jurisdiction.stateCode || undefined });
    }

    const { minLat, maxLat, minLng, maxLng } = jurisdictionLatLngBBox(jurisdiction);

    const filter: Record<string, unknown> = {
        ...unifiedEventFeedFilter(),
        $or: [
            {
                lat: { $gte: minLat, $lte: maxLat },
                lng: { $gte: minLng, $lte: maxLng },
            },
            { lat: null },
            { lng: null },
            // Treat US Center fallback coordinates as missing
            {
                lat: { $gte: US_CENTER_LAT - 0.0001, $lte: US_CENTER_LAT + 0.0001 },
                lng: { $gte: US_CENTER_LNG - 0.0001, $lte: US_CENTER_LNG + 0.0001 },
            },
        ],
    };

    const loc = locationFilter(jurisdiction.stateCode?.toLowerCase());
    if (loc) Object.assign(filter, loc);

    return UnifiedEvent.find(filter).sort({ updatedAt: -1 }).lean() as unknown as UnifiedEventDoc[];
}

/**
 * All events with dataStatus='current', optionally scoped to a state.
 * Index hint: { dataStatus:1, updatedAt:-1 }
 */
export async function getCurrentEvents(opts?: { stateCd?: string }): Promise<UnifiedEventDoc[]> {
    await dbConnect();
    const filter: Record<string, unknown> = { ...unifiedEventFeedFilter() };
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
    const filter: Record<string, unknown> = { dataStatus: 'past', ...mongoUnifiedEventCategoryFilter(category) };
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
