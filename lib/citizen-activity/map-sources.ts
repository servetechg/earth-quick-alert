import type { IIncidentReport } from '@/models/IncidentReport'
import type { CitizenActivityCategory, CitizenActivityItem } from '@/lib/citizen-activity/types'
import { CITIZEN_ACTIVITY_CATEGORY_META } from '@/lib/citizen-activity/category-meta'

function formatDisplayTime(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function incidentCategory(type: string): CitizenActivityCategory {
    switch (type) {
        case 'Power Outage':
            return 'power_outage'
        case 'Road Closure':
        case 'Downed Tree':
            return 'road_hazard'
        case 'Water Main Leak':
            return 'water_rescue'
        default:
            return 'damage_report'
    }
}

function incidentPriority(type: string, status: string): CitizenActivityItem['priority'] {
    if (type === 'Power Outage' || status === 'Active') return 'high'
    if (status === 'Crew Dispatched' || status === 'Crew En Route') return 'high'
    return 'normal'
}

/** Legacy citizen incident reports (Mongo `IncidentReport` collection). */
export function mapIncidentReportToActivity(
    doc: IIncidentReport & { _id?: { toString(): string } },
): CitizenActivityItem {
    const created = doc.createdAt ? new Date(doc.createdAt) : new Date()
    const category = incidentCategory(doc.type)
    return {
        id: doc._id?.toString() ?? `incident-${doc.location}`,
        category,
        title: CITIZEN_ACTIVITY_CATEGORY_META[category].label,
        line1: doc.description?.trim() || doc.type,
        line2: doc.location,
        location: doc.location,
        timestamp: created.toISOString(),
        displayTime: formatDisplayTime(created),
        priority: incidentPriority(doc.type, doc.status),
        status: doc.status,
        source: doc.source === 'End User' ? 'citizen' : 'system',
    }
}

export function mergeActivityItems(...groups: CitizenActivityItem[][]): CitizenActivityItem[] {
    const byId = new Map<string, CitizenActivityItem>()
    for (const group of groups) {
        for (const item of group) {
            if (!byId.has(item.id)) byId.set(item.id, item)
        }
    }
    return [...byId.values()].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
}
