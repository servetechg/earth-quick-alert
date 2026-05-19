import { getResponderDashboardKind, type ResponderDashboardKind } from '@/lib/responder-verticals';
import { getHotelAvailability } from './store';
import type { GeneralResponderSummary } from './types';
import { getHospitalCapacityForUser } from './hospital-capacity-db';
import { getPoliceDeploymentForUser } from './police-deployment-db';
import { getPharmacyResourceDeploymentForUser } from './pharmacy-resource-db';
import { getTransitResourceDeploymentForUser } from './transit-resource-db';
import { getEnergyResourceDeploymentForUser } from './energy-resource-db';
import { getGasResourceDeploymentForUser } from './gas-resource-db';
import { getElectricResourceDeploymentForUser } from './electric-resource-db';
import { getWaterResourceDeploymentForUser } from './water-resource-db';
import { getFoodLogisticsResourceDeploymentForUser } from './food-logistics-resource-db';
import { getNationalGuardResourceDeploymentForUser } from './national-guard-resource-db';
import {
    getFederalResourceDeploymentForUser,
    mergeFederalResourceDeploymentForUser,
} from './federal-deployment-db';

export * from './types';
export { recomputeHospitalSummary } from './hospital-summary';
export {
    getHotelAvailability,
    setHotelAvailability,
    getPublicOfficialSummary,
    getMedicalLogisticsPayload,
    setMedicalLogisticsPayload,
} from './store';
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
export {
    getEnergyResourceDeploymentForUser,
    mergeEnergyResourceDeploymentForUser,
} from './energy-resource-db';
export { getGasResourceDeploymentForUser, mergeGasResourceDeploymentForUser } from './gas-resource-db';
export {
    getElectricResourceDeploymentForUser,
    mergeElectricResourceDeploymentForUser,
} from './electric-resource-db';
export {
    getWaterResourceDeploymentForUser,
    mergeWaterResourceDeploymentForUser,
} from './water-resource-db';
export {
    getFoodLogisticsResourceDeploymentForUser,
    mergeFoodLogisticsResourceDeploymentForUser,
} from './food-logistics-resource-db';
export {
    getNationalGuardResourceDeploymentForUser,
    mergeNationalGuardResourceDeploymentForUser,
} from './national-guard-resource-db';
export {
    getFederalResourceDeploymentForUser,
    mergeFederalResourceDeploymentForUser,
} from './federal-deployment-db';

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
            'You are on the general responder dashboard. Ask your administrator to assign a specific vertical (hospital, police, hotel, pharmacy, transit, utilities, food logistics, National Guard) for tailored tools. Until then, use shared links below.',
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
        federal: kind === 'federal' ? await getFederalResourceDeploymentForUser(userId, lic, fn) : null,
        energy: kind === 'energy' ? await getEnergyResourceDeploymentForUser(userId, lic, fn) : null,
        gas: kind === 'gas' ? await getGasResourceDeploymentForUser(userId, lic, fn) : null,
        electric: kind === 'electric' ? await getElectricResourceDeploymentForUser(userId, lic, fn) : null,
        water: kind === 'water' ? await getWaterResourceDeploymentForUser(userId, lic, fn) : null,
        foodLogistics:
            kind === 'food-logistics' ? await getFoodLogisticsResourceDeploymentForUser(userId, lic, fn) : null,
        nationalGuard:
            kind === 'national-guard' ? await getNationalGuardResourceDeploymentForUser(userId, lic, fn) : null,
        general: kind === 'general' ? getGeneralResponderSummary(vertical, responderFunction, displayName) : null,
    };
}
