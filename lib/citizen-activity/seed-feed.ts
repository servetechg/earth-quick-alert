import type { CitizenActivityItem } from '@/lib/citizen-activity/types'

/** Dashboard preview — matches sub-admin dashboard widget mockup. */
export const CITIZEN_ACTIVITY_PREVIEW_IDS = [
    'seed-help-1',
    'seed-shelter-1',
    'seed-power-1',
    'seed-medical-1',
] as const

function atToday(hour: number, minute: number): { timestamp: string; displayTime: string } {
    const d = new Date()
    d.setHours(hour, minute, 0, 0)
    return {
        timestamp: d.toISOString(),
        displayTime: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    }
}

/** Seed + extended demo rows for jurisdictions without live citizen reports yet. */
export function buildSeedCitizenActivityItems(stateLabel = 'Pine Bluff, AR'): CitizenActivityItem[] {
    const t945 = atToday(9, 45)
    const t920 = atToday(9, 20)
    const t858 = atToday(8, 58)
    const t831 = atToday(8, 31)
    const t810 = atToday(8, 10)
    const t745 = atToday(7, 45)
    const t712 = atToday(7, 12)
    const t648 = atToday(6, 48)

    return [
        {
            id: 'seed-help-1',
            category: 'help_request',
            title: 'Help Request',
            line1: 'High Water on Street',
            line2: stateLabel,
            location: stateLabel,
            ...t945,
            priority: 'critical',
            status: 'Open',
            source: 'citizen',
        },
        {
            id: 'seed-shelter-1',
            category: 'shelter_checkin',
            title: 'Shelter Check-In',
            line1: 'Pine Bluff High School',
            line2: '120 People',
            location: stateLabel,
            ...t945,
            priority: 'normal',
            status: 'Active',
            source: 'system',
        },
        {
            id: 'seed-power-1',
            category: 'power_outage',
            title: 'Power Outage',
            line1: '102 Customers Affected',
            location: stateLabel,
            ...t945,
            priority: 'high',
            status: 'Monitoring',
            source: 'system',
        },
        {
            id: 'seed-medical-1',
            category: 'medical_assistance',
            title: 'Medical Assistance',
            line1: 'E. Harding Ave, Pine Bluff',
            location: stateLabel,
            ...t945,
            priority: 'critical',
            status: 'Dispatched',
            source: 'citizen',
        },
        {
            id: 'seed-safe-1',
            category: 'safe_checkin',
            title: 'Safe Check-In',
            line1: 'Maria G. marked safe',
            line2: 'Chenal Valley area',
            location: stateLabel,
            ...t920,
            priority: 'low',
            status: 'Resolved',
            source: 'citizen',
        },
        {
            id: 'seed-water-1',
            category: 'water_rescue',
            title: 'Water Rescue',
            line1: 'Family sheltering in basement',
            line2: 'Water rising — rescue requested',
            location: stateLabel,
            ...t858,
            priority: 'critical',
            status: 'En route',
            source: 'citizen',
        },
        {
            id: 'seed-road-1',
            category: 'road_hazard',
            title: 'Road Hazard',
            line1: 'Downed trees blocking Hwy 365',
            line2: 'Multiple lanes closed',
            location: stateLabel,
            ...t831,
            priority: 'high',
            status: 'Active',
            source: 'citizen',
        },
        {
            id: 'seed-supply-1',
            category: 'supply_request',
            title: 'Supply Request',
            line1: 'Insulin & prescription pickup',
            line2: 'Elderly household — no transport',
            location: stateLabel,
            ...t810,
            priority: 'high',
            status: 'Open',
            source: 'citizen',
        },
        {
            id: 'seed-damage-1',
            category: 'damage_report',
            title: 'Damage Report',
            line1: 'Roof collapse — residential',
            line2: 'Welfare check requested',
            location: stateLabel,
            ...t745,
            priority: 'high',
            status: 'Active',
            source: 'citizen',
        },
        {
            id: 'seed-evac-1',
            category: 'evacuation',
            title: 'Evacuation Update',
            line1: 'Zone B voluntary evacuation',
            line2: 'Shelter transport available',
            location: stateLabel,
            ...t712,
            priority: 'normal',
            status: 'Advisory',
            source: 'system',
        },
        {
            id: 'seed-volunteer-1',
            category: 'volunteer',
            title: 'Volunteer Sign-Up',
            line1: '12 new volunteers registered',
            line2: 'Disaster distribution center',
            location: stateLabel,
            ...t648,
            priority: 'low',
            status: 'Active',
            source: 'responder',
        },
        {
            id: 'seed-missing-1',
            category: 'missing_person',
            title: 'Missing Person',
            line1: 'Last seen near community shelter',
            line2: 'Family requesting status update',
            location: stateLabel,
            ...t648,
            priority: 'critical',
            status: 'Open',
            source: 'citizen',
        },
    ]
}
