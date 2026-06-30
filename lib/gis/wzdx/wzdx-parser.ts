import type { RoadClosureSegment, RoadClosureStatus } from '@/lib/gis/road-closure-types'
import type { WzdxFeedConfig } from '@/lib/gis/wzdx/wzdx-feed-config'

type LatLng = { lat: number; lng: number }

function geoJsonToPaths(geometry: unknown): LatLng[][] {
    if (!geometry || typeof geometry !== 'object') return []
    const g = geometry as { type?: string; coordinates?: unknown }
    const toLatLng = (pt: number[]) => ({ lat: pt[1], lng: pt[0] })

    if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
        const path = (g.coordinates as number[][])
            .filter((pt) => pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
            .map(toLatLng)
        return path.length >= 2 ? [path] : []
    }

    if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
        return (g.coordinates as number[][][])
            .map((line) =>
                line
                    .filter((pt) => pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
                    .map(toLatLng),
            )
            .filter((line) => line.length >= 2)
    }

    if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) {
        const ring = (g.coordinates[0] as number[][])
            .filter((pt) => pt.length >= 2)
            .map(toLatLng)
        if (ring.length < 2) return []
        const open =
            ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng
                ? ring.slice(0, -1)
                : ring
        return open.length >= 2 ? [open] : []
    }

    if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
        const lat = g.coordinates[1] as number
        const lng = g.coordinates[0] as number
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
        const d = 0.003
        return [
            [
                { lat: lat - d, lng },
                { lat: lat + d, lng },
            ],
        ]
    }

    if (g.type === 'MultiPoint' && Array.isArray(g.coordinates)) {
        const points = (g.coordinates as number[][])
            .filter((pt) => pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
            .map(toLatLng)
        if (points.length >= 2) return [points]
        if (points.length === 1) {
            const p = points[0]
            const d = 0.003
            return [
                [
                    { lat: p.lat - d, lng: p.lng },
                    { lat: p.lat + d, lng: p.lng },
                ],
            ]
        }
    }

    return []
}

function normalizeWzdxStatus(props: Record<string, unknown>, description: string): RoadClosureStatus {
    const impact = String(props.vehicle_impact ?? '').toLowerCase()
    if (impact === 'all-lanes-closed') return 'Closed'
    if (impact === 'some-lanes-closed') return 'Lane Closure'
    if (
        impact === 'alternating-flow' ||
        impact === 'detour' ||
        impact === 'reduced-width' ||
        impact === 'reduced-speed'
    ) {
        return 'Restricted'
    }

    const lanes = props.lanes
    if (Array.isArray(lanes) && lanes.length > 0) {
        const laneStatuses = lanes
            .map((lane) =>
                lane && typeof lane === 'object'
                    ? String((lane as Record<string, unknown>).status ?? '').toLowerCase()
                    : '',
            )
            .filter(Boolean)
        if (laneStatuses.length > 0) {
            if (laneStatuses.every((s) => s === 'closed')) return 'Closed'
            if (laneStatuses.some((s) => s === 'closed')) return 'Lane Closure'
            if (laneStatuses.some((s) => s === 'open' || s === 'mixed')) return 'Restricted'
        }
    }

    const text = `${description} ${impact}`.toLowerCase()
    if (/all lanes closed|road closed|fully closed|impassable/.test(text)) return 'Closed'
    if (/lane closed|lanes closed|right lane|left lane|shoulder/.test(text)) return 'Lane Closure'
    if (/restrict|detour|width limit|speed restriction|reduced/.test(text)) return 'Restricted'
    return 'Unknown'
}

function readCoreDetails(props: Record<string, unknown>): Record<string, unknown> {
    const core = props.core_details
    return core && typeof core === 'object' ? (core as Record<string, unknown>) : {}
}

function parseWzdxTimestamp(raw: unknown): number | null {
    if (raw == null || raw === '') return null
    const ms = Date.parse(String(raw))
    return Number.isFinite(ms) ? ms : null
}

/** True when the work zone is active at `now` per WZDX start_date / end_date on properties or core_details. */
function isWzdxWorkZoneActiveNow(
    props: Record<string, unknown>,
    core: Record<string, unknown>,
    now: Date = new Date(),
): boolean {
    const nowMs = now.getTime()
    const startMs = parseWzdxTimestamp(props.start_date ?? core.start_date)
    const endMs = parseWzdxTimestamp(props.end_date ?? core.end_date)

    if (endMs != null && endMs < nowMs) return false
    if (startMs != null && startMs > nowMs) return false
    return true
}

function shouldIncludeWorkZone(
    props: Record<string, unknown>,
    description: string,
): boolean {
    const impact = String(props.vehicle_impact ?? '').toLowerCase()
    const text = description.toLowerCase()

    if (impact === 'all-lanes-open') {
        return /lane closed|lanes closed|road closed|closure|restrict|detour|impassable/.test(text)
    }

    return true
}

export function parseWzdxFeatureCollection(
    payload: unknown,
    feed: WzdxFeedConfig,
): RoadClosureSegment[] {
    const now = new Date()
    if (!payload || typeof payload !== 'object') return []
    const root = payload as { features?: unknown[]; type?: string }
    const features = Array.isArray(root.features) ? root.features : []
    const out: RoadClosureSegment[] = []
    const seen = new Set<string>()

    for (const feature of features) {
        if (!feature || typeof feature !== 'object') continue
        const f = feature as {
            id?: string | number
            geometry?: unknown
            properties?: Record<string, unknown>
        }
        const props = f.properties ?? {}
        const core = readCoreDetails(props)
        if (!isWzdxWorkZoneActiveNow(props, core, now)) continue

        const eventType = String(core.event_type ?? 'work-zone').toLowerCase()
        if (eventType && !/work-zone|detour|restriction|incident|lane-closure/.test(eventType)) {
            continue
        }

        const paths = geoJsonToPaths(f.geometry)
        if (paths.length === 0) continue

        const roadNames = Array.isArray(core.road_names)
            ? core.road_names.map((n) => String(n).trim()).filter(Boolean)
            : []
        const description = String(core.description ?? core.name ?? '').trim()
        if (!shouldIncludeWorkZone(props, description)) continue

        const roadName =
            roadNames.join(' / ') ||
            String(core.name ?? '').trim() ||
            description.slice(0, 120) ||
            'Work zone'

        const status = normalizeWzdxStatus(props, description)
        const updatedAt = String(
            core.update_date ?? props.update_date ?? props.end_date ?? new Date().toISOString(),
        )
        const startLocation =
            String(props.beginning_cross_street ?? props.beginning_location ?? '').trim() || undefined
        const endLocation =
            String(props.ending_cross_street ?? props.ending_location ?? '').trim() || undefined
        const reason = description || undefined
        const featureId = String(f.id ?? `${roadName}-${paths[0]?.[0]?.lat}`).slice(0, 80)

        paths.forEach((path, pathIdx) => {
            const id = `wzdx-${feed.feedId}-${featureId}-${pathIdx}`.slice(0, 120)
            if (seen.has(id)) return
            seen.add(id)
            out.push({
                id,
                roadName: roadName.slice(0, 120),
                status,
                reason: reason?.slice(0, 280),
                startLocation,
                endLocation,
                updatedAt,
                source: `WZDX (${feed.label})`,
                path,
            })
        })
    }

    return out
}
