import type { HotelAvailabilityPayload } from './types';

/** In-memory persistence (per server process) for hotel responder until a DB layer is added. */
let hotel: HotelAvailabilityPayload | null = null;

function emptyHotelAvailability(): HotelAvailabilityPayload {
    return {
        propertyId: '',
        propertyName: '',
        updatedAt: new Date().toISOString(),
        source: 'api',
        roomsTotal: 0,
        roomsOccupied: 0,
        roomsHeldForEm: 0,
        adaRoomsAvailable: 0,
    };
}

export function getHotelAvailability(): HotelAvailabilityPayload {
    if (!hotel) hotel = emptyHotelAvailability();
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

import type { MedicalLogisticsResourceDeploymentPayload } from './types';

let medicalLogistics: MedicalLogisticsResourceDeploymentPayload | null = null;

export function getMedicalLogisticsPayload(): MedicalLogisticsResourceDeploymentPayload {
    if (!medicalLogistics) {
        medicalLogistics = {
            networkId: 'med-logistics-hq',
            networkName: 'Medical Logistics Headquarters',
            updatedAt: new Date().toISOString(),
            source: 'mock',
            coordinatorNotes: 'Prioritizing dispatch to shelters and severely impacted hospitals.',
            sites: [
                {
                    id: 'med-001',
                    name: 'Ambulance Unit 7B',
                    address: 'Downtown Metro Station',
                    lat: 40.7128,
                    lng: -74.0060,
                    type: 'ambulance',
                    status: 'active',
                    units: 1,
                    notes: 'Deployed for emergency transport',
                },
                {
                    id: 'med-002',
                    name: 'Central Medical Supply Depot',
                    address: '100 Warehouse Row',
                    lat: 40.7200,
                    lng: -74.0100,
                    type: 'warehouse',
                    status: 'active',
                    units: 5000,
                    notes: 'Operating at full capacity',
                },
                {
                    id: 'med-003',
                    name: 'Route 9 Resupply',
                    address: 'Highway 9 North',
                    lat: 40.7300,
                    lng: -74.0200,
                    type: 'supply-route',
                    status: 'active',
                    units: 0,
                    notes: 'Route clear for heavy vehicles',
                }
            ],
        };
    }
    return medicalLogistics;
}

export function setMedicalLogisticsPayload(next: MedicalLogisticsResourceDeploymentPayload): MedicalLogisticsResourceDeploymentPayload {
    medicalLogistics = next;
    return medicalLogistics;
}
