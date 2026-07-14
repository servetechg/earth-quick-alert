/** Query-string name used when an API key env var is required. */
export type WzdxApiKeyQuery = 'app_key' | 'apiKey' | 'key' | 'access_token' | 'api_key'

/** State / regional DOT Work Zone Data Exchange (WZDX) v4.x feed. */
export type WzdxFeedConfig = {
    /** Unique cache + segment id prefix (e.g. TX-AUS when multiple feeds share a state). */
    feedId: string
    /** USPS state code used for viewport / state scoping. */
    stateCode: string
    label: string
    url: string
    acceptCompressed?: boolean
    apiKeyEnv?: string
    apiKeyQuery?: WzdxApiKeyQuery
}

/**
 * Verified WZDX feeds from READY2GO GIS MAP DATA Postman collection (Copy 3).
 * Omitted until working: Wisconsin (511wi HTML error), Oklahoma (Cloudflare block),
 * NPS (HTML/403), Virginia (no URL).
 */
export const WZDX_STATE_FEEDS: WzdxFeedConfig[] = [
    {
        feedId: 'NC',
        stateCode: 'NC',
        label: 'NCDOT',
        url: 'https://drivenc.gov/api/wzdx',
    },
    {
        feedId: 'LA',
        stateCode: 'LA',
        label: 'LADOTD',
        url: 'https://wzdx.e-dot.com/la_dot_d_feed_wzdx_v4.1.geojson',
    },
    {
        feedId: 'FL',
        stateCode: 'FL',
        label: 'FDOT',
        url: 'https://us-datacloud.one.network/fdot/feed.json',
        acceptCompressed: true,
        apiKeyEnv: 'FDOT_WZDX_APP_KEY',
        apiKeyQuery: 'app_key',
    },
    {
        feedId: 'IN',
        stateCode: 'IN',
        label: 'INDOT',
        url: 'https://in.carsprogram.org/carsapi_v1/api/wzdx',
    },
    {
        feedId: 'ID',
        stateCode: 'ID',
        label: 'ITD',
        url: 'https://511.idaho.gov/api/wzdx',
    },
    {
        feedId: 'KS',
        stateCode: 'KS',
        label: 'KDOT',
        url: 'https://ks.carsprogram.org/carsapi_v1/api/wzdx',
    },
    {
        feedId: 'KY',
        stateCode: 'KY',
        label: 'KYTC',
        url: 'https://storage.googleapis.com/kytc-its-2020-openrecords/public/feeds/WZDx/kytc_wzdx_v4.1.geojson',
    },
    {
        feedId: 'NJ',
        stateCode: 'NJ',
        label: 'NJIT Smart Work Zones',
        url: 'https://smartworkzones.njit.edu/nj/wzdx',
    },
    {
        feedId: 'CO',
        stateCode: 'CO',
        label: 'CDOT',
        url: 'https://data.cotrip.org/api/v1/wzdx',
        apiKeyEnv: 'CDOT_WZDX_API_KEY',
        apiKeyQuery: 'apiKey',
    },
    {
        feedId: 'TX',
        stateCode: 'TX',
        label: 'TxDOT DriveTexas',
        url: 'https://api.drivetexas.org/api/conditions.wzdx.geojson',
        apiKeyEnv: 'TXDOT_WZDX_API_KEY',
        apiKeyQuery: 'key',
    },
    {
        feedId: 'TX-AUS',
        stateCode: 'TX',
        label: 'City of Austin',
        url: 'https://data.austintexas.gov/download/d9mm-cjw9',
    },
]

export function wzdxFeedsForState(stateCode: string): WzdxFeedConfig[] {
    const code = stateCode.toUpperCase()
    return WZDX_STATE_FEEDS.filter((f) => f.stateCode === code)
}

export function resolveWzdxFeedUrl(feed: WzdxFeedConfig): string | null {
    if (!feed.apiKeyEnv) return feed.url

    const key = process.env[feed.apiKeyEnv]?.trim()
    if (!key) return null

    const param = feed.apiKeyQuery ?? 'app_key'
    const sep = feed.url.includes('?') ? '&' : '?'
    return `${feed.url}${sep}${param}=${encodeURIComponent(key)}`
}

/** Unique state codes with at least one WZDX feed. */
export const WZDX_IMPLEMENTED_STATE_CODES = [
    ...new Set(WZDX_STATE_FEEDS.map((f) => f.stateCode)),
]
