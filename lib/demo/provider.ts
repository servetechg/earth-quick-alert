import type { SubAdminJurisdiction } from '@/lib/sub-admin/jurisdiction';
import { getUsStateBbox } from '@/lib/constants/us-state-bounding-boxes';
import User from '@/models/User';
import { isDemoEligibleEmail } from '@/lib/demo/eligibility';
import { readDemoSimulationCookie } from '@/lib/demo/cookie';
import {
    buildDemoLegacyAlertCards,
    buildDemoUnifiedEventDocs,
    getDemoTornadoPathForMap,
} from '@/lib/demo/build-unified-events';
import {
    DEMO_CITIZEN_MARKERS,
    DEMO_RESPONDER_MARKERS,
    LITTLE_ROCK_TORNADO_2023,
} from '@/lib/demo/data/little-rock-tornado-2023';
import {
    buildDemoAnalyzeResponse,
    buildDemoIncidentDetails,
    buildDemoSeveritySummaries,
    buildDemoSummaryResponse,
} from '@/lib/demo/build-risk-responses';
import { DEMO_SCENARIO_ID, DEMO_SCENARIO_TITLE } from '@/lib/demo/constants';

export type DemoSessionContext = {
    active: true;
    scenarioId: string;
    scenarioTitle: string;
    email: string;
    userId: string;
};

export async function resolveDemoSessionContext(
    userId: string | undefined,
    email: string | undefined | null,
): Promise<DemoSessionContext | null> {
    if (!userId || !isDemoEligibleEmail(email)) return null;
    const enabled = await readDemoSimulationCookie();
    if (!enabled) return null;
    return {
        active: true,
        scenarioId: DEMO_SCENARIO_ID,
        scenarioTitle: DEMO_SCENARIO_TITLE,
        email: String(email).trim().toLowerCase(),
        userId,
    };
}

/** Full Arkansas state envelope for demo map coverage (not license radius). */
export function buildArkansasStateWideJurisdiction(): SubAdminJurisdiction {
    const bbox = getUsStateBbox('AR')!;
    const [west, south, east, north] = bbox;
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    const latSpan = north - south;
    const lngSpan = east - west;
    const radiusMile = Math.ceil(Math.sqrt(latSpan ** 2 + lngSpan ** 2) * 69 * 0.55);

    return {
        stateRaw: 'Arkansas',
        stateCode: 'AR',
        center: { lat: centerLat, lng: centerLng },
        radiusMile: Math.max(radiusMile, 200),
        radiusKm: Math.max(radiusMile, 200) * 1.60934,
        coverageType: 'state',
    };
}

export async function maybeDemoJurisdictionOverride(
    userId: string,
): Promise<SubAdminJurisdiction | null> {
    const u = await User.findById(userId).select('email role').lean();
    if (!u || String(u.role) !== 'sub-admin') return null;
    const ctx = await resolveDemoSessionContext(userId, u.email as string);
    if (!ctx) return null;
    return buildArkansasStateWideJurisdiction();
}

export function getDemoFeedEntry() {
    return {
        docs: buildDemoUnifiedEventDocs(),
        cards: buildDemoLegacyAlertCards(),
    };
}

export function getDemoSituationalMapPayload() {
    const jurisdiction = buildArkansasStateWideJurisdiction();
    const cards = buildDemoLegacyAlertCards();
    const t = LITTLE_ROCK_TORNADO_2023;

    return {
        alignedRows: cards,
        coverage: {
            center: jurisdiction.center,
            radiusMile: jurisdiction.radiusMile,
            radiusMeters: jurisdiction.radiusMile * 1609.34,
            coverageType: 'state' as const,
            state: jurisdiction.stateRaw,
            stateCode: jurisdiction.stateCode ?? 'AR',
            stateWide: true,
        },
        citizens: DEMO_CITIZEN_MARKERS.map((c) => ({
            id: c.id,
            lat: c.lat,
            lng: c.lng,
            title: c.title,
            isSafe: c.isSafe,
            status: c.status ?? (c.isSafe ? 'safe' : 'help'),
            location: c.location,
            description: c.description,
        })),
        responders: DEMO_RESPONDER_MARKERS.map((r) => ({
            id: r.id,
            lat: r.lat,
            lng: r.lng,
            title: r.title,
            status: r.status,
            location: r.location,
            description: r.description,
            color: '#33375D',
            icon: 'responder',
        })),
        tornadoPath: getDemoTornadoPathForMap(),
        demo: true,
        scenarioId: DEMO_SCENARIO_ID,
        scenarioTitle: t.shortName,
    };
}

export {
    buildDemoAnalyzeResponse,
    buildDemoIncidentDetails,
    buildDemoSeveritySummaries,
    buildDemoSummaryResponse,
};
