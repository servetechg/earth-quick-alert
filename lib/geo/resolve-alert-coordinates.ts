import { pointInUsaBounds } from '@/lib/constants/usa-map-bounds';
import { geocodeLocation } from '@/lib/services/location-matching';
import { getStateCenterCoords } from '@/lib/utils/us-state-usps';
import { isUsCenterFallbackCoords, sanitizeAlertCoordinates } from '@/lib/geo/us-center-coords';

export type ResolvedAlertCoordinates = { lat: number; lng: number };

const COORD_DEDUP_EPS = 0.015;

function rowLocationCandidates(row: Record<string, unknown>): string[] {
    const out: string[] = [];
    const push = (value: unknown) => {
        if (typeof value !== 'string') return;
        const trimmed = value.trim();
        if (trimmed) out.push(trimmed);
    };

    if (Array.isArray(row.locations)) {
        for (const loc of row.locations) push(loc);
    }
    push(row.locationSummary);
    push(row.location);
    return [...new Set(out)];
}

/** Extract NWS UGC zone codes stored on unified event cards / docs. */
export function extractUgcZonesFromRow(row: Record<string, unknown>): string[] {
    const props = (row.properties ?? {}) as Record<string, unknown>;
    const zones = new Set<string>();

    for (const block of Object.values(props)) {
        if (!block || typeof block !== 'object') continue;
        const ugc = (block as Record<string, unknown>).ugcZones;
        if (!Array.isArray(ugc)) continue;
        for (const z of ugc) {
            if (typeof z === 'string' && z.trim()) zones.add(z.trim().toUpperCase());
        }
    }

    return [...zones];
}

/** Map UGC zone codes to a representative point (prefers the session state when provided). */
export function coordsFromUgcZones(
    zones: string[],
    preferState?: string | null,
): ResolvedAlertCoordinates | null {
    if (zones.length === 0) return null;

    const statePrefixes = [
        ...new Set(
            zones
                .map((z) => z.trim().slice(0, 2).toUpperCase())
                .filter((s) => /^[A-Z]{2}$/.test(s) && getStateCenterCoords(s)),
        ),
    ];

    if (statePrefixes.length > 1) {
        const centers = statePrefixes
            .map((s) => getStateCenterCoords(s))
            .filter((c): c is ResolvedAlertCoordinates => c != null);
        if (centers.length > 0) {
            return {
                lat: centers.reduce((sum, c) => sum + c.lat, 0) / centers.length,
                lng: centers.reduce((sum, c) => sum + c.lng, 0) / centers.length,
            };
        }
    }

    const prefer = preferState?.trim().toUpperCase();
    const ordered =
        prefer && /^[A-Z]{2}$/.test(prefer)
            ? [...zones.filter((z) => z.startsWith(prefer)), ...zones.filter((z) => !z.startsWith(prefer))]
            : zones;

    for (const zone of ordered) {
        if (zone.length < 2) continue;
        const center = getStateCenterCoords(zone.slice(0, 2));
        if (center) return center;
    }

    return null;
}

function pickLocationForGeocode(
    row: Record<string, unknown>,
    preferState?: string | null,
): string | null {
    const candidates = rowLocationCandidates(row);
    if (candidates.length === 0) return null;

    const prefer = preferState?.trim().toUpperCase();
    if (prefer) {
        const inState = candidates.find((c) => new RegExp(`\\b${prefer}\\b`, 'i').test(c));
        if (inState) return inState;
    }

    return candidates[0] ?? null;
}

/** Ordered location strings for geocoding — preserves NWS location order, appends state when missing. */
export function orderedLocationCandidates(
    row: Record<string, unknown>,
    preferState?: string | null,
): string[] {
    const candidates = rowLocationCandidates(row);
    const prefer = preferState?.trim().toUpperCase();
    const withState =
        !prefer || !/^[A-Z]{2}$/.test(prefer)
            ? candidates
            : candidates.map((loc) =>
                  new RegExp(`\\b${prefer}\\b`, 'i').test(loc) ? loc : `${loc}, ${prefer}`,
              );

    return prioritizeNwsLocationCandidates(withState);
}

