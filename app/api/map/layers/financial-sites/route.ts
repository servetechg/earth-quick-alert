import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { boundsFromQuery } from '@/lib/gis/map-api-bounds';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import {
    queryFinancialSitesByBounds,
    queryFinancialSitesByState,
} from '@/lib/gis/layers/fdic-financial-query';

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin']);

export const maxDuration = 30;

/**
 * GET /api/map/layers/financial-sites?state=FL
 * GET /api/map/layers/financial-sites?west=…&south=…&east=…&north=…
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
        const stateKey =
            normalizeStateToUsps(stateParam) ?? (stateParam.length === 2 ? stateParam.toUpperCase() : null);
        const bounds = boundsFromQuery(url);

        if (!stateKey && !bounds) {
            return NextResponse.json(
                { error: 'Provide state=XX or map bounds (west,south,east,north)' },
                { status: 400 },
            );
        }

        if (bounds) {
            const { markers, cached } = await queryFinancialSitesByBounds(bounds, {
                stateKey: stateKey ?? undefined,
                force,
            });
            return NextResponse.json({
                markers,
                count: markers.length,
                stateKey,
                source: 'fdic',
                cached,
            });
        }

        const { markers, cached } = await queryFinancialSitesByState(stateKey!, { force });
        return NextResponse.json({
            markers,
            count: markers.length,
            stateKey,
            source: 'fdic',
            cached,
        });
    } catch (error) {
        console.error('map/layers/financial-sites GET:', error);
        return NextResponse.json({ error: 'Failed to fetch financial sites layer' }, { status: 500 });
    }
}
