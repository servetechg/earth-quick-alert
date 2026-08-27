import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes';
import { resolveHeatPointsFromAlignedRows } from '@/lib/geo/resolve-aligned-event-heatpoints';
import { resolveUniqueAlertCoordinates } from '@/lib/geo/resolve-alert-coordinates';
import { isUsCenterFallbackCoords } from '@/lib/geo/us-center-coords';
import { parseLocations } from '@/lib/utils/alert-communication-hydrate';
import { normalizeStateToUsps, getStateCenterCoords } from '@/lib/utils/us-state-usps';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type { Alert } from '@/lib/types/api-alerts';

type UnifiedMobileAlert = Alert & {
    unifiedSource?: string;
    unifiedProperties?: Record<string, Record<string, unknown>>;
};

export function statesFromProfile(profile: UserProfilePayload | null): string[] {
    const states = new Set<string>();
    const addrState = profile?.address?.state?.trim();
    if (addrState) states.add(addrState);
    for (const loc of profile?.alertLocations ?? []) {
        if (loc.state?.trim()) states.add(loc.state.trim());
    }
    return [...states];
}

export function preferStateFromProfile(profile: UserProfilePayload | null): string | null {
    for (const state of statesFromProfile(profile)) {
        const usps = normalizeStateToUsps(state);
        if (usps) return usps;
    }
    return null;
}

export function mobileAlertToCoordRow(alert: UnifiedMobileAlert): Record<string, unknown> {
    const location =
        typeof alert.areaDesc === 'string' && alert.areaDesc.trim()
            ? alert.areaDesc.trim()
            : alert.affectedAreas?.[0] ?? '';
    const locations =
        Array.isArray(alert.affectedAreas) && alert.affectedAreas.length > 1
            ? alert.affectedAreas.map((s) => String(s).trim()).filter(Boolean)
            : parseLocations(location);
    const preview = locations.slice(0, 3).join(', ');
    const locationSummary =
        locations.length > 3 ? `${preview} (+${locations.length - 3})` : preview || location;

    return {
        id: alert.id,
        _id: alert.id,
        lat: alert.coordinates?.lat ?? null,
        lng: alert.coordinates?.lon ?? null,
        location,
        locations,
        locationSummary,
        properties: alert.unifiedProperties ?? {},
        severity: String(alert.severity ?? ''),
        name: alert.title,
        source: alert.unifiedSource ?? alert.source,
    };
}

/** Same coordinate resolver as admin situational map — one distinct point per alert. */
export async function resolveMobileAlertCoordinateMap(
    alerts: UnifiedMobileAlert[],
    preferState: string | null,
): Promise<Map<string, { lat: number; lon: number }>> {
    if (alerts.length === 0) return new Map();

    const rows = alerts.map(mobileAlertToCoordRow);
    const points = await resolveHeatPointsFromAlignedRows(rows, {
        maxGeocode: Math.min(rows.length, 48),
        preferState,
    });

    const map = new Map<string, { lat: number; lon: number }>();
    for (const point of points) {
        map.set(point.id, { lat: point.lat, lon: point.lng });
    }
    return map;
}

/** Drop map markers outside the user's profile state(s). US-center fallback is always rejected. */
export function coordsInUserProfileStates(
    lat: number,
    lng: number,
    profile: UserProfilePayload | null,
): boolean {
    const states = statesFromProfile(profile);
    if (states.length === 0) return true;
    if (isUsCenterFallbackCoords(lat, lng)) return false;

    for (const state of states) {
        const usps = normalizeStateToUsps(state);
        if (!usps) continue;
        if (pointInUsStateBBox(lng, lat, usps)) return true;
    }
    return false;
}

/** Resolve plottable coordinates for one mobile alert (feed row already matched the user). */
export async function resolveCoordsForMobileAlert(
    alert: UnifiedMobileAlert,
    preferState: string | null,
): Promise<{ lat: number; lon: number } | null> {
    const row = mobileAlertToCoordRow(alert);
    const resolved = await resolveUniqueAlertCoordinates(row, {
        preferState,
        used: [],
        geocodeBudget: { remaining: 8 },
    });
    if (!resolved) return null;
    if (isUsCenterFallbackCoords(resolved.lat, resolved.lng)) return null;
    return { lat: resolved.lat, lon: resolved.lng };
}

/** Guaranteed in-state fallback when geocoding fails but the alert is already in the user's feed. */
export function stateCenterCoordsForPreferState(
    preferState: string | null | undefined,
): { lat: number; lon: number } | null {
    if (!preferState) return null;
    const center = getStateCenterCoords(preferState);
    if (!center) return null;
    return { lat: center.lat, lon: center.lng };
}

export function stateCenterCoordsForProfile(
    profile: UserProfilePayload | null,
): { lat: number; lon: number } | null {
    return stateCenterCoordsForPreferState(preferStateFromProfile(profile));
}