/** Prefer boroughs / named cities over NWS zone fragments like "Northern Fairfield". */
function prioritizeNwsLocationCandidates(candidates: string[]): string[] {
    const score = (loc: string): number => {
        let s = 0;
        if (/\([^)]+\)/.test(loc)) s += 4;
        if (/\b(manhattan|brooklyn|bronx|queens|staten|nassau|suffolk|hudson|bergen|essex|passaic|fairfield|westchester|rockland|orange|putnam)\b/i.test(loc)) {
            s += 3;
        }
        if (/\bnew york\b/i.test(loc)) s += 3;
        if (/\b(northern|southern|eastern|western)\s+/i.test(loc) && !/\(/.test(loc)) s -= 2;
        return s;
    };

    return [...new Set(candidates)].sort((a, b) => score(b) - score(a));
}

function geocodeResultIsUsable(
    row: Record<string, unknown>,
    lat: number,
    lng: number,
): boolean {
    if (isUsCenterFallbackCoords(lat, lng)) return false;
    return storedAlertCoordsAreTrustworthy(lat, lng, row);
}

/** True when UGC codes look like standard US NWS forecast/county zones (e.g. CTZ005, NYZ067). */
export function hasUsNwsUgcZones(zones: string[]): boolean {
    return zones.length > 0 && zones.every((z) => /^[A-Z]{2}[CZ]\d/i.test(z.trim()));
}

/**
 * Reject stored coords that cannot belong to this alert (e.g. NWS Ireland centroid for a CT/NJ/NY flood watch).
 */
export function storedAlertCoordsAreTrustworthy(
    lat: number,
    lng: number,
    row: Record<string, unknown>,
): boolean {
    if (isUsCenterFallbackCoords(lat, lng)) return false;

    const source = String(row.source ?? '').toLowerCase();
    const ugc = extractUgcZonesFromRow(row);

    if (hasUsNwsUgcZones(ugc) || source === 'nws' || source === 'usgs' || source === 'earthquake') {
        return pointInUsaBounds(lat, lng);
    }

    return true;
}

/** True when coords are a generic fallback (US center or statewide centroid) — not alert-specific. */
export function isImpreciseAlertCoords(
    lat: number,
    lng: number,
    preferState?: string | null,
): boolean {
    if (isUsCenterFallbackCoords(lat, lng)) return true;
    const prefer = preferState?.trim().toUpperCase();
    if (prefer) {
        const center = getStateCenterCoords(prefer);
        if (
            center &&
            Math.abs(lat - center.lat) < 0.05 &&
            Math.abs(lng - center.lng) < 0.05
        ) {
            return true;
        }
    }
    return false;
}

export function coordsAreNearDuplicate(
    a: ResolvedAlertCoordinates,
    b: ResolvedAlertCoordinates,
): boolean {
    return Math.abs(a.lat - b.lat) < COORD_DEDUP_EPS && Math.abs(a.lng - b.lng) < COORD_DEDUP_EPS;
}

export function coordsAlreadyUsed(
    coords: ResolvedAlertCoordinates,
    used: ResolvedAlertCoordinates[],
): boolean {
    return used.some((u) => coordsAreNearDuplicate(u, coords));
}

/** Spread overlapping alerts so each produces a visible heat spot on the map. */
export function spreadCoordsAroundBase(
    base: ResolvedAlertCoordinates,
    index: number,
): ResolvedAlertCoordinates {
    if (index <= 0) return base;
    const angle = (index * 137.5 * Math.PI) / 180;
    const dist = 0.06 * index;
    const cosLat = Math.cos((base.lat * Math.PI) / 180);
    return {
        lat: base.lat + dist * Math.cos(angle),
        lng: base.lng + (dist * Math.sin(angle)) / Math.max(Math.abs(cosLat), 0.2),
    };
}

