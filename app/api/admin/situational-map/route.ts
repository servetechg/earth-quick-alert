import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import {
    alignedIncidentStatsFromCards,
    fetchAlignedUnifiedEventFeed,
} from '@/lib/services/alert-communication-aligned-feed';
import { resolveHeatPointsFromAlignedRows } from '@/lib/geo/resolve-aligned-event-heatpoints';
import {
    fetchNationwideCitizenMarkers,
    fetchNationwideResponderMarkers,
    fetchScopedCitizenMarkers,
    fetchScopedResponderMarkers,
    fetchSubAdminLeaderMarkers,
} from '@/lib/services/situational-map-markers';
import { resolveSubAdminJurisdiction } from '@/lib/sub-admin/jurisdiction';

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

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        const userId = session.user.id as string;
        const scopeState = new URL(req.url).searchParams.get('scopeState')?.trim() || undefined;

        const rows = await fetchAlignedUnifiedEventFeed({ userId, role });
        const stats = alignedIncidentStatsFromCards(rows as Record<string, unknown>[]);
        const incidents = await resolveHeatPointsFromAlignedRows(rows as Record<string, unknown>[]);

        let citizens: ReturnType<typeof mapCitizensToClient> = [];
        let responders: ReturnType<typeof mapRespondersToClient> = [];
        let leaders: ReturnType<typeof mapLeadersToClient> = [];

        if (role === 'sub-admin') {
            const [citizenRows, responderRows] = await Promise.all([
                fetchScopedCitizenMarkers(userId),
                fetchScopedResponderMarkers(userId),
            ]);
            citizens = mapCitizensToClient(citizenRows);
            responders = mapRespondersToClient(responderRows);
        } else if (role === 'super-admin') {
            const [citizenRows, responderRows, leaderRows] = await Promise.all([
                fetchNationwideCitizenMarkers({ stateRaw: scopeState }),
                fetchNationwideResponderMarkers({ stateRaw: scopeState }),
                fetchSubAdminLeaderMarkers({ stateRaw: scopeState }),
            ]);
            citizens = mapCitizensToClient(citizenRows);
            responders = mapRespondersToClient(responderRows);
            leaders = mapLeadersToClient(leaderRows);
        }

        let coverage: {
            center: { lat: number; lng: number };
            radiusMile: number;
            radiusMeters: number;
            state?: string;
            stateCode?: string;
        } | null = null;

        if (role === 'sub-admin') {
            const jurisdiction = await resolveSubAdminJurisdiction(userId);
            if (jurisdiction) {
                coverage = {
                    center: jurisdiction.center,
                    radiusMile: jurisdiction.radiusMile,
                    radiusMeters: jurisdiction.radiusMile * 1609.34,
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
            citizens,
            responders,
            leaders,
            coverage,
            scope: role === 'sub-admin' ? 'jurisdiction' : 'nationwide',
        });
    } catch (error) {
        console.error('situational-map error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
