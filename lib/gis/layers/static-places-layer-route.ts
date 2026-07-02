import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { boundsFromQuery } from '@/lib/gis/map-api-bounds';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import type { StaticPlacesQueryApi } from '@/lib/gis/layers/static-google-places-query';

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin']);

type StaticPlacesLayerRouteConfig = {
    layerName: string;
    source: string;
    query: StaticPlacesQueryApi;
};

export function createStaticPlacesLayerGetHandler(config: StaticPlacesLayerRouteConfig) {
    return async function GET(req: Request) {
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
                const { markers, cached } = await config.query.queryByBounds(bounds, {
                    stateKey: stateKey ?? undefined,
                    force,
                });
                return NextResponse.json({
                    markers,
                    count: markers.length,
                    stateKey,
                    source: config.source,
                    cached,
                });
            }

            const { markers, cached } = await config.query.queryByState(stateKey!, { force });
            return NextResponse.json({
                markers,
                count: markers.length,
                stateKey,
                source: config.source,
                cached,
            });
        } catch (error) {
            console.error(`map/layers/${config.layerName} GET:`, error);
            return NextResponse.json({ error: `Failed to fetch ${config.layerName} layer` }, { status: 500 });
        }
    };
}
