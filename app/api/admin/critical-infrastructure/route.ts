import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { resolveDemoSessionContext } from '@/lib/demo/provider';
import {
    DEMO_CRITICAL_INFRA_MARKERS,
} from '@/lib/demo/critical-infrastructure-markers';
import {
    CRITICAL_INFRASTRUCTURE_SECTORS,
    type CriticalInfraSectorId,
} from '@/lib/gis/critical-infrastructure-sectors';
import {
    fetchGoogleCriticalInfraMarkers,
    type CiGoogleSearchScope,
} from '@/lib/gis/critical-infra-google-fetch';
import { parseMapBounds } from '@/lib/gis/map-api-bounds';
import {
    clampBoundsToUsa,
    filterLatLngInUsa,
    isSuperAdminNationwideView,
} from '@/lib/constants/usa-map-bounds';

/** Dashboard A (super-admin) and Dashboard B (sub-admin) — critical infrastructure layers. */
const CI_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin']);

export const maxDuration = 60;

function resolveSearchScope(input: {
    bounds?: ReturnType<typeof parseMapBounds>;
    lat?: number;
    lng?: number;
    radius?: number;
}): CiGoogleSearchScope | null {
    if (input.bounds) {
        return { mode: 'bounds', bounds: input.bounds };
    }
    if (Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
        return {
            mode: 'radius',
            lat: input.lat as number,
            lng: input.lng as number,
            radiusMeters: Number(input.radius) > 0 ? Number(input.radius) : 25_000,
        };
    }
    return null;
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!CI_ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const url = new URL(req.url);
        const sectorsParam = url.searchParams.get('sectors')?.trim() || '';
        const requestedSectors = sectorsParam
            ? (sectorsParam.split(',').filter(Boolean) as CriticalInfraSectorId[])
            : CRITICAL_INFRASTRUCTURE_SECTORS.map((s) => s.id);

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );

        if (demoCtx) {
            const markers = DEMO_CRITICAL_INFRA_MARKERS.filter((m) =>
                requestedSectors.includes(m.sectorId),
            );
            return NextResponse.json({ markers, demo: true, source: 'demo' });
        }

        const west = Number(url.searchParams.get('west'));
        const south = Number(url.searchParams.get('south'));
        const east = Number(url.searchParams.get('east'));
        const north = Number(url.searchParams.get('north'));
        const bounds =
            [west, south, east, north].every(Number.isFinite) && east > west && north > south
                ? isSuperAdminNationwideView(role)
                    ? clampBoundsToUsa({ west, south, east, north })
                    : { west, south, east, north }
                : null;

        const scope = resolveSearchScope({
            bounds,
            lat: Number(url.searchParams.get('lat')),
            lng: Number(url.searchParams.get('lng')),
            radius: Number(url.searchParams.get('radius')),
        });

        if (!scope) {
            if (isSuperAdminNationwideView(role)) {
                return NextResponse.json({
                    markers: [],
                    demo: false,
                    scope: 'bounds',
                    source: 'google_places',
                });
            }
            return NextResponse.json(
                {
                    error:
                        'Provide map bounds (west,south,east,north) for viewport search or lat/lng/radius for license coverage',
                },
                { status: 400 },
            );
        }

        let markers = await fetchGoogleCriticalInfraMarkers(requestedSectors, scope);
        if (isSuperAdminNationwideView(role)) {
            markers = filterLatLngInUsa(markers);
        }

        return NextResponse.json({
            markers,
            demo: false,
            scope: scope.mode,
            source: 'google_places',
        });
    } catch (error) {
        console.error('critical-infrastructure error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!CI_ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = (await req.json()) as {
            sectors?: string[];
            bounds?: unknown;
            lat?: number;
            lng?: number;
            radius?: number;
        };

        const requestedSectors = (body.sectors?.length
            ? body.sectors
            : CRITICAL_INFRASTRUCTURE_SECTORS.map((s) => s.id)) as CriticalInfraSectorId[];

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );

        if (demoCtx) {
            const markers = DEMO_CRITICAL_INFRA_MARKERS.filter((m) =>
                requestedSectors.includes(m.sectorId),
            );
            return NextResponse.json({ markers, demo: true, source: 'demo' });
        }

        const scope = resolveSearchScope({
            bounds: (() => {
                const parsed = parseMapBounds(body.bounds);
                if (!parsed) return parsed;
                if (isSuperAdminNationwideView(role)) {
                    return clampBoundsToUsa(parsed);
                }
                return parsed;
            })(),
            lat: body.lat,
            lng: body.lng,
            radius: body.radius,
        });

        if (!scope) {
            if (isSuperAdminNationwideView(role)) {
                return NextResponse.json({
                    markers: [],
                    demo: false,
                    scope: 'bounds',
                    source: 'google_places',
                });
            }
            return NextResponse.json(
                { error: 'bounds or lat/lng/radius required' },
                { status: 400 },
            );
        }

        let markers = await fetchGoogleCriticalInfraMarkers(requestedSectors, scope);
        if (isSuperAdminNationwideView(role)) {
            markers = filterLatLngInUsa(markers);
        }

        return NextResponse.json({
            markers,
            demo: false,
            scope: scope.mode,
            source: 'google_places',
        });
    } catch (error) {
        console.error('critical-infrastructure POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
