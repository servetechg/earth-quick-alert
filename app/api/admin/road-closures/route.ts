import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import { getSession } from '@/lib/auth'
import {
    boundsFromStateCode,
    intersectBounds,
    type InfrastructureSearchScope,
    type MapBounds,
} from '@/lib/gis/infrastructure-search-grid'
import {
    resolveSubAdminJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction'
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps'
import { maybeDemoJurisdictionOverride } from '@/lib/demo/provider'
import { fetchRoadClosures } from '@/lib/gis/road-closures-service'

export const maxDuration = 60

function parseBounds(raw: unknown): MapBounds | null {
    if (!raw || typeof raw !== 'object') return null
    const b = raw as Record<string, unknown>
    const west = Number(b.west)
    const south = Number(b.south)
    const east = Number(b.east)
    const north = Number(b.north)
    if (
        !Number.isFinite(west) ||
        !Number.isFinite(south) ||
        !Number.isFinite(east) ||
        !Number.isFinite(north)
    ) {
        return null
    }
    if (east <= west || north <= south) return null
    return { west, south, east, north }
}

function resolveSuperAdminScope(
    scopeState: string | undefined,
    bounds: MapBounds | null,
): InfrastructureSearchScope | null {
    const stateCode = scopeState ? normalizeStateToUsps(scopeState) : null

    if (stateCode && !bounds) {
        return { mode: 'state', stateCode }
    }

    if (!bounds) return null

    if (stateCode) {
        const stateBounds = boundsFromStateCode(stateCode)
        if (stateBounds) {
            const clipped = intersectBounds(bounds, stateBounds)
            if (clipped) return { mode: 'bounds', bounds: clipped }
        }
    }
    return { mode: 'bounds', bounds }
}

function resolveSubAdminScope(
    jurisdiction: SubAdminJurisdiction,
): InfrastructureSearchScope | null {
    if (jurisdiction.coverageType === 'radius') {
        return {
            mode: 'radius',
            center: jurisdiction.center,
            radiusMile: jurisdiction.radiusMile,
        }
    }

    if (jurisdiction.stateCode) {
        return { mode: 'state', stateCode: jurisdiction.stateCode }
    }

    return null
}

export async function POST(req: Request) {
    try {
        await connectDB()
        const session = await getSession(req)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const role = String(session.user.role ?? '').toLowerCase()
        if (role !== 'sub-admin' && role !== 'super-admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = (await req.json()) as { scopeState?: string; bounds?: unknown }
        const viewportBounds = parseBounds(body.bounds)
        let scope: InfrastructureSearchScope | null = null

        if (role === 'sub-admin') {
            const demoScope = await maybeDemoJurisdictionOverride(session.user.id as string)
            const jurisdiction =
                demoScope ?? (await resolveSubAdminJurisdiction(session.user.id as string))

            if (!jurisdiction) {
                return NextResponse.json({ error: 'Jurisdiction not found' }, { status: 404 })
            }

            scope = resolveSubAdminScope(jurisdiction)
        } else {
            scope = resolveSuperAdminScope(body.scopeState?.trim() || undefined, viewportBounds)
        }

        if (!scope) {
            return NextResponse.json(
                { error: 'Could not resolve search scope for license' },
                { status: 400 },
            )
        }

        const { closures, sources, fetchedAt, warning } = await fetchRoadClosures(scope)

        return NextResponse.json({
            closures,
            count: closures.length,
            sources,
            fetchedAt,
            scope: scope.mode,
            ...(warning ? { warning } : {}),
        })
    } catch (error) {
        console.error('road-closures error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
