export type PowerOutagePolygon = {
    id: string;
    name: string;
    utilityId?: string;
    county: string;
    state: string;
    communityDescriptor?: string;
    metersAffected: number;
    customersRestored?: number | null;
    reportedStartTime?: string;
    estimatedRestorationTime?: string;
    cause?: string | null;
    statusKind?: string | null;
    /** One or more rings (exterior only) for MultiPolygon / Polygon geometry. */
    paths: { lat: number; lng: number }[][];
    centroid: { lat: number; lng: number };
    source: string;
};

/** ODIN Real-time Outages (County) — states with live utility feeds on OpenEnergy Hub. */
export const ODIN_OUTAGE_STATE_NAMES = [
    'Arizona',
    'California',
    'Colorado',
    'Illinois',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Missouri',
    'New Hampshire',
    'New Jersey',
    'New York',
    'North Carolina',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Washington',
    'West Virginia',
] as const;

export type OdinOutageStateName = (typeof ODIN_OUTAGE_STATE_NAMES)[number];

export const ODIN_OUTAGES_API_BASE =
    'https://ornl.opendatasoft.com/api/explore/v2.1/catalog/datasets/odin-real-time-outages-county/records';

export const ODIN_OUTAGE_FETCH_TIMEOUT_MS = 60_000;
export const ODIN_OUTAGE_PAGE_LIMIT = 100;
export const ODIN_OUTAGE_CACHE_TTL_MS = 5 * 60 * 1000;

/** Green fill matching ODIN county outage map styling. */
export const ODIN_OUTAGE_FILL_COLOR = '#22C55E';
export const ODIN_OUTAGE_STROKE_COLOR = '#15803D';

const USPS_TO_ODIN_NAME: Record<string, OdinOutageStateName> = {
    AZ: 'Arizona',
    CA: 'California',
    CO: 'Colorado',
    IL: 'Illinois',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MO: 'Missouri',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NY: 'New York',
    NC: 'North Carolina',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    WA: 'Washington',
    WV: 'West Virginia',
};

export function odinStateNameFromUsps(usps: string): OdinOutageStateName | null {
    return USPS_TO_ODIN_NAME[usps.trim().toUpperCase()] ?? null;
}

export function odinSupportedStateNames(): OdinOutageStateName[] {
    return [...ODIN_OUTAGE_STATE_NAMES];
}
