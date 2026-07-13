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
import {
    resolveUnifiedEventExpiresIso,
    resolveUnifiedEventIssuedIso,
} from '@/lib/services/mobile/unified-event-timestamps';
import { resolveUnifiedEventSourceUrl } from '@/lib/services/mobile/alert-source-url';

const SOURCE_LABELS: Record<string, string> = {
    nws: 'NWS',
    usgs: 'USGS',
    nwps: 'NWPS',
    fema: 'FEMA',
    firms: 'FIRMS',
    inciweb: 'INCIWEB',
    earthquake: 'USGS',
    noaa_ncei: 'NOAA',
    manual: 'READY2GO',
    seed: 'READY2GO',
};

function statesFromProfile(profile: UserProfilePayload | null): string[] {
    const states = new Set<string>();
    const addrState = profile?.address?.state?.trim();
    if (addrState) states.add(addrState);
    for (const loc of profile?.alertLocations ?? []) {
        if (loc.state?.trim()) states.add(loc.state.trim());
    }
    return [...states];
}

function toAlertSeverity(severity: string): AlertSeverity {
    const s = String(severity ?? '').toLowerCase();
    if (s === 'extreme') return AlertSeverity.EXTREME;
    if (s === 'high') return AlertSeverity.HIGH;
    if (s === 'moderate') return AlertSeverity.MODERATE;
    if (s === 'low') return AlertSeverity.LOW;
    return AlertSeverity.MODERATE;
}

function sourceLabel(source: string): string {
    const legacy = unifiedSourceToLegacy(source);
    return SOURCE_LABELS[legacy] ?? legacy.toUpperCase();
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

type UnifiedMobileAlert = Alert & {
    unifiedSource: string;
    sourceDisplay?: string;
    sourceUrl?: string;
    unifiedProperties?: Record<string, Record<string, unknown>>;
};

function unifiedDocToAlert(doc: UnifiedEventDoc): UnifiedMobileAlert {
    const issuedIso = resolveUnifiedEventIssuedIso(doc);
    const expiresIso = resolveUnifiedEventExpiresIso(doc);

    return {
        id: doc.externalId || doc._id,
        source: AlertSource.WEATHER_API,
        unifiedSource: doc.source,
        severity: toAlertSeverity(doc.severity),
        title: doc.name,
        description: doc.description ?? '',
        timestamp: issuedIso,
        expiresAt: expiresIso,
        affectedAreas: doc.location ? [doc.location] : [],
        areaDesc: doc.location,
        event: doc.name,
        sourceDisplay: sourceLabel(doc.source),
        sourceUrl: resolveUnifiedEventSourceUrl(doc),
        unifiedProperties: doc.properties,
    };
}

/**
 * Mobile alerts from UnifiedEvent (same source as admin Alerts & Communication).
 * Matches user zones + states via AI-aligned scope rules and coordinate bbox fallback.
 */
export async function fetchUnifiedEventsForMobileUser(
    profile: UserProfilePayload | null,
): Promise<UnifiedMobileAlert[]> {
    const zones = buildUserZones(profile);
    const zoneStrings = zones.map((z) => z.locationString);
    if (zoneStrings.length === 0) return [];

    const states = statesFromProfile(profile);
    if (states.length === 0) return [];

    const docs = await getCurrentEvents();
    const matched = docs.filter((doc) => unifiedEventMatchesUser(doc, zoneStrings, states));

    matched.sort(
        (a, b) =>
            new Date(resolveUnifiedEventIssuedIso(b)).getTime() -
            new Date(resolveUnifiedEventIssuedIso(a)).getTime(),
    );

    return matched.map(unifiedDocToAlert);
}

export function unifiedSourceDisplay(source: string): string {
    return sourceLabel(source);
}
