/**
 * Per-category property map for finding similar past events.
 *
 * Properties are stored as { [category]: { ...fields } } in UnifiedEvent.
 * Earthquake stores: properties.earthquake.magnitude (number)
 * NWS alerts store: properties[category].intensity.value (1-4 severity score)
 * FEMA stores: properties[category].femaDisasterNumber (number)
 *
 * Where no numeric property exists, we fall back to same-category + same-severity matching.
 */

import UnifiedEvent from '@/models/UnifiedEvent';
import dbConnect from '@/lib/mongodb';
import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { getEventPropertyValue, getEventPropertyString } from '@/lib/services/unified-event-repo';

interface PropertyMatchConfig {
    /** Dot-path within properties, e.g. "earthquake.magnitude" */
    path: string;
    /** Returns the [lo, hi] bounds for a given value */
    tolerance: (v: number) => { lo: number; hi: number };
}

const PROPERTY_MATCH_MAP: Partial<Record<string, PropertyMatchConfig>> = {
    earthquake: {
        path: 'earthquake.magnitude',
        tolerance: (v) => ({ lo: v - 0.5, hi: v + 0.5 }),
    },
    flood: {
        path: 'flood.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    storm: {
        path: 'storm.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    wildfire: {
        path: 'wildfire.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    hurricane_typhoon: {
        path: 'hurricane_typhoon.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    marine: {
        path: 'marine.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    coastal_surf: {
        path: 'coastal_surf.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    tsunami: {
        path: 'tsunami.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    volcanic: {
        path: 'volcanic.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    winter_weather: {
        path: 'winter_weather.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    air_quality: {
        path: 'air_quality.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    extreme_heat: {
        path: 'extreme_heat.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    hazardous: {
        path: 'hazardous.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    landslide: {
        path: 'landslide.intensity.value',
        tolerance: (v) => ({ lo: Math.max(1, v - 1), hi: Math.min(4, v + 1) }),
    },
    fema_declaration: {
        path: 'fema_declaration.femaDisasterNumber',
        tolerance: (v) => ({ lo: v - 5000, hi: v + 5000 }), // broad range for disaster numbers
    },
};

/** Extract a 2-letter state abbreviation from a location string, e.g. "Harris County, TX" → "TX" */
function extractStateFromLocation(location: string): string | null {
    const m = location.match(/\b([A-Z]{2})\b/);
    return m ? m[1] : null;
}

/**
 * Find up to `limit` past events similar to `seedEvent`.
 * Algorithm (plan §6.2):
 * 1. Try property-based matching with base tolerance
 * 2. If not enough, widen tolerance ×2 then ×4
 * 3. If still not enough, top up with same-category + same-state
 * 4. Return empty if nothing found
 */
export async function findSimilarPastEvents(
    seedEvent: UnifiedEventDoc,
    limit = 3,
): Promise<UnifiedEventDoc[]> {
    await dbConnect();

    const category = seedEvent.category;
    const config = PROPERTY_MATCH_MAP[category];
    const propValue = config ? getEventPropertyValue(seedEvent, config.path) : null;
    const stateAbbr = extractStateFromLocation(seedEvent.location);

    const found = new Map<string, UnifiedEventDoc>();

    // Phase 1 & 2: property-based with progressively wider tolerance
    if (config && propValue !== null) {
        const toleranceMultipliers = [1, 2, 4];
        for (const mult of toleranceMultipliers) {
            if (found.size >= limit) break;
            const base = config.tolerance(propValue);
            const lo = base.lo - (base.hi - base.lo) * (mult - 1) * 0.5;
            const hi = base.hi + (base.hi - base.lo) * (mult - 1) * 0.5;

            const mongoPath = `properties.${config.path}`;
            const filter: Record<string, unknown> = {
                dataStatus: 'past',
                category,
                [mongoPath]: { $gte: lo, $lte: hi },
            };

            const rows = await UnifiedEvent
                .find(filter)
                .sort({ updatedAt: -1 })
                .limit(limit * 3)
                .lean() as unknown as UnifiedEventDoc[];

            for (const r of rows) {
                if (!found.has(r.externalId)) found.set(r.externalId, r);
                if (found.size >= limit) break;
            }
        }
    }

    // Phase 3: top up with same-category (+ same state if extractable) + same severity
    if (found.size < limit) {
        const filter: Record<string, unknown> = {
            dataStatus: 'past',
            category,
            severity: seedEvent.severity,
        };
        if (stateAbbr) {
            filter.location = { $regex: new RegExp(`\\b${stateAbbr}\\b`) };
        }

        const rows = await UnifiedEvent
            .find(filter)
            .sort({ updatedAt: -1 })
            .limit((limit - found.size) * 4)
            .lean() as unknown as UnifiedEventDoc[];

        for (const r of rows) {
            if (!found.has(r.externalId)) found.set(r.externalId, r);
            if (found.size >= limit) break;
        }
    }

    // Phase 4: last resort — same-category only, no state filter
    if (found.size < limit) {
        const rows = await UnifiedEvent
            .find({ dataStatus: 'past', category })
            .sort({ updatedAt: -1 })
            .limit((limit - found.size) * 4)
            .lean() as unknown as UnifiedEventDoc[];

        for (const r of rows) {
            if (!found.has(r.externalId)) found.set(r.externalId, r);
            if (found.size >= limit) break;
        }
    }

    return [...found.values()].slice(0, limit);
}

/**
 * Compute a deterministic match-confidence score (0–100) for a set of past matches.
 */
export function computeMatchConfidence(
    seedEvent: UnifiedEventDoc,
    similarPast: UnifiedEventDoc[],
): number {
    const config = PROPERTY_MATCH_MAP[seedEvent.category];
    const propValue = config ? getEventPropertyValue(seedEvent, config.path) : null;

    let score = 40;
    if (similarPast.length >= 3) score += 20;
    if (propValue !== null && config) {
        const pastHasProp = similarPast.some(
            (p) => getEventPropertyValue(p, config.path) !== null,
        );
        if (pastHasProp) score += 15;
    }

    const seedState = extractStateFromLocation(seedEvent.location);
    if (seedState && similarPast.some((p) => p.location.includes(seedState))) {
        score += 10;
    }

    const SEVERITY_SCORE: Record<string, number> = { Low: 1, Moderate: 2, High: 3, Extreme: 4 };
    const seedSev = SEVERITY_SCORE[seedEvent.severity] ?? 2;
    const avgPastSev =
        similarPast.length > 0
            ? similarPast.reduce((s, p) => s + (SEVERITY_SCORE[p.severity] ?? 2), 0) /
              similarPast.length
            : 0;
    if (similarPast.length > 0 && Math.abs(seedSev - avgPastSev) <= 1) score += 15;

    return Math.min(100, score);
}

/**
 * Pick the seed event from a list of current events (most severe, then largest intensity).
 */
export function pickSeedEvent(currentEvents: UnifiedEventDoc[]): UnifiedEventDoc {
    const SEVERITY_SCORE: Record<string, number> = { Low: 1, Moderate: 2, High: 3, Extreme: 4 };
    return [...currentEvents].sort((a, b) => {
        const sevDiff = (SEVERITY_SCORE[b.severity] ?? 2) - (SEVERITY_SCORE[a.severity] ?? 2);
        if (sevDiff !== 0) return sevDiff;
        const config = PROPERTY_MATCH_MAP[a.category];
        if (config) {
            const av = getEventPropertyValue(a, config.path) ?? 0;
            const bv = getEventPropertyValue(b, config.path) ?? 0;
            return bv - av;
        }
        return 0;
    })[0];
}

export { getEventPropertyValue, getEventPropertyString };
