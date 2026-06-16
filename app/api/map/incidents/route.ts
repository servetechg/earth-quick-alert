import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import { getSession } from '@/lib/auth'
import { boundsFromQuery, parseMapBounds } from '@/lib/gis/map-api-bounds'
import {
  fetchIncidentsAsGeoFeatures,
  incidentsToGeoJson,
  resolveIncidentTypesFromFilter,
} from '@/lib/gis/incidents-geojson'
import {
  clampBoundsToUsa,
  isSuperAdminNationwideView,
  pointInUsaBounds,
} from '@/lib/constants/usa-map-bounds'

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin'])

export const maxDuration = 60

/**
 * Track C — MongoDB IncidentReport records wrapped as GeoJSON.
 * GET /api/map/incidents?filter=power
 */
export async function GET(req: Request) {
  try {
    await connectDB()
    const session = await getSession(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = String(session.user.role ?? '').toLowerCase()
    if (!MAP_ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const filter = url.searchParams.get('filter') ?? url.searchParams.get('type') ?? 'all'
    const types = resolveIncidentTypesFromFilter(filter)
    let bounds = boundsFromQuery(url)
    if (isSuperAdminNationwideView(role) && bounds) {
      bounds = clampBoundsToUsa(bounds)
    }
    const limit = Number(url.searchParams.get('limit')) || 200
    const format = url.searchParams.get('format')?.toLowerCase() || 'geojson'

    let incidents = await fetchIncidentsAsGeoFeatures({ types, bounds, limit })
    if (isSuperAdminNationwideView(role)) {
      incidents = incidents.filter(
        (inc) =>
          Number.isFinite(inc.lat) &&
          Number.isFinite(inc.lng) &&
          pointInUsaBounds(inc.lat as number, inc.lng as number),
      )
    }

    if (format === 'markers') {
      return NextResponse.json({
        incidents,
        count: incidents.length,
        filter,
        source: 'mongodb_incident_report',
      })
    }

    return NextResponse.json({
      ...incidentsToGeoJson(incidents),
      meta: {
        count: incidents.length,
        filter,
        source: 'mongodb_incident_report',
      },
    })
  } catch (error) {
    console.error('map/incidents error:', error)
    return NextResponse.json({ error: 'Failed to fetch incidents' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await connectDB()
    const session = await getSession(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = String(session.user.role ?? '').toLowerCase()
    if (!MAP_ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as {
      filter?: string
      types?: string[]
      bounds?: unknown
      limit?: number
      format?: string
    }

    const filter = body.filter ?? 'all'
    const types = body.types?.length ? body.types : resolveIncidentTypesFromFilter(filter)
    let bounds = parseMapBounds(body.bounds)
    if (isSuperAdminNationwideView(role) && bounds) {
      bounds = clampBoundsToUsa(bounds)
    }
    const limit = Number(body.limit) || 200
    const format = body.format?.toLowerCase() || 'geojson'

    let incidents = await fetchIncidentsAsGeoFeatures({ types, bounds, limit })
    if (isSuperAdminNationwideView(role)) {
      incidents = incidents.filter(
        (inc) =>
          Number.isFinite(inc.lat) &&
          Number.isFinite(inc.lng) &&
          pointInUsaBounds(inc.lat as number, inc.lng as number),
      )
    }

    if (format === 'markers') {
      return NextResponse.json({
        incidents,
        count: incidents.length,
        filter,
        source: 'mongodb_incident_report',
      })
    }

    return NextResponse.json({
      ...incidentsToGeoJson(incidents),
      meta: {
        count: incidents.length,
        filter,
        source: 'mongodb_incident_report',
      },
    })
  } catch (error) {
    console.error('map/incidents POST error:', error)
    return NextResponse.json({ error: 'Failed to fetch incidents' }, { status: 500 })
  }
}
