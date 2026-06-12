import { getCurrentEvents, type UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { alertRowMatchesAiAlignedStateScope } from '@/lib/utils/alert-location-state-match';
import { unifiedSourceToLegacy } from '@/lib/unified-event/legacy-source';
import { Alert, AlertSeverity, AlertSource } from '@/lib/types/api-alerts';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import {
    resolveUnifiedEventExpiresIso,
    resolveUnifiedEventIssuedIso,
} from '@/lib/services/mobile/unified-event-timestamps';

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

function collectUserStates(profile: UserProfilePayload | null): string[] {
    const states = new Set<string>();
    const home = profile?.address?.state?.trim();
    if (home) states.add(home);
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

function eventMatchesUser(doc: UnifiedEventDoc, states: string[]): boolean {
    if (states.length === 0) return false;
    const row = {
        source: doc.source,
        location: doc.location,
        description: doc.description,
        name: doc.name,
        instructions: doc.instructions,
    };
    return states.some((state) => alertRowMatchesAiAlignedStateScope(row, state));
}

type UnifiedMobileAlert = Alert & { unifiedSource: string };

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
    };
}

/**
 * Mobile alerts from UnifiedEvent (same source as admin Alerts & Communication).
 * Matches user home + alert-location states via AI-aligned scope rules.
 */
export async function fetchUnifiedEventsForMobileUser(
    profile: UserProfilePayload | null,
): Promise<Alert[]> {
    const states = collectUserStates(profile);
    if (states.length === 0) return [];

    const docs = await getCurrentEvents();
    const matched = docs.filter((doc) => eventMatchesUser(doc, states));

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
