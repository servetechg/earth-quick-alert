import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';
import type { HifldNextSectorDef } from '@/lib/gis/hifld-next/types';

function nuclearFilter(props: Record<string, unknown>): boolean {
    const blob = JSON.stringify(props).toUpperCase();
    return blob.includes('NUCLEAR') || blob.includes('URANIUM');
}

/** HIFLD Next dataset mapping per CISA sector (national GeoJSON ingest). */
export const HIFLD_NEXT_SECTOR_DEFS: HifldNextSectorDef[] = [
    {
        sectorId: 'ci_chemical',
        datasets: [
            {
                slug: 'epa-emergency-response-rmp-facilities',
                idPrefix: 'rmp',
                titleFields: ['PRIMARY_NAME', 'FACILITY_NAME', 'NAME'],
                stateFields: ['STATE_CODE', 'STATE', 'STALP', 'ST'],
                latFields: ['LATITUDE83', 'LATITUDE', 'LAT', 'Y'],
                lngFields: ['LONGITUDE83', 'LONGITUDE', 'LON', 'LONG', 'X'],
                idFields: ['REGISTRY_ID', 'PGM_SYS_ID', 'OBJECTID', 'FID'],
                cityFields: ['CITY_NAME', 'CITY', 'CWP_CITY'],
                addressFields: ['LOCATION_ADDRESS', 'ADDRESS', 'LOC_ADDRESS'],
                zipFields: ['POSTAL_CODE', 'ZIP', 'ZIPCODE'],
                statusFields: ['ACTIVE_STATUS', 'INTEREST_TYPE', 'PGM_SYS_ACRNM', 'STATUS'],
            },
            {
                slug: 'epa-superfund-enterprise-management-system-sems-sites-1',
                idPrefix: 'sems',
                titleFields: ['PRIMARY_NAME', 'FACILITY_NAME', 'NAME'],
                stateFields: ['STATE_CODE', 'STATE', 'STALP', 'ST'],
                latFields: ['LATITUDE83', 'LATITUDE', 'LAT', 'Y'],
                lngFields: ['LONGITUDE83', 'LONGITUDE', 'LON', 'LONG', 'X'],
                idFields: ['REGISTRY_ID', 'PGM_SYS_ID', 'OBJECTID', 'FID'],
                cityFields: ['CITY_NAME', 'CITY', 'CWP_CITY'],
                addressFields: ['LOCATION_ADDRESS', 'ADDRESS', 'LOC_ADDRESS'],
                zipFields: ['POSTAL_CODE', 'ZIP', 'ZIPCODE'],
                statusFields: ['ACTIVE_STATUS', 'INTEREST_TYPE', 'PGM_SYS_ACRNM', 'STATUS'],
            },
        ],
    },
    {
        sectorId: 'ci_healthcare',
        datasets: [
            {
                slug: 'hospitals-3',
                idPrefix: 'hospital',
                titleFields: ['NAME', 'HOSPITAL_NAME', 'FACILITY_NAME'],
            },
        ],
    },
    {
        sectorId: 'ci_emergency_services',
        datasets: [
            {
                slug: 'fire-and-emergency-medical-service-ems-stations',
                idPrefix: 'ems',
                titleFields: ['NAME', 'EMSNAME', 'FACILITY_NAME'],
            },
            {
                slug: 'local-law-enforcement-locations',
                idPrefix: 'le',
                titleFields: ['NAME', 'AGENCY', 'FACILITY_NAME'],
            },
        ],
    },
    {
        sectorId: 'ci_energy',
        datasets: [
            {
                slug: 'power-plants-1',
                idPrefix: 'power',
                titleFields: ['NAME', 'PLANT_NAME', 'PLANTNAME', 'FACILITY_NAME'],
            },
            {
                slug: 'natural-gas-processing-plants-1',
                idPrefix: 'ngproc',
                titleFields: ['NAME', 'PLANT_NAME', 'FACILITY_NAME'],
            },
        ],
    },
    {
        sectorId: 'ci_nuclear',
        datasets: [
            {
                slug: 'power-plants-1',
                idPrefix: 'nuclear',
                titleFields: ['NAME', 'PLANT_NAME', 'PLANTNAME', 'FACILITY_NAME'],
                includeFeature: nuclearFilter,
            },
        ],
    },
    {
        sectorId: 'ci_defense',
        datasets: [
            {
                slug: 'mirta-dod-sites-points',
                idPrefix: 'dod',
                titleFields: ['siteName', 'featureName', 'SITE_NAME', 'NAME', 'BASE_NAME', 'FACILITY_NAME'],
                stateFields: ['stateNameCode', 'STATE', 'STALP', 'STATE_CODE', 'ST'],
                idFields: ['installationId', 'sdsId', 'OBJECTID', 'FID'],
            },
        ],
    },
    {
        sectorId: 'ci_transportation',
        datasets: [
            {
                slug: 'aviation-facilities',
                idPrefix: 'airport',
                titleFields: ['NAME', 'ARPT_NAME', 'FACILITY_NAME'],
            },
            {
                slug: 'intermodal-passenger-connectivity-database-ipcd',
                idPrefix: 'ipcd',
                titleFields: ['FAC_NAME', 'NAME', 'STATION_NAME'],
                stateFields: ['STATE', 'STALP', 'STATE_CODE', 'ST'],
                latFields: ['LATITUDE', 'POINT_LAT', 'LAT'],
                lngFields: ['LONGITUDE', 'POINT_LON', 'LON'],
                idFields: ['FAC_ID', 'OBJECTID', 'FID'],
            },
            {
                slug: 'principal-ports',
                idPrefix: 'port',
                titleFields: ['NAME', 'PORT_NAME', 'FACILITY_NAME'],
            },
        ],
    },
    {
        sectorId: 'ci_water',
        datasets: [
            {
                slug: 'epa-frs-icis-wastewater-treatment-plants',
                idPrefix: 'wwtp',
                titleFields: ['CWP_NAME', 'NAME', 'FACILITY_NAME', 'PRIMARY_NAME'],
            },
        ],
    },
    {
        sectorId: 'ci_manufacturing',
        datasets: [
            {
                slug: 'epa-frs-toxic-release-inventory',
                idPrefix: 'tri',
                titleFields: ['PRIMARY_NAME', 'FACILITY_NAME', 'NAME'],
                latFields: ['LATITUDE83', 'LATITUDE', 'LAT', 'FAC_LAT'],
                lngFields: ['LONGITUDE83', 'LONGITUDE', 'LONG', 'LON', 'FAC_LONG'],
            },
        ],
    },
    {
        sectorId: 'ci_communications',
        datasets: [
            {
                slug: 'cellular-towers',
                idPrefix: 'cell',
                titleFields: ['Licensee', 'Callsign', 'NAME', 'LICENSEE', 'CALLSIGN'],
                stateFields: ['LocState', 'STATE', 'STALP', 'STATE_CODE', 'ST'],
                latFields: ['latdec', 'LATITUDE', 'LAT', 'Y'],
                lngFields: ['londec', 'LONGITUDE', 'LON', 'LONG', 'X'],
                cityFields: ['LocCity', 'CITY', 'CITY_NAME'],
                addressFields: ['LocAdd', 'ADDRESS', 'LOCATION_ADDRESS'],
                compoundIdFields: ['UniqSysID', 'LocNum', 'FID'],
                idFields: ['UniqSysID', 'FID', 'OBJECTID', 'ID'],
            },
        ],
    },
];

const sectorDefById = new Map(HIFLD_NEXT_SECTOR_DEFS.map((d) => [d.sectorId, d]));

export function hifldNextSectorDef(sectorId: CriticalInfraSectorId): HifldNextSectorDef | undefined {
    return sectorDefById.get(sectorId);
}

export const HIFLD_NEXT_SECTOR_IDS: CriticalInfraSectorId[] = HIFLD_NEXT_SECTOR_DEFS.map((d) => d.sectorId);
