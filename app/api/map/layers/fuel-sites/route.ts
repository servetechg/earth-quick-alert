import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { boundsFromQuery } from '@/lib/gis/map-api-bounds';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import { queryFuelSitesByBounds, queryFuelSitesByState } from '@/lib/gis/layers/nrel-fuel-sites-query';

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin']);

export const maxDuration = 30;

/**
 * GET /api/map/layers/fuel-sites?state=AR
 * GET /api/map/layers/fuel-sites?west=…&south=…&east=…&north=…
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
            const { markers, cached } = await queryFuelSitesByBounds(bounds, {
                stateKey: stateKey ?? undefined,
                force,
            });
            return NextResponse.json({
                markers,
                count: markers.length,
                stateKey,
                source: 'nrel-afdc',
                cached,
            });
        }

        const { markers, cached } = await queryFuelSitesByState(stateKey!, { force });
        return NextResponse.json({
            markers,
            count: markers.length,
            stateKey,
            source: 'nrel-afdc',
            cached,
        });
    } catch (error) {
        console.error('map/layers/fuel-sites GET:', error);
        return NextResponse.json({ error: 'Failed to fetch fuel sites layer' }, { status: 500 });
    }
}
