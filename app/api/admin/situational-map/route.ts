import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import {
    alignedIncidentStatsFromCards,
    fetchAlignedUnifiedEventFeed,
} from '@/lib/services/alert-communication-aligned-feed';
import { syncAlertCommunicationFeedsGate } from '@/lib/services/alert-communication-feed-sync-gate';
import { resolveHeatPointsFromAlignedRows } from '@/lib/geo/resolve-aligned-event-heatpoints';
import {
    fetchNationwideCitizenMarkers,
    fetchNationwideResponderMarkers,
    fetchScopedCitizenMarkers,
    fetchScopedResponderMarkers,
    fetchSubAdminLeaderMarkers,
} from '@/lib/services/situational-map-markers';
import { resolveSubAdminJurisdiction } from '@/lib/sub-admin/jurisdiction';
import { ensureArkansasPresentationLicense } from '@/lib/demo/ensure-presentation-license';
import { DEMO_PRESENTATION_EMAIL } from '@/lib/demo/constants';
import { resolveDemoSessionContext, getDemoSituationalMapPayload } from '@/lib/demo/provider';
import {
    filterLatLngInUsa,
    isSuperAdminNationwideView,
} from '@/lib/constants/usa-map-bounds';

function mapCitizensToClient(
    rows: Awaited<ReturnType<typeof fetchNationwideCitizenMarkers>>
) {
    return rows.map((c) => ({
        id: c.id,
        lat: c.lat,
        lng: c.lng,
        title: c.title,
        isSafe: c.isSafe,
        status: c.status,
        location: c.location,
        description: c.description,
    }));
}

function mapRespondersToClient(
    rows: Awaited<ReturnType<typeof fetchNationwideResponderMarkers>>
) {
    return rows.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        title: r.title,
        status: r.status,
        location: r.location,
        description: r.description,
        color: r.color,
        icon: r.icon,
    }));
}

function mapLeadersToClient(rows: Awaited<ReturnType<typeof fetchSubAdminLeaderMarkers>>) {
    return rows.map((l) => ({
        id: l.id,
        lat: l.lat,
        lng: l.lng,
        title: l.title,
        status: l.status,
        location: l.location,
        description: l.description,
    }));
}

