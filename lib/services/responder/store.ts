import type { HotelAvailabilityPayload } from './types';

/** Dev/demo in-memory persistence (per server process) for hotel responder until a DB layer is added. */
let hotel: HotelAvailabilityPayload | null = null;

export function getHotelAvailability(): HotelAvailabilityPayload {
    if (!hotel) {
        hotel = {
            propertyId: 'default-hotel',
            propertyName: 'Unnamed Hotel',
            updatedAt: new Date().toISOString(),
            source: 'api',
            roomsTotal: 0,
            roomsOccupied: 0,
            roomsHeldForEm: 0,
            adaRoomsAvailable: 0,
            checkInNotes: '',
        };
    }
    return hotel;
}

export function setHotelAvailability(next: HotelAvailabilityPayload): HotelAvailabilityPayload {
    hotel = next;
    return hotel;
}

import type { PublicOfficialSummaryPayload } from './types';

let publicOfficial: PublicOfficialSummaryPayload | null = null;

export function getPublicOfficialSummary(): PublicOfficialSummaryPayload {
    if (!publicOfficial) {
        publicOfficial = {
            jurisdictionId: 'po-city-1',
            jurisdictionName: 'City of Metropolis',
            updatedAt: new Date().toISOString(),
            source: 'mock',
            executiveNotes: 'Monitoring developing severe weather situation. All departments on standby.',
            eoc: {
                level: '2-partial',
                operatingCondition: 'Monitoring Severe Weather',
                personnelActive: 12,
            },
            declarations: [
                {
                    id: 'decl-001',
                    title: 'Mayoral Emergency Declaration',
                    jurisdiction: 'City of Metropolis',
                    status: 'active',
                    issuedAt: new Date(Date.now() - 86400000).toISOString(),
                    notes: 'Activates emergency procurement powers and mutual aid.',
                },
            ],
        };
    }
    return publicOfficial;
}

import type { FederalResourceDeploymentPayload } from './types';

let federalPayload: FederalResourceDeploymentPayload | null = null;

export function getFederalResourceDeployment(): FederalResourceDeploymentPayload {
    if (!federalPayload) {
        federalPayload = {
            jurisdictionName: 'FEMA Region IX',
            updatedAt: new Date().toISOString(),
            source: 'mock',
            totalPersonnelDeployed: 1250,
            stagingAreas: [
                {
                    id: 'fed-stage-1',
                    location: 'Metropolis Expo Center',
                    personnelCount: 450,
                    vehicleCount: 85,
                    status: 'active',
                    notes: 'Primary staging for urban search and rescue teams.',
                },
                {
                    id: 'fed-stage-2',
                    location: 'State Fairgrounds',
                    personnelCount: 800,
                    vehicleCount: 210,
                    status: 'standby',
                    notes: 'Logistics and supply staging area.',
                },
            ],
        };
    }
    return federalPayload;
}

export function setFederalResourceDeployment(next: FederalResourceDeploymentPayload): FederalResourceDeploymentPayload {
    federalPayload = next;
    return federalPayload;
}
