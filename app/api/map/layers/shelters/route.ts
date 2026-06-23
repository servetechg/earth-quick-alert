import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { boundsFromQuery } from '@/lib/gis/map-api-bounds';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import { querySheltersByBounds, querySheltersByState } from '@/lib/gis/layers/fema-shelters-query';

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin']);

export const maxDuration = 30;

/**
 * GET /api/map/layers/shelters?state=TX
 * GET /api/map/layers/shelters?west=…&south=…&east=…&north=…
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
            const { markers, cached } = await querySheltersByBounds(bounds, {
                stateKey: stateKey ?? undefined,
                force,
            });
            return NextResponse.json({
                markers,
                count: markers.length,
                stateKey,
                source: 'fema-nss',
                cached,
            });
        }

        const { markers, cached } = await querySheltersByState(stateKey!, { force });
        return NextResponse.json({
            markers,
            count: markers.length,
            stateKey,
            source: 'fema-nss',
            cached,
        });
    } catch (error) {
        console.error('map/layers/shelters GET:', error);
        return NextResponse.json({ error: 'Failed to fetch shelters layer' }, { status: 500 });
    }
}
