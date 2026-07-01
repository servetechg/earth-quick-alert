import type { IIncidentReport } from '@/models/IncidentReport'
import type { CitizenActivityCategory, CitizenActivityItem, CitizenActivityStats } from '@/lib/citizen-activity/types'
import { DEMO_CITIZEN_MARKERS } from '@/lib/demo/data/little-rock-tornado-2023'
import {
    buildSeedCitizenActivityItems,
    CITIZEN_ACTIVITY_PREVIEW_IDS,
} from '@/lib/citizen-activity/seed-feed'
import { categoryMatchesFilter, CITIZEN_ACTIVITY_CATEGORY_META } from '@/lib/citizen-activity/category-meta'

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

export function mapIncidentReportToActivity(doc: IIncidentReport & { _id?: { toString(): string } }): CitizenActivityItem {
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

export function mapDemoCitizenToActivity(
    marker: (typeof DEMO_CITIZEN_MARKERS)[number],
    index: number,
): CitizenActivityItem {
    const minutesAgo = 15 + index * 11
    const created = new Date(Date.now() - minutesAgo * 60_000)
    const category: CitizenActivityCategory = marker.isSafe
        ? 'safe_checkin'
        : marker.description.toLowerCase().includes('medical') ||
            marker.description.toLowerCase().includes('insulin')
          ? 'medical_assistance'
          : marker.description.toLowerCase().includes('water')
            ? 'water_rescue'
            : 'help_request'

    return {
        id: marker.id,
        category,
        title: marker.isSafe ? 'Safe Check-In' : 'Help Request',
        line1: marker.title,
        line2: marker.description,
        location: marker.location,
        timestamp: created.toISOString(),
        displayTime: formatDisplayTime(created),
        priority: marker.isSafe ? 'low' : 'critical',
        status: marker.isSafe ? 'Safe' : 'Open',
        source: 'citizen',
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

export function buildActivityStats(items: CitizenActivityItem[]): CitizenActivityStats {
    return {
        helpRequests: items.filter((i) =>
            ['help_request', 'water_rescue', 'supply_request', 'damage_report', 'missing_person'].includes(
                i.category,
            ),
        ).length,
        safeCheckIns: items.filter((i) =>
            ['safe_checkin', 'shelter_checkin', 'volunteer'].includes(i.category),
        ).length,
        infrastructureAlerts: items.filter((i) =>
            ['power_outage', 'road_hazard', 'evacuation'].includes(i.category),
        ).length,
        medicalAssistance: items.filter((i) => i.category === 'medical_assistance').length,
        total: items.length,
    }
}

export function filterActivityItems(
    items: CitizenActivityItem[],
    filter: string,
    query: string,
): CitizenActivityItem[] {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
        if (filter !== 'all' && !categoryMatchesFilter(item.category, filter as never)) {
            return false
        }
        if (!q) return true
        const blob = [item.title, item.line1, item.line2, item.location, item.status]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
        return blob.includes(q)
    })
}

export function buildDefaultFeed(stateLabel?: string): CitizenActivityItem[] {
    return buildSeedCitizenActivityItems(stateLabel)
}

export function getPreviewIds(): string[] {
    return [...CITIZEN_ACTIVITY_PREVIEW_IDS]
}