/** Fast coordinate resolution without external geocoding (valid stored coords only). */
export function syncResolveAlertCoordinates(
    row: Record<string, unknown>,
    _options?: { preferState?: string | null },
): ResolvedAlertCoordinates | null {
    const stored = sanitizeAlertCoordinates(
        typeof row.lat === 'number' ? row.lat : null,
        typeof row.lng === 'number' ? row.lng : null,
    );
    if (stored.lat != null && stored.lng != null) {
        if (storedAlertCoordsAreTrustworthy(stored.lat, stored.lng, row)) {
            return { lat: stored.lat, lng: stored.lng };
        }
    }

    return null;
}

/** Resolve plottable coordinates for an aligned alert row (geocodes when needed). */
export async function resolveAlertCoordinates(
    row: Record<string, unknown>,
    options?: { preferState?: string | null },
): Promise<ResolvedAlertCoordinates | null> {
    const sync = syncResolveAlertCoordinates(row, options);
    if (sync) return sync;

    const loc = pickLocationForGeocode(row, options?.preferState);
    if (loc) {
        const geo = await geocodeLocation(loc);
        if (geo && geocodeResultIsUsable(row, geo.lat, geo.lon)) {
            return { lat: geo.lat, lng: geo.lon };
        }
    }

    const ugc = extractUgcZonesFromRow(row);
    return coordsFromUgcZones(ugc, options?.preferState);
}

/**
 * Resolve unique map coordinates for one alert row (geocodes specific locations first).
 * Skips imprecise stored centroids and avoids duplicating coords already used in this batch.
 */
export async function resolveUniqueAlertCoordinates(
    row: Record<string, unknown>,
    options: {
        preferState?: string | null;
        used: ResolvedAlertCoordinates[];
        geocodeBudget?: { remaining: number };
    },
): Promise<ResolvedAlertCoordinates | null> {
    const preferState = options.preferState;
    const used = options.used;
    const budget = options.geocodeBudget;

    const sync = syncResolveAlertCoordinates(row, { preferState });
    if (
        sync &&
        storedAlertCoordsAreTrustworthy(sync.lat, sync.lng, row) &&
        !isImpreciseAlertCoords(sync.lat, sync.lng, preferState) &&
        !coordsAlreadyUsed(sync, used)
    ) {
        return sync;
    }

    const ugcZones = extractUgcZonesFromRow(row);
    const candidates = orderedLocationCandidates(row, preferState);
    const maxAttempts = Math.min(candidates.length, 12);

    for (let i = 0; i < maxAttempts; i += 1) {
        const loc = candidates[i];
        if (!loc) continue;
        if (budget && budget.remaining <= 0) break;
        if (budget) budget.remaining -= 1;

        const geo = await geocodeLocation(loc);
        if (!geo || !geocodeResultIsUsable(row, geo.lat, geo.lon)) continue;

        const candidate = { lat: geo.lat, lng: geo.lon };
        if (!coordsAlreadyUsed(candidate, used)) return candidate;
    }

    const ugc = coordsFromUgcZones(ugcZones, preferState);
    if (ugc && geocodeResultIsUsable(row, ugc.lat, ugc.lng) && !coordsAlreadyUsed(ugc, used)) {
        return ugc;
    }

    const base =
        sync ??
        ugc ??
        (preferState ? getStateCenterCoords(preferState) : null);
    if (!base) return null;

    let spreadIndex = 0;
    while (coordsAlreadyUsed(spreadCoordsAroundBase(base, spreadIndex), used)) {
        spreadIndex += 1;
        if (spreadIndex > 8) return spreadCoordsAroundBase(base, spreadIndex);
    }
    return spreadCoordsAroundBase(base, spreadIndex);
}