async function loadEntityMarkers(input: {
    role: string;
    userId: string;
    scopeState?: string;
    allowGeocode: boolean;
    usaOnlyNationwide: boolean;
}) {
    const { role, userId, scopeState, allowGeocode, usaOnlyNationwide } = input;

    const [citizenRows, responderRows, leaderRows] = await Promise.all([
        role === 'sub-admin'
            ? fetchScopedCitizenMarkers(userId, { allowGeocode })
            : role === 'super-admin'
              ? fetchNationwideCitizenMarkers({ stateRaw: scopeState, allowGeocode })
              : Promise.resolve([]),
        role === 'sub-admin'
            ? fetchScopedResponderMarkers(userId, { allowGeocode })
            : role === 'super-admin'
              ? fetchNationwideResponderMarkers({ stateRaw: scopeState, allowGeocode })
              : Promise.resolve([]),
        role === 'super-admin'
            ? fetchSubAdminLeaderMarkers({ stateRaw: scopeState, allowGeocode })
            : Promise.resolve([]),
    ]);

    let citizens: ReturnType<typeof mapCitizensToClient> = [];
    let responders: ReturnType<typeof mapRespondersToClient> = [];
    let leaders: ReturnType<typeof mapLeadersToClient> = [];

    if (role === 'sub-admin') {
        citizens = mapCitizensToClient(citizenRows);
        responders = mapRespondersToClient(responderRows);
    } else if (role === 'super-admin') {
        citizens = mapCitizensToClient(
            usaOnlyNationwide ? filterLatLngInUsa(citizenRows) : citizenRows,
        );
        responders = mapRespondersToClient(
            usaOnlyNationwide ? filterLatLngInUsa(responderRows) : responderRows,
        );
        leaders = mapLeadersToClient(
            usaOnlyNationwide ? filterLatLngInUsa(leaderRows) : leaderRows,
        );
    }

    return { citizens, responders, leaders };
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        const userId = session.user.id as string;
        const url = new URL(req.url);
        const scopeState = url.searchParams.get('scopeState')?.trim() || undefined;
        const geocodeMarkers = url.searchParams.get('geocodeMarkers') === '1';
        const usaOnlyNationwide = isSuperAdminNationwideView(role, scopeState);

        const demoCtx = await resolveDemoSessionContext(userId, session.user.email as string);
        if (demoCtx && role === 'sub-admin') {
            const demo = getDemoSituationalMapPayload();
            if (geocodeMarkers) {
                return NextResponse.json({
                    citizens: demo.citizens,
                    responders: demo.responders,
                    leaders: [],
                    demo: true,
                    markersOnly: true,
                });
            }
            const stats = alignedIncidentStatsFromCards(demo.alignedRows);
            const incidents = await resolveHeatPointsFromAlignedRows(demo.alignedRows, {
                maxGeocode: demo.alignedRows.length,
            });
            return NextResponse.json({
                incidents,
                alignedEventCount: stats.alignedEventCount,
                incidentCount: stats.alignedEventCount,
                heatPointCount: incidents.length,
                majorIncidents: stats.major_incidents,
                minorIncidents: stats.minor_incidents,
                citizens: demo.citizens,
                responders: demo.responders,
                leaders: [],
                coverage: demo.coverage,
                tornadoPath: demo.tornadoPath,
                scope: 'state',
                demo: true,
                scenarioId: demo.scenarioId,
                scenarioTitle: demo.scenarioTitle,
            });
        }

        // Enrich pass: geocode users missing lat/lng without blocking the heatmap response.
        if (geocodeMarkers) {
            const entities = await loadEntityMarkers({
                role,
                userId,
                scopeState,
                allowGeocode: true,
                usaOnlyNationwide,
            });
            return NextResponse.json({
                ...entities,
                markersOnly: true,
            });
        }

        const rows = await fetchAlignedUnifiedEventFeed({ userId, role });

        void syncAlertCommunicationFeedsGate().catch((e) =>
            console.error('[situational-map:bg-sync]', e),
        );

        const stats = alignedIncidentStatsFromCards(rows as Record<string, unknown>[]);

        let preferState: string | undefined;
        if (role === 'sub-admin') {
            const jurisdictionForCoords = await resolveSubAdminJurisdiction(userId);
            preferState = jurisdictionForCoords?.stateCode ?? undefined;
        } else if (scopeState) {
            preferState = scopeState.trim().toUpperCase().slice(0, 2);
        }

        const maxGeocode = Math.min(Math.max(rows.length * 12, 12), 48);

        const [rawIncidents, entities] = await Promise.all([
            resolveHeatPointsFromAlignedRows(rows as Record<string, unknown>[], {
                maxGeocode,
                preferState,
            }),
            loadEntityMarkers({
                role,
                userId,
                scopeState,
                allowGeocode: false,
                usaOnlyNationwide,
            }),
        ]);

        const incidents = filterLatLngInUsa(rawIncidents);

        let coverage: {
            center: { lat: number; lng: number };
            radiusMile: number;
            radiusMeters: number;
            coverageType: 'state' | 'radius';
            state?: string;
            stateCode?: string;
        } | null = null;

        if (role === 'sub-admin') {
            const email = String(session.user.email ?? '').trim().toLowerCase();
            if (email === DEMO_PRESENTATION_EMAIL) {
                await ensureArkansasPresentationLicense(userId);
            }
            const jurisdiction = await resolveSubAdminJurisdiction(userId);
            if (jurisdiction) {
                coverage = {
                    center: jurisdiction.center,
                    radiusMile: jurisdiction.radiusMile,
                    radiusMeters: jurisdiction.radiusMile * 1609.34,
                    coverageType: jurisdiction.coverageType,
                    state: jurisdiction.stateRaw,
                    stateCode: jurisdiction.stateCode ?? undefined,
                };
            }
        }

        return NextResponse.json({
            incidents,
            /** Same count as Alerts & Communication list and AI Risk `alerts_count`. */
            alignedEventCount: stats.alignedEventCount,
            incidentCount: stats.alignedEventCount,
            heatPointCount: incidents.length,
            majorIncidents: stats.major_incidents,
            minorIncidents: stats.minor_incidents,
            citizens: entities.citizens,
            responders: entities.responders,
            leaders: entities.leaders,
            coverage,
            scope: role === 'sub-admin' ? 'jurisdiction' : 'nationwide',
        });
    } catch (error) {
        console.error('situational-map error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
