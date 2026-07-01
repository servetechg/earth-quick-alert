import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import IncidentReport from '@/models/IncidentReport'
import User from '@/models/User'
import { getSession } from '@/lib/auth'
import { getSubAdminTextLocationFilter } from '@/lib/admin-filters'
import { resolveDemoSessionContext } from '@/lib/demo/provider'
import type { CitizenActivityFilter } from '@/lib/citizen-activity/types'
import {
    buildActivityStats,
    buildDefaultFeed,
    filterActivityItems,
    getPreviewIds,
    mapDemoCitizenToActivity,
    mapIncidentReportToActivity,
    mergeActivityItems,
} from '@/lib/citizen-activity/map-sources'
import { DEMO_CITIZEN_MARKERS } from '@/lib/demo/data/little-rock-tornado-2023'

const ALLOWED_ROLES = new Set([
    'super-admin',
    'admin',
    'sub-admin',
    'observer',
    'manager',
    'eoc-manager',
    'eoc-observer',
])

export async function GET(request: NextRequest) {
    try {
        await connectDB()

        const session = await getSession()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const role = String(session.user.role ?? '').toLowerCase()
        if (!ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { searchParams } = request.nextUrl
        const filter = (searchParams.get('filter') ?? 'all') as CitizenActivityFilter
        const query = searchParams.get('q') ?? ''
        const limitRaw = Number.parseInt(searchParams.get('limit') ?? '100', 10)
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100
        const previewOnly = searchParams.get('preview') === '1'

        const userId = session.user.id as string
        let stateLabel = 'your jurisdiction'

        const profile = await User.findById(userId).select('city state').lean()
        if (profile?.city || profile?.state) {
            stateLabel = [profile.city, profile.state].filter(Boolean).join(', ')
        }

        const demoCtx = await resolveDemoSessionContext(userId, session.user.email as string)
        const incidentQuery: Record<string, unknown> = {}
        if (role === 'sub-admin') {
            const incFilter = await getSubAdminTextLocationFilter(userId, 'location')
            if (incFilter) incidentQuery.$and = [incFilter]
        }

        const incidentDocs = await IncidentReport.find(incidentQuery)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean()

        const fromIncidents = incidentDocs.map((doc) =>
            mapIncidentReportToActivity(doc as Parameters<typeof mapIncidentReportToActivity>[0]),
        )

        const fromDemo =
            demoCtx && role === 'sub-admin'
                ? DEMO_CITIZEN_MARKERS.map((marker, index) => mapDemoCitizenToActivity(marker, index))
                : []

        const seed = buildDefaultFeed(stateLabel || undefined)
        let items = mergeActivityItems(fromIncidents, fromDemo, seed)

        if (previewOnly) {
            const previewSet = new Set(getPreviewIds())
            items = items.filter((item) => previewSet.has(item.id))
            if (items.length === 0) {
                items = seed.filter((item) => previewSet.has(item.id))
            }
        }

        items = filterActivityItems(items, filter, query).slice(0, limit)
        const stats = buildActivityStats(
            mergeActivityItems(fromIncidents, fromDemo, seed).slice(0, 200),
        )

        return NextResponse.json({
            items,
            stats,
            previewIds: getPreviewIds(),
        })
    } catch (error) {
        console.error('[citizen-activity] GET failed:', error)
        return NextResponse.json({ error: 'Failed to load citizen activity feed' }, { status: 500 })
    }
}
