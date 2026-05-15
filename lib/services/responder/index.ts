import { getResponderDashboardKind, type ResponderDashboardKind } from '@/lib/responder-verticals';
import { getHotelAvailability } from './store';
import type { GeneralResponderSummary } from './types';
import { getHospitalCapacityForUser } from './hospital-capacity-db';
import { getPoliceDeploymentForUser } from './police-deployment-db';
import { getPharmacyResourceDeploymentForUser } from './pharmacy-resource-db';
import { getTransitResourceDeploymentForUser } from './transit-resource-db';

export * from './types';
export { recomputeHospitalSummary } from './hospital-summary';
export { getHotelAvailability, setHotelAvailability } from './store';
export { getHospitalCapacityForUser, mergeHospitalCapacityForUser, normalizeHospitalUnitsFromPartial } from './hospital-capacity-db';
export { getPoliceDeploymentForUser, mergePoliceDeploymentForUser } from './police-deployment-db';
export {
    getPharmacyResourceDeploymentForUser,
    mergePharmacyResourceDeploymentForUser,
} from './pharmacy-resource-db';
export {
    getTransitResourceDeploymentForUser,
    mergeTransitResourceDeploymentForUser,
} from './transit-resource-db';

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
            'You are on the general responder dashboard. Ask your administrator to assign a specific vertical (hospital, police, hotel, pharmacy, transit) for tailored tools. Until then, use shared links below.',
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

export async function getResponderDashboardBundle(
    vertical: string,
    responderFunction: string,
    displayName: string,
    userId: string,
    licenseId?: string | null,
) {
    const fn = responderFunction || '';
    const lic = licenseId ?? null;
    const kind = dashboardKindForUser(vertical);
    return {
        kind,
        vertical,
        responderFunction: fn,
        hospital: kind === 'hospital' ? await getHospitalCapacityForUser(userId, lic) : null,
        police: kind === 'police' ? await getPoliceDeploymentForUser(userId, lic, fn) : null,
        hotel: kind === 'hotel' ? getHotelAvailability() : null,
        pharmacy: kind === 'pharmacy' ? await getPharmacyResourceDeploymentForUser(userId, lic, fn) : null,
        transit: kind === 'transit' ? await getTransitResourceDeploymentForUser(userId, lic, fn) : null,
        general: kind === 'general' ? getGeneralResponderSummary(vertical, responderFunction, displayName) : null,
    };
}
