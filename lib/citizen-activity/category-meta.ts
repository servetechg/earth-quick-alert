import type { CitizenActivityCategory, CitizenActivityFilter } from '@/lib/citizen-activity/types'

export type CategoryMeta = {
    label: string
    icon: string
    tileColor: string
    filter: CitizenActivityFilter
}

export const CITIZEN_ACTIVITY_CATEGORY_META: Record<CitizenActivityCategory, CategoryMeta> = {
    help_request: {
        label: 'Help Request',
        icon: '/icons/help-request.svg',
        tileColor: '#D74C30',
        filter: 'help',
    },
    shelter_checkin: {
        label: 'Shelter Check-In',
        icon: '/icons/shelters.svg',
        tileColor: '#22A04C',
        filter: 'safety',
    },
    power_outage: {
        label: 'Power Outage',
        icon: '/icons/power-crews.svg',
        tileColor: '#E5A436',
        filter: 'infrastructure',
    },
    medical_assistance: {
        label: 'Medical Assistance',
        icon: '/icons/hospital-beds.svg',
        tileColor: '#D74C30',
        filter: 'medical',
    },
    safe_checkin: {
        label: 'Safe Check-In',
        icon: '/icons/help-request.svg',
        tileColor: '#22A04C',
        filter: 'safety',
    },
    supply_request: {
        label: 'Supply Request',
        icon: '/icons/meals-ready.svg',
        tileColor: '#E5A436',
        filter: 'help',
    },
    evacuation: {
        label: 'Evacuation Update',
        icon: '/icons/shelters.svg',
        tileColor: '#2563EB',
        filter: 'safety',
    },
    road_hazard: {
        label: 'Road Hazard',
        icon: '/icons/water-crews.svg',
        tileColor: '#E5A436',
        filter: 'infrastructure',
    },
    damage_report: {
        label: 'Damage Report',
        icon: '/icons/emergency-service-marker.svg',
        tileColor: '#64748B',
        filter: 'help',
    },
    water_rescue: {
        label: 'Water Rescue',
        icon: '/icons/water-crews.svg',
        tileColor: '#2563EB',
        filter: 'help',
    },
    volunteer: {
        label: 'Volunteer Sign-Up',
        icon: '/icons/personnel.svg',
        tileColor: '#7C3AED',
        filter: 'safety',
    },
    missing_person: {
        label: 'Missing Person',
        icon: '/icons/help-request.svg',
        tileColor: '#D74C30',
        filter: 'help',
    },
}

export const CITIZEN_ACTIVITY_FILTER_LABELS: Record<CitizenActivityFilter, string> = {
    all: 'All activity',
    help: 'Help & requests',
    safety: 'Safety & shelter',
    infrastructure: 'Infrastructure',
    medical: 'Medical',
}

export function categoryMatchesFilter(
    category: CitizenActivityCategory,
    filter: CitizenActivityFilter,
): boolean {
    if (filter === 'all') return true
    return CITIZEN_ACTIVITY_CATEGORY_META[category].filter === filter
}
