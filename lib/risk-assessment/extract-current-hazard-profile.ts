import type { DashboardIngestBundle, DomainSeverities, IncidentHistoryCategory, RiskReport } from '@/lib/types/risk-assessment';
import { incidentCategoriesWithPositiveChartCount } from '@/lib/services/risk-historical-context';

export interface CurrentHazardProfile {
  scope: 'nationwide' | 'state';
  /** USPS 2-letter code (uppercase) or 'US' for nationwide */
  stateCd: string;
  activeCategories: IncidentHistoryCategory[];
  /** Max magnitude from USGS_EARTHQUAKES features in current ingest */
  earthquakeMaxMagnitude?: number;
  /** Max FRP (fire radiative power) from NASA FIRMS if available */
  wildfireMaxFrp?: number;
  domainSeverities: DomainSeverities;
}

export function extractCurrentHazardProfile(
    bundle: DashboardIngestBundle,
    heuristic: RiskReport,
): CurrentHazardProfile {
    const scope: 'nationwide' | 'state' = bundle.ingestScope === 'state' ? 'state' : 'nationwide';
    const stateCd = (bundle.stateCd ?? 'US').toUpperCase();
    const activeCategories = incidentCategoriesWithPositiveChartCount(heuristic);

    // Max earthquake magnitude from USGS_EARTHQUAKES raw GeoJSON features
    let earthquakeMaxMagnitude: number | undefined;
    const usgsEqSource = bundle.sources.find((s) => s.source === 'USGS_EARTHQUAKES');
    if (usgsEqSource?.ok && usgsEqSource.data) {
        try {
            const geo = usgsEqSource.data as { features?: Array<{ properties?: { mag?: unknown } }> };
            if (Array.isArray(geo.features)) {
                const mags = geo.features
                    .map((f) => {
                        const m = f?.properties?.mag;
                        return typeof m === 'number' && isFinite(m) ? m : null;
                    })
                    .filter((m): m is number => m !== null);
                if (mags.length) earthquakeMaxMagnitude = Math.max(...mags);
            }
        } catch {
            /* ignore parse errors */
        }
    }
    // Fallback: parse magnitudes from summary text (e.g. "M5.1 earthquake...")
    if (earthquakeMaxMagnitude === undefined && typeof usgsEqSource?.summary === 'string') {
        const matches = [...usgsEqSource.summary.matchAll(/\bM\s?(\d+(?:\.\d+)?)/gi)];
        const mags = matches.map((m) => parseFloat(m[1])).filter((m) => isFinite(m));
        if (mags.length) earthquakeMaxMagnitude = Math.max(...mags);
    }

    return {
        scope,
        stateCd,
        activeCategories,
        earthquakeMaxMagnitude,
        domainSeverities: heuristic.domain_severities ?? {},
    };
}
