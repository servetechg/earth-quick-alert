import type {
    AfterActionInsight,
    AfterActionPerformanceMetric,
    AfterActionReviewData,
    AfterActionTimelineColor,
    AfterActionTimelineEvent,
} from '@/lib/types/after-action-review'

type TimelineSource = {
    issuedAt?: string | Date
    name?: string
    description?: string
    severity?: string
    type?: string
    category?: string
    status?: string
}

function formatEventTime(value?: string | Date, timeZone = 'America/Chicago'): string {
    if (!value) return '—'
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone,
        timeZoneName: 'short',
    })
}

function formatDurationMinutes(start?: string | Date, end?: string | Date): string {
    if (!start || !end) return '—'
    const a = new Date(start)
    const b = new Date(end)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '—'
    const mins = Math.max(1, Math.round((b.getTime() - a.getTime()) / 60_000))
    if (mins < 60) return `${mins}m`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function classifyTimelineEvent(row: TimelineSource): { color: AfterActionTimelineColor; type: string } {
    const blob = `${row.name ?? ''} ${row.description ?? ''} ${row.type ?? ''}`.toLowerCase()
    const severity = String(row.severity ?? '').toLowerCase()

    if (
        blob.includes('tornado emergency') ||
        blob.includes('tornado warning') ||
        blob.includes('ef-3') ||
        blob.includes('ef-') ||
        severity === 'extreme'
    ) {
        return { color: 'red', type: 'Critical' }
    }
    if (
        blob.includes('tornado watch') ||
        blob.includes('spc') ||
        blob.includes('responder') ||
        blob.includes('deployed') ||
        blob.includes('engine') ||
        blob.includes('ems') ||
        blob.includes('sar')
    ) {
        return { color: 'blue', type: 'Action' }
    }
    if (
        blob.includes('citizen') ||
        blob.includes('help') ||
        blob.includes('shelter') ||
        blob.includes('verified') ||
        blob.includes('mass casualty')
    ) {
        return { color: 'green', type: 'Verified' }
    }
    if (blob.includes('curfew') || blob.includes('recovery') || blob.includes('insurance')) {
        return { color: 'purple', type: 'Recovery' }
    }
    return { color: 'blue', type: 'System Update' }
}

export function mapRowsToTimelineEvents(rows: TimelineSource[]): AfterActionTimelineEvent[] {
    const sorted = [...rows].sort((a, b) => {
        const ta = new Date(a.issuedAt ?? 0).getTime()
        const tb = new Date(b.issuedAt ?? 0).getTime()
        return ta - tb
    })

    return sorted.map((row, index) => {
        const { color, type } = classifyTimelineEvent(row)
        return {
            id: index + 1,
            time: formatEventTime(row.issuedAt),
            type,
            title: row.name ?? 'Operational update',
            description: row.description ?? '',
            color,
        }
    })
}

function mapOpenAiInsights(
    insights: Array<{ id: string; category: string; description: string; status?: string }>,
): AfterActionInsight[] {
    return insights.map((insight, index) => {
        let category = insight.category
        if (index === 0) category = 'Summary'
        else if (insight.status === 'Addressed' || index === 1) category = 'What Went Well'
        else category = 'Areas for Improvement'

        return {
            ...insight,
            category,
            status: insight.status === 'Addressed' ? 'Addressed' : 'Pending',
            time: formatEventTime(new Date(Date.now() - index * 5 * 60_000)),
        }
    })
}

export function buildAfterActionFromEmergencyEvent(
    incident: {
        _id: { toString(): string }
        type: string
        title?: string
        createdAt: string | Date
        updatedAt: string | Date
        resolvedAt?: string | Date
        location?: { address?: string }
        timeline?: Array<{ timestamp: string | Date; description: string }>
    },
    aiInsights: Array<{ id: string; category: string; description: string; status?: string }>,
    counts: {
        incidentReports: number
        highSeverityAlerts: number
        timelineEvents: number
    },
): AfterActionReviewData {
    const start = incident.createdAt
    const end = incident.resolvedAt ?? incident.updatedAt
    const location = incident.location?.address ?? 'Unknown Area'
    const typeLabel = formatIncidentTypeLabel(incident.type)

    const timelineFromDb = (incident.timeline ?? []).map((t) => ({
        issuedAt: t.timestamp,
        name: t.description.length > 60 ? `${t.description.slice(0, 60)}…` : t.description,
        description: t.description,
        severity: 'moderate',
        type: 'update',
    }))

    const events = mapRowsToTimelineEvents(timelineFromDb)

    const insights = mapOpenAiInsights(aiInsights)
    const reportRate = counts.incidentReports > 0 ? Math.min(98, 70 + counts.incidentReports * 2) : 72

    return {
        id: incident._id.toString(),
        name: incident.title ? `${incident.title}` : `${typeLabel} — ${location}`,
        type: typeLabel,
        duration: formatDurationMinutes(start, end),
        durationDetail: `${formatEventTime(start)} – ${formatEventTime(end)}`,
        insights: insights.length,
        events,
        aiInsights: insights,
        performanceIndicators: buildLivePerformanceMetrics(counts, reportRate),
        strategicEnhancements: buildLiveStrategicEnhancements(incident.type, counts),
        metadata: {
            location,
            issuedAt: new Date(start).toISOString(),
            resolvedAt: new Date(end).toISOString(),
            citizenReports: counts.incidentReports,
            nwsProducts: counts.highSeverityAlerts,
        },
    }
}

export function buildAfterActionFromUnifiedEvents(
    events: TimelineSource[],
    aiInsights: Array<{ id: string; category: string; description: string; status?: string }>,
    context: {
        id: string
        name: string
        type: string
        location: string
        issuedAt: string
        resolvedAt: string
        citizenReports: number
        responderDeployments: number
    },
): AfterActionReviewData {
    const timelineEvents = mapRowsToTimelineEvents(events)
    const insights = mapOpenAiInsights(aiInsights)
    const alertCount = events.length
    const reportRate = context.citizenReports > 0 ? Math.min(96, 68 + context.citizenReports * 4) : 75

    return {
        id: context.id,
        name: context.name,
        type: context.type,
        duration: formatDurationMinutes(context.issuedAt, context.resolvedAt),
        durationDetail: `${formatEventTime(context.issuedAt)} – ${formatEventTime(context.resolvedAt)}`,
        insights: insights.length,
        events: timelineEvents,
        aiInsights: insights,
        performanceIndicators: [
            {
                label: 'Alert Products Issued',
                val: String(alertCount),
                status: alertCount >= 5 ? 'optimal' : 'nominal',
                percent: Math.min(100, alertCount * 8),
            },
            {
                label: 'Citizen Reports Logged',
                val: String(context.citizenReports),
                status: context.citizenReports >= 3 ? 'optimal' : 'nominal',
                percent: Math.min(100, context.citizenReports * 12),
            },
            {
                label: 'Responder Units Deployed',
                val: String(context.responderDeployments),
                status: context.responderDeployments >= 4 ? 'optimal' : 'nominal',
                percent: Math.min(100, context.responderDeployments * 14),
            },
        ],
        strategicEnhancements: buildLiveStrategicEnhancements(context.type, {
            incidentReports: context.citizenReports,
            highSeverityAlerts: alertCount,
            timelineEvents: timelineEvents.length,
        }),
        metadata: {
            location: context.location,
            issuedAt: context.issuedAt,
            resolvedAt: context.resolvedAt,
            citizenReports: context.citizenReports,
            responderDeployments: context.responderDeployments,
            nwsProducts: alertCount,
        },
    }
}

function formatIncidentTypeLabel(type: string): string {
    const t = type.toLowerCase()
    if (t === 'tornado') return 'Tornado Event'
    if (t === 'flood') return 'Flood Event'
    if (t === 'wildfire') return 'Wildfire Event'
    if (t === 'hurricane') return 'Hurricane Event'
    if (t === 'earthquake') return 'Earthquake Event'
    if (t === 'severe-weather') return 'Severe Weather Event'
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ') + ' Event'
}

function buildLivePerformanceMetrics(
    counts: { incidentReports: number; highSeverityAlerts: number; timelineEvents: number },
    reportRate: number,
): AfterActionPerformanceMetric[] {
    return [
        {
            label: 'Citizen Report Capture',
            val: `${reportRate}%`,
            status: reportRate >= 85 ? 'optimal' : 'nominal',
            percent: reportRate,
        },
        {
            label: 'High-Severity Alerts',
            val: String(counts.highSeverityAlerts),
            status: counts.highSeverityAlerts > 0 ? 'optimal' : 'nominal',
            percent: Math.min(100, counts.highSeverityAlerts * 15),
        },
        {
            label: 'Timeline Events Recorded',
            val: String(counts.timelineEvents),
            status: counts.timelineEvents >= 3 ? 'optimal' : 'nominal',
            percent: Math.min(100, counts.timelineEvents * 10),
        },
    ]
}

function buildLiveStrategicEnhancements(
    incidentType: string,
    counts: { incidentReports: number; highSeverityAlerts: number; timelineEvents: number },
): string[] {
    const type = incidentType.toLowerCase()
    const items: string[] = []

    if (type.includes('tornado') || type.includes('severe')) {
        items.push('Pre-position mobile EOC assets along historical supercell corridors before SPC High Risk days.')
        items.push('Expand shelter-in-place push cadence during Tornado Watch lead time (30–45 min pre-warning).')
    }
    if (type.includes('flood')) {
        items.push('Integrate hydrological gauge thresholds into automated citizen messaging earlier in event escalation.')
    }
    if (counts.incidentReports < 5) {
        items.push('Increase post-alert citizen check-in prompts to improve field verification density.')
    }
    if (counts.timelineEvents < 5) {
        items.push('Automate EOC timeline logging from NWS products and responder status changes.')
    }
    items.push('Conduct cross-jurisdiction after-action tabletop within 72 hours of incident resolution.')

    return items.slice(0, 4)
}
