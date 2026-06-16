import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import { getSession } from '@/lib/auth'
import { boundsFromQuery, parseMapBounds } from '@/lib/gis/map-api-bounds'
import {
  fetchHifldFilterFeatures,
  hifldFeaturesToGeoJson,
} from '@/lib/gis/fetch-hifld-geojson'
import { resolveInfrastructureFilters } from '@/lib/gis/hifld-infrastructure-sources'

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin'])

export const maxDuration = 60

/**
 * Track A — CISA / HIFLD critical infrastructure as GeoJSON.
 * GET /api/map/infrastructure?filter=dams,chemical,energy&west=…&south=…&east=…&north=…
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
    const filterParam = url.searchParams.get('filter')?.trim() || 'dams'
    const filters = resolveInfrastructureFilters(filterParam)

    if (filters.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid infrastructure filter',
          supported: ['dams', 'chemical', 'energy', 'ci_dams', 'ci_chemical', 'ci_energy'],
        },
        { status: 400 },
      )
    }

    const bounds = boundsFromQuery(url)
    const limit = Number(url.searchParams.get('limit')) || 500
    const format = url.searchParams.get('format')?.toLowerCase() || 'geojson'

    const allFeatures = []
    for (const filterDef of filters) {
      const batch = await fetchHifldFilterFeatures(filterDef.layers, { bounds, limit })
      for (const feature of batch) {
        allFeatures.push({ ...feature, filter: filterDef.id, filterLabel: filterDef.label })
      }
    }

    if (format === 'markers') {
      return NextResponse.json({
        markers: allFeatures,
        count: allFeatures.length,
        filters: filters.map((f) => f.id),
        source: 'hifld_verified',
        bounds,
      })
    }

    return NextResponse.json({
      ...hifldFeaturesToGeoJson(allFeatures),
      meta: {
        count: allFeatures.length,
        filters: filters.map((f) => f.id),
        source: 'hifld_verified',
        bounds,
      },
    })
  } catch (error) {
    console.error('map/infrastructure error:', error)
    return NextResponse.json({ error: 'Failed to fetch infrastructure data' }, { status: 500 })
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
      filters?: string[]
      filter?: string
      bounds?: unknown
      limit?: number
      format?: string
    }

    const filterParam =
      body.filters?.join(',') || body.filter?.trim() || 'dams'
    const filters = resolveInfrastructureFilters(filterParam)
    if (filters.length === 0) {
      return NextResponse.json({ error: 'No valid infrastructure filter' }, { status: 400 })
    }

    const bounds = parseMapBounds(body.bounds) ?? null
    const limit = Number(body.limit) || 500
    const format = body.format?.toLowerCase() || 'geojson'

    const allFeatures = []
    for (const filterDef of filters) {
      const batch = await fetchHifldFilterFeatures(filterDef.layers, { bounds, limit })
      for (const feature of batch) {
        allFeatures.push({ ...feature, filter: filterDef.id, filterLabel: filterDef.label })
      }
    }

    if (format === 'markers') {
      return NextResponse.json({
        markers: allFeatures,
        count: allFeatures.length,
        filters: filters.map((f) => f.id),
        source: 'hifld_verified',
        bounds,
      })
    }

    return NextResponse.json({
      ...hifldFeaturesToGeoJson(allFeatures),
      meta: {
        count: allFeatures.length,
        filters: filters.map((f) => f.id),
        source: 'hifld_verified',
        bounds,
      },
    })
  } catch (error) {
    console.error('map/infrastructure POST error:', error)
    return NextResponse.json({ error: 'Failed to fetch infrastructure data' }, { status: 500 })
  }
}
