import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { boundsFromQuery } from '@/lib/gis/map-api-bounds';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import {
    queryPoliceStationsByBounds,
    queryPoliceStationsByState,
} from '@/lib/gis/layers/police-stations-query';

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin']);

export const maxDuration = 30;

/**
 * GET /api/map/layers/police-stations?state=AR
 * GET /api/map/layers/police-stations?west=…&south=…&east=…&north=…
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!MAP_ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const url = new URL(req.url);
        const force = url.searchParams.get('refresh') === '1';
        const stateParam = url.searchParams.get('state')?.trim() ?? '';
        const stateKey = normalizeStateToUsps(stateParam) ?? (stateParam.length === 2 ? stateParam.toUpperCase() : null);
        const bounds = boundsFromQuery(url);

        if (!stateKey && !bounds) {
            return NextResponse.json(
                { error: 'Provide state=XX or map bounds (west,south,east,north)' },
                { status: 400 },
            );
        }

        if (bounds) {
            const { markers, cached } = await queryPoliceStationsByBounds(bounds, {
                stateKey: stateKey ?? undefined,
                force,
            });
            return NextResponse.json({
                markers,
                count: markers.length,
                stateKey,
                source: 'us-police-stations-mongo',
                cached,
            });
        }

        const { markers, cached } = await queryPoliceStationsByState(stateKey!, { force });
        return NextResponse.json({
            markers,
            count: markers.length,
            stateKey,
            source: 'us-police-stations-mongo',
            cached,
        });
    } catch (error) {
        console.error('map/layers/police-stations GET:', error);
        return NextResponse.json({ error: 'Failed to fetch police stations layer' }, { status: 500 });
    }
}
