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
                latFields: ['LATITUDE83', 'LATITUDE', 'LAT'],
                lngFields: ['LONGITUDE83', 'LONGITUDE', 'LON', 'LONG'],
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
                latFields: ['LATITUDE83', 'LATITUDE', 'LAT'],
                lngFields: ['LONGITUDE83', 'LONGITUDE', 'LON', 'LONG'],
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
                latFields: ['latdec', 'LATITUDE', 'LAT'],
                lngFields: ['londec', 'LONGITUDE', 'LON', 'LONG'],
                cityFields: ['LocCity', 'CITY', 'CITY_NAME'],
                addressFields: ['LocAdd', 'ADDRESS', 'LOCATION_ADDRESS'],
                compoundIdFields: ['UniqSysID', 'LocNum', 'FID'],
                idFields: ['UniqSysID', 'FID', 'OBJECTID', 'ID'],
            },
        ],
    },
    {
        sectorId: 'ci_commercial',
        datasets: [
            {
                slug: 'docks-1',
                idPrefix: 'dock',
                titleFields: ['NAV_UNIT_N', 'FACILITY_T', 'PORT_NAME', 'LOCATION_D', 'NAME'],
                stateFields: ['STATE_POST', 'STATE', 'STALP', 'STATE_CODE', 'ST'],
                latFields: ['LATITUDE', 'LATITUDE1', 'LAT'],
                lngFields: ['LONGITUDE', 'LONGITUDE1', 'LON', 'LONG'],
                cityFields: ['CITY_OR_TO', 'CITY', 'CITY_NAME'],
                addressFields: ['STREET_ADD', 'ADDRESS', 'LOCATION_ADDRESS'],
                zipFields: ['ZIPCODE', 'ZIP', 'ZIP_CODE'],
                idFields: ['FID', 'NAV_UNIT_I', 'UNLOCODE', 'OBJECTID'],
            },
            {
                slug: 'petroleum-product-terminals',
                idPrefix: 'term',
                titleFields: ['NAME', 'COMPANY', 'TERMINAL_NAME', 'SITE'],
                stateFields: ['STATE', 'ST', 'STATE_CODE', 'STALP'],
                latFields: ['Latitude', 'LATITUDE', 'LAT'],
                lngFields: ['Longitude', 'LONGITUDE', 'LON', 'LONG'],
                idFields: ['OBJECTID', 'FID', 'ID'],
            },
            {
                slug: 'public-refrigerated-warehouses-1',
                idPrefix: 'coldstore',
                titleFields: ['activeaccounts_name', 'NAME'],
                stateFromTextFields: ['activeaccounts_name', 'activeaccounts_billingaddress_c'],
                cityFields: ['activeaccounts_billingaddress_c', 'CITY', 'CITY_NAME'],
                idFields: ['objectid', 'OBJECTID', 'FID'],
            },
            {
                slug: 'intermodal-freight-facilities-rail-tofc-cofc',
                idPrefix: 'imrail',
                titleFields: ['TERMINAL', 'NAME', 'FACILITY', 'FACILITY_NAME', 'PORT'],
                stateFields: ['STATE', 'ST', 'STATE_CODE', 'STALP', 'STATEABBR'],
                latFields: ['LATITUDE', 'LAT'],
                lngFields: ['LONGITUDE', 'LON', 'LONG'],
                cityFields: ['CITY', 'CITY_NAME'],
                addressFields: ['TERM_ADDRESS', 'ADDRESS', 'STREET'],
                zipFields: ['ZIP_CODE', 'ZIP', 'ZIPCODE'],
                idFields: ['OBJECTID', 'FID', 'SPLC', 'ID'],
            },
            {
                slug: 'intermodal-freight-facilities-air-to-truck',
                idPrefix: 'imair',
                titleFields: ['FACILITY_C', 'NAME', 'FACILITY', 'FACILITY_NAME', 'LOCID'],
                stateFields: ['STATE', 'ST', 'STATE_CODE', 'STALP', 'STATEABBR'],
                latFields: ['LATITUDE', 'LAT'],
                lngFields: ['LONGITUDE', 'LON', 'LONG'],
                idFields: ['OBJECTID', 'LOCID', 'FID', 'ID'],
            },
        ],
    },
    {
        sectorId: 'ci_food_ag',
        datasets: [
            {
                slug: 'agricultural-minerals-operations',
                idPrefix: 'agmin',
                titleFields: ['SITE_NAME', 'COMPANY_NA', 'COMMODITY', 'NAME'],
                stateFields: ['STATE_LOCA', 'STATE', 'STALP', 'STATE_CODE', 'ST'],
                latFields: ['LATITUDE', 'LAT'],
                lngFields: ['LONGITUDE', 'LON', 'LONG'],
                idFields: ['OBJECTID', 'FID', 'MINOP1X020'],
            },
            {
                slug: 'ethanol-plants-1',
                idPrefix: 'ethanol',
                titleFields: ['Site', 'Company', 'NAME'],
                stateFields: ['State', 'STATE', 'STALP', 'STATE_CODE', 'ST'],
                latFields: ['Latitude', 'LATITUDE', 'LAT'],
                lngFields: ['Longitude', 'LONGITUDE', 'LON', 'LONG'],
                idFields: ['OBJECTID', 'FID'],
            },
            {
                slug: 'biodiesel-plants-1',
                idPrefix: 'biodiesel',
                titleFields: ['Site', 'Company', 'NAME'],
                stateFields: ['State', 'STATE', 'STALP', 'STATE_CODE', 'ST'],
                latFields: ['Latitude', 'LATITUDE', 'LAT'],
                lngFields: ['Longitude', 'LONGITUDE', 'LON', 'LONG'],
                idFields: ['OBJECTID', 'FID'],
            },
            {
                slug: 'public-refrigerated-warehouses-1',
                idPrefix: 'coldstore',
                titleFields: ['activeaccounts_name', 'NAME'],
                stateFromTextFields: ['activeaccounts_name', 'activeaccounts_billingaddress_c'],
                cityFields: ['activeaccounts_billingaddress_c', 'CITY', 'CITY_NAME'],
                idFields: ['objectid', 'OBJECTID', 'FID'],
            },
        ],
    },
    {
        sectorId: 'ci_government',
        datasets: [
            {
                slug: 'gsa-inventory-of-owned-and-leased-properties-iolp-buildings',
                idPrefix: 'gsa',
                titleFields: [
                    'Real_Property_Asset_Name',
                    'Installation_Name',
                    'LOCATION_CODE',
                    'NAME',
                ],
                stateFields: ['STATE_CD', 'STATE', 'STALP', 'STATE_CODE', 'ST'],
                latFields: ['Latitude', 'LATITUDE', 'LAT'],
                lngFields: ['Longitude', 'LONGITUDE', 'LON', 'LONG'],
                cityFields: ['CITY', 'CITY_NAME'],
                addressFields: ['STREET_ADDRESS', 'ADDRESS', 'LOCATION_ADDRESS'],
                zipFields: ['ZIPCODE5', 'ZIP', 'ZIPCODE'],
                statusFields: ['BUILDING_STATUS', 'OWNED_OR_LEASED_INDICATOR', 'STATUS'],
                idFields: ['LOCATION_CODE', 'OBJECTID', 'FID'],
            },
            {
                slug: 'state-capitols-2',
                idPrefix: 'capitol',
                titleFields: ['NAME'],
                stateFields: ['STATE', 'STALP', 'STATE_CODE', 'ST'],
                cityFields: ['CITY', 'CITY_NAME'],
                addressFields: ['ADDRESS', 'ADDRESSBUILDINGNAME'],
                zipFields: ['ZIPCODE', 'ZIP'],
                idFields: ['OBJECTID', 'PERMANENT_IDENTIFIER', 'GNIS_ID', 'FID'],
            },
            {
                slug: 'courthouses-3',
                idPrefix: 'court',
                titleFields: ['NAME'],
                stateFields: ['STATE', 'STALP', 'STATE_CODE', 'ST'],
                cityFields: ['CITY', 'CITY_NAME'],
                addressFields: ['ADDRESS', 'ADDRESSBUILDINGNAME'],
                zipFields: ['ZIPCODE', 'ZIP'],
                idFields: ['OBJECTID', 'PERMANENT_IDENTIFIER', 'GNIS_ID', 'FID'],
            },
            {
                slug: 'gsa-inventory-of-owned-and-leased-properties-iolp-leases',
                idPrefix: 'gsalease',
                titleFields: [
                    'Real_Property_Asset_Name',
                    'Installation_Name',
                    'LOCATION_CODE',
                    'NAME',
                ],
                stateFields: ['STATE_CD', 'STATE', 'STALP', 'STATE_CODE', 'ST'],
                latFields: ['Latitude', 'LATITUDE', 'LAT'],
                lngFields: ['Longitude', 'LONGITUDE', 'LON', 'LONG'],
                cityFields: ['CITY', 'CITY_NAME'],
                addressFields: ['STREET_ADDRESS', 'ADDRESS', 'LOCATION_ADDRESS'],
                zipFields: ['ZIPCODE5', 'ZIP', 'ZIPCODE'],
                statusFields: ['BUILDING_STATUS', 'OWNED_OR_LEASED_INDICATOR', 'STATUS'],
                idFields: ['LEASE_NUMBER', 'LOCATION_CODE', 'OBJECTID', 'FID'],
            },
            {
                slug: 'prison-boundaries-1',
                idPrefix: 'prison',
                titleFields: ['NAME', 'FACILITY_NAME', 'FACILITY', 'SITE_NAME'],
                stateFields: ['STATE', 'ST', 'STATE_CODE', 'STALP', 'STATEABBR'],
                cityFields: ['CITY', 'CITY_NAME', 'COUNTY'],
                addressFields: ['ADDRESS', 'STREET', 'LOCATION'],
                idFields: ['OBJECTID', 'FID', 'GLOBALID', 'FACILITY_ID'],
            },
            {
                slug: 'epa-facilities',
                idPrefix: 'epafac',
                titleFields: ['NAME', 'FACILITY_NAME', 'PRIMARY_NAME', 'FAC_NAME'],
                stateFields: ['STATE_CODE', 'STATE', 'STALP', 'ST'],
                latFields: ['LATITUDE83', 'LATITUDE', 'LAT'],
                lngFields: ['LONGITUDE83', 'LONGITUDE', 'LON', 'LONG'],
                cityFields: ['CITY_NAME', 'CITY'],
                addressFields: ['LOCATION_ADDRESS', 'ADDRESS'],
                zipFields: ['POSTAL_CODE', 'ZIP', 'ZIPCODE'],
                idFields: ['REGISTRY_ID', 'OBJECTID', 'FID'],
            },
        ],
    },
];

const sectorDefById = new Map(HIFLD_NEXT_SECTOR_DEFS.map((d) => [d.sectorId, d]));

export function hifldNextSectorDef(sectorId: CriticalInfraSectorId): HifldNextSectorDef | undefined {
    return sectorDefById.get(sectorId);
}

export const HIFLD_NEXT_SECTOR_IDS: CriticalInfraSectorId[] = HIFLD_NEXT_SECTOR_DEFS.map((d) => d.sectorId);
