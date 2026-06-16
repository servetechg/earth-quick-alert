import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import { getSession } from '@/lib/auth'
import { boundsFromQuery, parseMapBounds } from '@/lib/gis/map-api-bounds'
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps'
import {
  fetchNwsActiveAlerts,
  nwsAlertsToGeoJson,
  type NwsAlertCategory,
} from '@/lib/gis/nws-alerts-fetch'
import {
  clampBoundsToUsa,
  isSuperAdminNationwideView,
} from '@/lib/constants/usa-map-bounds'

const MAP_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin'])

export const maxDuration = 60

function resolveAlertCategory(raw: string | null): NwsAlertCategory {
  const key = (raw ?? 'all').trim().toLowerCase()
  if (key === 'flood' || key === 'flood_zones') return 'flood'
  if (key === 'risk' || key === 'risk_areas') return 'risk'
  if (key === 'weather' || key === 'weather_radar') return 'weather'
  return 'all'
}

/**
 * Track B — NWS active weather / flood / risk polygons as GeoJSON.
 * GET /api/map/alerts?category=flood&state=AR
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
    const category = resolveAlertCategory(url.searchParams.get('category') ?? url.searchParams.get('filter'))
    const stateRaw = url.searchParams.get('state') ?? url.searchParams.get('scopeState')
    const stateCode = stateRaw ? normalizeStateToUsps(stateRaw) : null
    let bounds = boundsFromQuery(url)
    if (isSuperAdminNationwideView(role, stateRaw) && bounds) {
      bounds = clampBoundsToUsa(bounds)
    }
    const format = url.searchParams.get('format')?.toLowerCase() || 'geojson'

    const alerts = await fetchNwsActiveAlerts({
      stateCode,
      bounds,
      category,
    })

    if (format === 'features') {
      return NextResponse.json({
        alerts,
        count: alerts.length,
        category,
        source: 'api.weather.gov/alerts/active',
      })
    }

    return NextResponse.json({
      ...nwsAlertsToGeoJson(alerts),
      meta: {
        count: alerts.length,
        category,
        state: stateCode,
        source: 'api.weather.gov/alerts/active',
      },
    })
  } catch (error) {
    console.error('map/alerts error:', error)
    return NextResponse.json({ error: 'Failed to fetch weather alerts' }, { status: 500 })
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
      category?: string
      filter?: string
      scopeState?: string
      state?: string
      bounds?: unknown
      format?: string
    }

    const category = resolveAlertCategory(body.category ?? body.filter ?? 'all')
    const stateRaw = body.scopeState ?? body.state
    const stateCode = stateRaw ? normalizeStateToUsps(stateRaw) : null
    let bounds = parseMapBounds(body.bounds)
    if (isSuperAdminNationwideView(role, stateRaw) && bounds) {
      bounds = clampBoundsToUsa(bounds)
    }
    const format = body.format?.toLowerCase() || 'geojson'

    const alerts = await fetchNwsActiveAlerts({
      stateCode,
      bounds,
      category,
    })

    if (format === 'features') {
      return NextResponse.json({
        alerts,
        count: alerts.length,
        category,
        source: 'api.weather.gov/alerts/active',
      })
    }

    return NextResponse.json({
      ...nwsAlertsToGeoJson(alerts),
      meta: {
        count: alerts.length,
        category,
        state: stateCode,
        source: 'api.weather.gov/alerts/active',
      },
    })
  } catch (error) {
    console.error('map/alerts POST error:', error)
    return NextResponse.json({ error: 'Failed to fetch weather alerts' }, { status: 500 })
  }
}
