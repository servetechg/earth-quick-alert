import type { CitizenActivityItem } from '@/lib/citizen-activity/types'

export type CitizenActivityResolutionStatus = 'pending' | 'completed'

export interface CitizenActivityDisplayRow extends CitizenActivityItem {
    citizenName: string
    citizenAddress: string
    takeAction: string
    resolutionStatus: CitizenActivityResolutionStatus
}

const COMPLETED_STATUS_KEYWORDS = [
    'resolved',
    'completed',
    'complete',
    'safe',
    'closed',
    'delivered',
]

function isCompletedStatus(status?: string): boolean {
    if (!status) return false
    const normalized = status.trim().toLowerCase()
    return COMPLETED_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

function inferCitizenName(item: CitizenActivityItem): string {
    if (item.citizenName?.trim()) return item.citizenName.trim()
    const line1 = item.line1.trim()
    if (/marked safe/i.test(line1)) {
        const match = line1.match(/^(.+?)\s+marked safe/i)
        if (match?.[1]) return match[1].trim()
    }
    if (/family of/i.test(line1)) return line1
    if (line1.length <= 40 && /^[A-Za-z][A-Za-z.'\s-]+$/.test(line1) && !/customers|people|volunteers|zone/i.test(line1)) {
        return line1
    }
    if (item.source === 'citizen') return 'Citizen report'
    return 'Operations feed'
}

function inferAddress(item: CitizenActivityItem): string {
    return item.citizenAddress?.trim() || item.line2?.trim() || item.location?.trim() || item.line1.trim() || 'Address not provided'
}

function buildTakeActionFallback(item: CitizenActivityItem): string {
    const name = inferCitizenName(item)
    const address = inferAddress(item)

    switch (item.category) {
        case 'help_request':
        case 'water_rescue':
            return `${name} requested help at ${address}. Ready2Go is reviewing the report, dispatching the appropriate crew, and will update the citizen when assistance is confirmed.`
        case 'medical_assistance':
            return `${name} reported a medical need at ${address}. Ready2Go is coordinating EMS response and keeping the citizen informed until care arrives.`
        case 'road_hazard':
            return `${name} reported a road hazard at ${address}. Ready2Go is routing infrastructure crews and publishing safety guidance for nearby travelers.`
        case 'supply_request':
            return `${name} needs supplies at ${address}. Ready2Go is matching the request with logistics volunteers and delivery partners.`
        case 'damage_report':
            return `${name} reported property damage at ${address}. Ready2Go dispatched assessment teams and logged follow-up welfare checks.`
        case 'missing_person':
            return `${name} submitted a missing-person update for ${address}. Ready2Go search coordinators are tracing last-known location details.`
        case 'safe_checkin':
        case 'shelter_checkin':
            return `${name} checked in from ${address}. Ready2Go recorded the status and closed the immediate follow-up queue.`
        case 'power_outage':
            return `Infrastructure alert for ${address}. Ready2Go notified utility partners and is tracking restoration for affected citizens.`
        case 'evacuation':
            return `Evacuation activity near ${address}. Ready2Go issued guidance and coordinated shelter transport options.`
        default:
            return `${name} — ${item.title} at ${address}. Ready2Go teams are monitoring this activity and will take action as needed.`
    }
}

export function enrichCitizenActivityItem(item: CitizenActivityItem): CitizenActivityDisplayRow {
    const resolutionStatus: CitizenActivityResolutionStatus =
        item.resolutionStatus ??
        (isCompletedStatus(item.status) ? 'completed' : 'pending')

    return {
        ...item,
        citizenName: inferCitizenName(item),
        citizenAddress: inferAddress(item),
        takeAction: item.takeAction?.trim() || buildTakeActionFallback(item),
        resolutionStatus,
    }
}

export function enrichCitizenActivityItems(items: CitizenActivityItem[]): CitizenActivityDisplayRow[] {
    return items.map(enrichCitizenActivityItem)
}
