import { getResponderDashboardKind, type ResponderDashboardKind } from '@/lib/responder-verticals';
import {
    getHospitalCapacity,
    getPoliceDeployment,
    getHotelAvailability,
    recomputeHospitalSummary,
} from './store';
import type { GeneralResponderSummary } from './types';

export * from './types';
export {
    getHospitalCapacity,
    setHospitalCapacity,
    getPoliceDeployment,
    setPoliceDeployment,
    getHotelAvailability,
    setHotelAvailability,
    recomputeHospitalSummary,
} from './store';

export function dashboardKindForUser(vertical: string): ResponderDashboardKind {
    return getResponderDashboardKind(vertical || '');
}

export function getGeneralResponderSummary(
    vertical: string,
    responderFunction: string,
    displayName: string,
): GeneralResponderSummary {
    const org =
        responderFunction?.trim() ||
        (displayName?.trim() && !displayName.includes('@') ? displayName.trim() : '') ||
        'Your organization';
    return {
        title: `${org} — responder portal`,
        message:
            'You are on the general responder dashboard. Ask your administrator to assign a specific vertical (hospital, police, hotel) for tailored tools. Until then, use shared links below.',
        checklist: [
            { id: 'c1', label: 'Verify alert notification settings', done: false },
            { id: 'c2', label: 'Confirm staging channel with EOC', done: false },
            { id: 'c3', label: 'Post resource status in GIS if assigned', done: false },
        ],
        links: [
            { label: 'Alerts & communication', href: '/alerts-communication' },
            { label: 'GIS & mapping', href: '/gis-mapping' },
            { label: 'Emergency plans', href: '/emergency-plan' },
        ],
    };
}

export function getResponderDashboardBundle(vertical: string, responderFunction: string, displayName: string) {
    const kind = dashboardKindForUser(vertical);
    return {
        kind,
        vertical,
        responderFunction: responderFunction || '',
        hospital: kind === 'hospital' ? getHospitalCapacity() : null,
        police: kind === 'police' ? getPoliceDeployment() : null,
        hotel: kind === 'hotel' ? getHotelAvailability() : null,
        general: kind === 'general' ? getGeneralResponderSummary(vertical, responderFunction, displayName) : null,
    };
}
