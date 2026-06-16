import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch';
import {
    boundsFromStateCode,
    intersectBounds,
    type InfrastructureSearchScope,
    type MapBounds,
} from '@/lib/gis/infrastructure-search-grid';
import {
    resolveSubAdminJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import {
    clampBoundsToUsa,
    filterLatLngInUsa,
    isSuperAdminNationwideView,
} from '@/lib/constants/usa-map-bounds';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import { maybeDemoJurisdictionOverride } from '@/lib/demo/provider';
import { resolveEnabledFilterLayers } from '@/lib/gis/gis-filter-layers';
import { fetchAllFilterLayerPlaces } from '@/lib/gis/license-resource-sites-fetch';
import User from '@/models/User';

export const maxDuration = 120;

function parseBounds(raw: unknown): MapBounds | null {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;
    const west = Number(b.west);
    const south = Number(b.south);
    const east = Number(b.east);
    const north = Number(b.north);
    if (
        !Number.isFinite(west) ||
        !Number.isFinite(south) ||
        !Number.isFinite(east) ||
        !Number.isFinite(north)
    ) {
        return null;
    }
    if (east <= west || north <= south) return null;
    return { west, south, east, north };
}

function resolveSuperAdminScope(
    scopeState: string | undefined,
    bounds: MapBounds | null,
    nationwideUsaOnly: boolean,
): InfrastructureSearchScope | null {
    if (!bounds) return null;

    let effectiveBounds = bounds;
    if (nationwideUsaOnly) {
        const clipped = clampBoundsToUsa(bounds);
        if (!clipped) return null;
        effectiveBounds = clipped;
    }

    if (scopeState) {
        const stateCode = normalizeStateToUsps(scopeState);
        if (stateCode) {
            const stateBounds = boundsFromStateCode(stateCode);
            if (stateBounds) {
                const clipped = intersectBounds(effectiveBounds, stateBounds);
                if (clipped) return { mode: 'bounds', bounds: clipped };
            }
        }
    }
    return { mode: 'bounds', bounds: effectiveBounds };
}

function resolveSubAdminScope(
    jurisdiction: SubAdminJurisdiction,
): InfrastructureSearchScope | null {
    if (jurisdiction.coverageType === 'radius') {
        return {
            mode: 'radius',
            center: jurisdiction.center,
            radiusMile: jurisdiction.radiusMile,
        };
    }

    if (jurisdiction.stateCode) {
        return { mode: 'state', stateCode: jurisdiction.stateCode };
    }

    return null;
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (role !== 'sub-admin' && role !== 'super-admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = (await req.json()) as {
            layers?: string[];
            types?: string[];
            scopeState?: string;
            bounds?: unknown;
        };

        const layerIds = (body.layers?.length ? body.layers : body.types ?? [])
            .map((t) => String(t).trim())
            .filter(Boolean);

        const layers = resolveEnabledFilterLayers(layerIds);

        if (layers.length === 0) {
            return NextResponse.json({ error: 'No valid filter layers' }, { status: 400 });
        }

        const viewportBounds = parseBounds(body.bounds);
        let scope: InfrastructureSearchScope | null = null;
        let jurisdiction: SubAdminJurisdiction | null = null;
        let licenseId: string | null = null;

        if (role === 'sub-admin') {
            const demoScope = await maybeDemoJurisdictionOverride(session.user.id as string);
            jurisdiction =
                demoScope ?? (await resolveSubAdminJurisdiction(session.user.id as string));

            if (!jurisdiction) {
                return NextResponse.json({ error: 'Jurisdiction not found' }, { status: 404 });
            }

            scope = resolveSubAdminScope(jurisdiction);

            const user = (await User.findById(session.user.id).select('licenseId').lean()) as {
                licenseId?: { toString(): string } | null;
            } | null;
            licenseId = user?.licenseId ? String(user.licenseId) : null;
        } else {
            scope = resolveSuperAdminScope(
                body.scopeState?.trim() || undefined,
                viewportBounds,
                isSuperAdminNationwideView(role, body.scopeState),
            );
        }

        if (!scope) {
            if (isSuperAdminNationwideView(role)) {
                return NextResponse.json({ results: [], count: 0, source: 'google_places_and_deployments' });
            }
            return NextResponse.json(
                { error: 'Could not resolve search scope for license' },
                { status: 400 },
            );
        }

        const rawResults: InfrastructurePlaceResult[] = await fetchAllFilterLayerPlaces(
            scope,
            layers,
            { viewportBounds, licenseId, jurisdiction },
        );
        const results = isSuperAdminNationwideView(role, body.scopeState)
            ? filterLatLngInUsa(rawResults)
            : rawResults;

        return NextResponse.json({
            results,
            count: results.length,
            source: 'google_places_and_deployments',
            ranked: scope.mode === 'bounds' ? 'viewport' : 'comprehensive',
            scope: scope.mode,
            coverage:
                scope.mode === 'state'
                    ? 'state_license'
                    : scope.mode === 'radius'
                      ? 'radius_license'
                      : 'viewport',
        });
    } catch (error) {
        console.error('infrastructure-places error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
