import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes';
import { getCurrentEvents, type UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { buildUserZones } from '@/lib/services/mobile/zone-utils';
import { unifiedSourceToLegacy } from '@/lib/unified-event/legacy-source';
import {
    alertRowMatchesAiAlignedStateScope,
    locationStringsMatchState,
} from '@/lib/utils/alert-location-state-match';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import { Alert, AlertSeverity, AlertSource } from '@/lib/types/api-alerts';

function statesFromProfile(profile: UserProfilePayload | null): string[] {
    const states = new Set<string>();
    const addrState = profile?.address?.state?.trim();
    if (addrState) states.add(addrState);
    for (const loc of profile?.alertLocations ?? []) {
        if (loc.state?.trim()) states.add(loc.state.trim());
    }
    return [...states];
}

function legacySeverityToAlertSeverity(value: string): AlertSeverity {
    const n = (value || '').toLowerCase();
    if (n === 'extreme') return AlertSeverity.EXTREME;
    if (n === 'high') return AlertSeverity.HIGH;
    if (n === 'moderate') return AlertSeverity.MODERATE;
    if (n === 'low') return AlertSeverity.LOW;
    return AlertSeverity.MODERATE;
}

function legacySourceToAlertSource(legacy: string): AlertSource {
    const s = legacy.toLowerCase();
    if (s === 'usgs' || s === 'earthquake' || s === 'nwps') return AlertSource.WEATHER_API;
    if (s === 'nws' || s === 'fema' || s === 'firms' || s === 'inciweb') return AlertSource.WEATHER_API;
    return AlertSource.WEATHER_API;
}

function unifiedEventMatchesUser(
    doc: UnifiedEventDoc,
    zoneStrings: string[],
    states: string[],
): boolean {
    const legacySource = unifiedSourceToLegacy(doc.source);
    const row = {
        source: legacySource,
        location: doc.location ?? '',
        description: doc.description ?? '',
        name: doc.name ?? '',
        instructions: doc.instructions ?? [],
    };

    for (const state of states) {
        if (!locationStringsMatchState(zoneStrings, state)) continue;
        if (alertRowMatchesAiAlignedStateScope(row, state)) return true;
    }

    if (doc.lat != null && doc.lng != null && Number.isFinite(doc.lat) && Number.isFinite(doc.lng)) {
        for (const state of states) {
            const usps = normalizeStateToUsps(state);
            if (!usps) continue;
            if (pointInUsStateBBox(doc.lng, doc.lat, usps)) return true;
        }
    }

    return false;
}

function unifiedEventToAlert(doc: UnifiedEventDoc): Alert & { sourceDisplay: string } {
    const legacy = unifiedSourceToLegacy(doc.source);
    const issuedAt = doc.issuedAt || doc.createdAt || new Date().toISOString();
    const expiresAt = doc.expiresAt || undefined;

    return {
        id: doc.externalId || String(doc._id),
        source: legacySourceToAlertSource(legacy),
        severity: legacySeverityToAlertSeverity(doc.severity),
        title: doc.name,
        description: doc.description || '',
        timestamp: issuedAt,
        expiresAt: expiresAt && expiresAt !== 'null' ? expiresAt : undefined,
        affectedAreas: doc.location ? [doc.location] : [],
        areaDesc: doc.location,
        sourceDisplay: legacy.toUpperCase(),
    };
}

/**
 * Current unified events scoped to the user's profile address + alert location states,
 * using the same AI-aligned state matching as Alerts & Communication / Risk Assessment.
 */
export async function fetchUnifiedEventsForMobileUser(
    profile: UserProfilePayload | null,
): Promise<(Alert & { sourceDisplay?: string })[]> {
    const zones = buildUserZones(profile);
    const zoneStrings = zones.map((z) => z.locationString);
    if (zoneStrings.length === 0) return [];

    const states = statesFromProfile(profile);
    if (states.length === 0) return [];

    const events = await getCurrentEvents();
    const matched = events.filter((doc) => unifiedEventMatchesUser(doc, zoneStrings, states));

    return matched.map(unifiedEventToAlert);
}
