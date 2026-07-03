import type { CitizenActivityItem } from '@/lib/citizen-activity/types'

export type CitizenActivityResolutionStatus = 'completed' | 'pending'

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

const DISPLAY_OVERRIDES: Record<
    string,
    Pick<CitizenActivityDisplayRow, 'citizenName' | 'citizenAddress' | 'takeAction' | 'resolutionStatus'>
> = {
    'seed-help-1': {
        citizenName: 'Nouman',
        citizenAddress: 'Street 2, Phoenix, Arizona',
        takeAction:
            'Nouman reported high water and a blocked road near his home. Ready2Go dispatched a water-rescue crew and coordinated with public works to clear the route. Transport to a safe staging area is in progress.',
        resolutionStatus: 'pending',
    },
    'seed-medical-1': {
        citizenName: 'Elena R.',
        citizenAddress: 'E. Harding Ave, Pine Bluff, AR',
        takeAction:
            'Elena requested medical assistance after a fall during the outage. Ready2Go routed EMS, confirmed vitals with the citizen, and arranged hospital transport. Care team stayed on line until responders arrived.',
        resolutionStatus: 'completed',
    },
    'seed-safe-1': {
        citizenName: 'Maria G.',
        citizenAddress: 'Chenal Valley area, Little Rock, AR',
        takeAction:
            'Maria marked herself safe after sheltering in place. Ready2Go logged the check-in, updated the household status in the command feed, and closed the welfare follow-up.',
        resolutionStatus: 'completed',
    },
    'seed-water-1': {
        citizenName: 'James & Priya K.',
        citizenAddress: 'Basement unit, Oak Street, Pine Bluff, AR',
        takeAction:
            'Family reported rising water in the basement. Ready2Go activated water-rescue units, guided them to higher ground, and coordinated evacuation transport to the nearest shelter.',
        resolutionStatus: 'pending',
    },
    'seed-road-1': {
        citizenName: 'David M.',
        citizenAddress: 'Hwy 365 near mile marker 12, Pine Bluff, AR',
        takeAction:
            'David reported downed trees blocking multiple lanes. Ready2Go alerted DOT crews, posted a road hazard advisory, and dispatched a debris-clearance team to restore access.',
        resolutionStatus: 'pending',
    },
    'seed-supply-1': {
        citizenName: 'Helen W.',
        citizenAddress: 'Ridgeway Dr, Pine Bluff, AR',
        takeAction:
            'Elderly household needed insulin and prescriptions with no transport. Ready2Go coordinated pharmacy pickup and volunteer delivery to the residence.',
        resolutionStatus: 'pending',
    },
    'seed-damage-1': {
        citizenName: 'Robert T.',
        citizenAddress: 'Willow Creek Ln, Pine Bluff, AR',
        takeAction:
            'Robert reported roof collapse and requested a welfare check. Ready2Go dispatched structural assessment and EMS standby; family was relocated to a temporary shelter.',
        resolutionStatus: 'completed',
    },
    'seed-shelter-1': {
        citizenName: 'Shelter coordinator',
        citizenAddress: 'Pine Bluff High School, Pine Bluff, AR',
        takeAction:
            'Shelter check-in recorded 120 arrivals. Ready2Go updated capacity, meals, and medical triage slots for the site operations team.',
        resolutionStatus: 'completed',
    },
    'seed-power-1': {
        citizenName: 'Utility liaison',
        citizenAddress: 'Pine Bluff service area, AR',
        takeAction:
            'Power outage affecting 102 customers logged. Ready2Go notified the utility EOC, mapped affected households, and queued restoration updates for citizen alerts.',
        resolutionStatus: 'pending',
    },
    'seed-evac-1': {
        citizenName: 'Zone B residents',
        citizenAddress: 'Voluntary evacuation zone B, Pine Bluff, AR',
        takeAction:
            'Voluntary evacuation advisory issued. Ready2Go activated shelter transport routes and pushed multilingual notifications to households in Zone B.',
        resolutionStatus: 'pending',
    },
    'seed-volunteer-1': {
        citizenName: 'Volunteer desk',
        citizenAddress: 'Disaster distribution center, Pine Bluff, AR',
        takeAction:
            '12 new volunteers registered for distribution support. Ready2Go assigned shift leads and updated the volunteer deployment roster.',
        resolutionStatus: 'completed',
    },
    'seed-missing-1': {
        citizenName: 'Family of A. Reyes',
        citizenAddress: 'Near community shelter, Pine Bluff, AR',
        takeAction:
            'Missing-person report filed near the shelter. Ready2Go opened a tracing ticket, shared last-known details with search teams, and is coordinating reunification.',
        resolutionStatus: 'pending',
    },
}

function isCompletedStatus(status?: string): boolean {
    if (!status) return false
    const normalized = status.trim().toLowerCase()
    return COMPLETED_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

function inferCitizenName(item: CitizenActivityItem): string {
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
    return item.line2?.trim() || item.location?.trim() || item.line1.trim() || 'Address not provided'
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
    const override = DISPLAY_OVERRIDES[item.id]
    if (override) {
        return { ...item, ...override }
    }

    const resolutionStatus: CitizenActivityResolutionStatus = isCompletedStatus(item.status)
        ? 'completed'
        : 'pending'

    return {
        ...item,
        citizenName: inferCitizenName(item),
        citizenAddress: inferAddress(item),
        takeAction: buildTakeActionFallback(item),
        resolutionStatus,
    }
}

export function enrichCitizenActivityItems(items: CitizenActivityItem[]): CitizenActivityDisplayRow[] {
    return items.map(enrichCitizenActivityItem)
}
