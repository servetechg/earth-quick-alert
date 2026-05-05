/**
 * Broad USA defaults for Alerts & Communication when env vars are unset.
 *
 * - **NWS**: Nationwide active alerts are the default (`NWS_ALERT_SYNC_SCOPE` defaults to `national` in `alert-communication-nws-sync`).
 * - **FIRMS**: Default bbox is ~CONUS + AK/HI/territories (`FIRMS_DEFAULT_BBOX` in `wildfire-service`).
 * - **USGS**: Instantaneous IV API is **per site**; there is no single “all USA” query. This list samples major basins across regions.
 * - **NWPS**: `/gauges/{lid}` is **per gauge**; this list samples gauges that respond on the public API (expand with `NWPS_GAUGE_LIDS` / `NWPS_REACH_IDS`).
 */

export const DEFAULT_USGS_SITES_NATIONWIDE: string[] = [
    '01073500', // ME — Kennebec basin
    '01646500', // Mid-Atlantic — Potomac region
    '01638500', // Mid-Atlantic
    '02196000', // Southeast — Pee Dee
    '02381650', // Gulf — Choctawhatchee basin
    '03341500', // Ohio / IN — Wabash
    '05446500', // Upper Mississippi — Clinton IA
    '05587450', // Illinois River
    '06354000', // Plains — Yellowstone at Sidney MT
    '06847900', // Missouri basin — Kansas City area
    '08066200', // TX — Trinity basin
    '09492400', // Southwest — Colorado River
    '10166430', // Great Basin — UT
    '11180500', // CA coast
    '12092000', // WA — Skykomish
    '12147500', // WA — Skagit
];

/** Verified 200 on `GET /nwps/v1/gauges/{lid}`; spread across CONUS. */
export const DEFAULT_NWPS_GAUGE_LIDS_NATIONWIDE: string[] = [
    'AACS2', // TX — Gulf Coast
    'STPM5', // Upper Mississippi
    'HARP1', // PA — Susquehanna
    'CEDI4', // IA — Cedar
    'PORW3', // Pacific NW
    'ABNG1', // Northeast
    'TREF1', // Southeast
    'CFMM8', // Great Lakes
];
