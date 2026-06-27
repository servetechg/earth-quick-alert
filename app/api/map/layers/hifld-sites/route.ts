import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { boundsFromQuery } from '@/lib/gis/map-api-bounds';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';
import { HIFLD_NEXT_SECTOR_IDS } from '@/lib/gis/hifld-next/sector-dataset-config';
import {
    queryHifldSitesByBounds,
    queryHifldSitesByState,
} from '@/lib/gis/layers/hifld-next-query';

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin']);
const VALID_SECTOR_IDS = new Set<string>(HIFLD_NEXT_SECTOR_IDS);

export const maxDuration = 30;

function parseSectors(raw: string | null): CriticalInfraSectorId[] {
    if (!raw?.trim()) return [...HIFLD_NEXT_SECTOR_IDS];
    const sectors = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => VALID_SECTOR_IDS.has(s)) as CriticalInfraSectorId[];
    return sectors.length > 0 ? sectors : [...HIFLD_NEXT_SECTOR_IDS];
}

/**
 * GET /api/map/layers/hifld-sites?sectors=ci_healthcare,ci_energy&state=FL
 * GET /api/map/layers/hifld-sites?sectors=ci_healthcare&west=…&south=…&east=…&north=…
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
        const sectors = parseSectors(url.searchParams.get('sectors'));
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
            const { markers, cached } = await queryHifldSitesByBounds(sectors, bounds, {
                stateKey: stateKey ?? undefined,
                force,
            });
            return NextResponse.json({
                markers,
                count: markers.length,
                sectors,
                stateKey,
                source: 'hifld-next',
                cached,
            });
        }

        const { markers, cached } = await queryHifldSitesByState(sectors, stateKey!, { force });
        return NextResponse.json({
            markers,
            count: markers.length,
            sectors,
            stateKey,
            source: 'hifld-next',
            cached,
        });
    } catch (error) {
        console.error('map/layers/hifld-sites GET:', error);
        return NextResponse.json({ error: 'Failed to fetch HIFLD sites layer' }, { status: 500 });
    }
}
