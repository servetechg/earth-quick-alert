/**
 * Operational "historical context" quadrants keyed to the dominant hazard mix in this ingest.
 * Uses incident_distribution (+ active incident totals), not prose line counts.
 */

import type { DashboardIngestBundle, HistoricalAnalysis, RiskReport } from '@/lib/types/risk-assessment';

type HazardArchetype = 'flood' | 'wildfire' | 'earthquake' | 'multi' | 'baseline';

function distroCounts(report: RiskReport): { flood: number; wildfire: number; earthquake: number } {
    const d = report.incident_distribution ?? [];
    const get = (cat: string) => Math.max(0, Math.floor(d.find((x) => x.category === cat)?.count ?? 0));
    return {
        flood: get('flood'),
        wildfire: get('wildfire'),
        earthquake: get('earthquake'),
    };
}

function pickArchetype(report: RiskReport): HazardArchetype {
    const { flood, wildfire, earthquake } = distroCounts(report);
    const activeCats = [flood > 0, wildfire > 0, earthquake > 0].filter(Boolean).length;
    if (activeCats >= 2) return 'multi';
    if (flood > 0) return 'flood';
    if (wildfire > 0) return 'wildfire';
    if (earthquake > 0) return 'earthquake';
    return 'baseline';
}

function matchConfidence(report: RiskReport, archetype: HazardArchetype, bundle: DashboardIngestBundle): number {
    const { flood, wildfire, earthquake } = distroCounts(report);
    const n = flood + wildfire + earthquake;
    const major = report.major_incidents ?? 0;
    const feeds = bundle.successfulSources;
    if (archetype === 'baseline') {
        return Math.min(88, Math.round(52 + Math.min(24, feeds * 2.2)));
    }
    let base = 68 + Math.min(22, n * 3) + Math.min(8, major * 2) + Math.min(4, feeds);
    if ((report.alerts_count ?? 0) > 0 && major > 0) base += 4;
    return Math.min(96, Math.round(base));
}

const ST = (state: string) => state.toUpperCase();

function copyForFlood(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Major hydrologic stress pattern — ${s} riverine / flash-flood comparators`,
        similarity_summary: `Current NWPS / USGS / NWS-FEMA signals align with historical wet-season episodes in ${s}: rising stages, warning-level hydrology, and declared flood contingencies that produced measurable infrastructure and transport disruption in prior years.`,
        past_damages: [
            'Inundation of low crossings, agricultural levee stress, and wastewater / storm-drain surcharge in comparable events.',
            'Extended detours and supply-chain delay where primary corridors parallel floodplains.',
            'Increased EMS / swift-water exposures near normally dry channels.',
        ],
        past_procedures: [
            'Zone-based evacuations downstream of dams and levee reaches; staged shelter openings.',
            'Utility pre-isolation where substations and pump stations sit in inundation footprints.',
            'Damage assessment via unified request + geotagged imagery after crest passage.',
        ],
        current_procedures: [
            'Cross-check NWPS flood category with USGS instantaneous gages and jurisdictional thresholds.',
            'Issue targeted messaging through Virtual EOC and licensed footprint overlays.',
            'Resource status: boats / high‑water rigs on callback; traffic control pre-positioned at known closures.',
        ],
        future_measures: [
            'Invest in hardened telemetry and redundant gauge reporting for headwater tributaries.',
            'Update inundation libraries and evacuation timing models with latest LiDAR / structure inventory.',
            'Tabletop bridging dam-safety messaging with downstream OEM and critical infrastructure owners.',
        ],
    };
}

function copyForWildfire(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Elevated wildland fire environment — ${s} / regional perimeter & hotspot pattern`,
        similarity_summary: `FIRMS thermal density plus InciWeb / interagency perimeter context mirrors past moderate-to-large campaigns in ${s}: fast wind shifts, overlapping airspace, and public smoke/air-quality thresholds crossed for multiple counties.`,
        past_damages: [
            'Primary structure loss at wildland–urban interface; secondary exposure from wind-driven spotting.',
            'Air-quality exceedances affecting schools, clinics, and outdoor congregate shelters.',
            'Transport controls on egress routes and intermittent power interruptions from line tripping.',
        ],
        past_procedures: [
            'ICS scaling with aerial coordination cells; IAP updates at each operational period.',
            'Evacuation warnings keyed to wind / RH trends; contingency for reverse‑911 saturation.',
            'Fatigue-managed strike teams with redistributed rest cycles after night aviation curfews.',
        ],
        current_procedures: [
            'Fused FIRMS sector briefings with WFIGS perimeters and local CAD incident names.',
            'Public messaging that distinguishes “background satellite hits” from named, staffed incidents.',
            'ICS resource tracking and airspace deconfliction ahead of wind events.',
        ],
        future_measures: [
            'Community wildfire protection plans with structure-hardening incentives in WUI growth areas.',
            'Pre-identified tactical water sources and helispot maintenance schedules.',
            'Seasonal fuel-treatment corridors aligned with dominant wind vectors.',
        ],
    };
}

function copyForEarthquake(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Seismic activity cluster — ${s} / regional crustal comparators`,
        similarity_summary: `USGS M2.5+ day feed highlights for ${s} resemble prior moderate sequences: elevated public inquiry load, aftershock messaging needs, and infrastructure owners watching instrumented assets even when shaking is light at population centers.`,
        past_damages: [
            'Nonstructural damage (utilities, contents) and delayed inspection backlogs in dense building stock.',
            'Telecom / 911 surge and misinformation spikes on social channels minutes after origin time.',
            'Secondary risk from damaged unreinforced masonry and older soft-story inventory.',
        ],
        past_procedures: [
            'Rapid building safety evaluation tags; utility SCADA walkdowns on critical bridges and tunnels.',
            'Coordinated aftershock communications with geologists and school / hospital partners.',
            'SAR readiness posturing when magnitude threshold or population exposure warrants.',
        ],
        current_procedures: [
            'Verify USGS event list against felt reports and licensed user check-ins in Ready2Go.',
            'Brief Virtual EOC on lifeline status and any dam / pipeline operator notifications.',
            'Hold reconnaissance aviation and USAR modules at ready‑5 if magnitudes trend upward.',
        ],
        future_measures: [
            'Accelerate soft-story and URM retrofit programs; utility undergrounding in liquefaction-prone reaches.',
            'ShakeAlert outreach and “Drop, Cover, Hold On” drills tied to school and employer networks.',
            'Regional cache of emergency generators and satellite backhaul for PSAP continuity.',
        ],
    };
}

function copyForMulti(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Concurrent multi-hazard episode — ${s} (flood + fire + / or seismic signals)`,
        similarity_summary: `Ingest shows overlapping hydrologic, wildland, and/or seismic indicators. Historically, ${s} windows like this strain unified command: competing resource claims, duplicated public messaging, and logistics friction across separated incident teams.`,
        past_damages: [
            'Compounded outage and access issues when fire smoke, road flooding, and bridge inspection holds coincide.',
            'Staffing conflicts between hydrology desks, fire operations, and earthquake situation units.',
            'Delayed mutual aid when air quality, route closures, and aftershock caution slow movement.',
        ],
        past_procedures: [
            'Single EOC battle rhythm with hazard-specific branches and a prioritization matrix.',
            'Shared geospatial common operating picture; one public information officer cell.',
            'Pre-rotation of finance / logistics to sustain a longer operational period.',
        ],
        current_procedures: [
            'Time-stamp and source-tag every feed (NWS, USGS, FIRMS, WFIGS) in the incident narrative.',
            'Escalate Unified Command when any two hazard branches request division-level resources.',
            'Daily surge test of mass-notification channels and language-access lines.',
        ],
        future_measures: [
            'Joint exercises crossing flood + fire + earthquake injects with cross-jurisdictional data sharing MOUs.',
            'Invest in redundant earth station and mesh backhaul for mountain / rural corridors.',
            'Codify “resource typing” for engines, boats, and USAR that can flex across hazard types.',
        ],
    };
}

function copyForBaseline(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Regional readiness baseline — ${s} (no single dominant hazard in current ingest)`,
        similarity_summary: `With no strong single-hazard cluster in the deduped incident distribution, comparators revert to blended seasonal risk in ${s}: downstream flood exposures in wet months, episodic seismicity, and background wildfire potential whenever fuels and wind align.`,
        past_damages: [
            'Small-to-moderate losses distributed across unrelated events rather than one catalyzing disaster.',
            'Administrative fatigue from repeated near-misses without sustained funding for mitigation.',
            'Uneven public engagement when dashboards stay “green” for long stretches.',
        ],
        past_procedures: [
            'Quarterly interconnect tests with NOAA, USGS feeds, and local GIS perimeter services.',
            'Credentialing passes for responders and interoperable communications checks.',
            'Shelter roster refresh and ADA accessibility validation.',
        ],
        current_procedures: [
            'Maintain multi-feed ingest health (see source readiness on this assessment).',
            'Spot-check Virtual EOC contact trees and escalation scripts for each hazard family.',
            'Capture lessons from any nuisance thermal or gauge spikes for future thresholds.',
        ],
        future_measures: [
            'Prioritize interoperable alerting into mobile apps and multilingual templates.',
            'Fund continuous hazard mapping updates and community preparedness campaigns.',
            'Establish performance metrics tying feed uptime to exercise scores.',
        ],
    };
}

/**
 * Populate `historical_analysis` quadrant bullets from dominant hazard archetype derived from {@link RiskReport.incident_distribution}.
 */
export function buildHistoricalAnalysisFromReport(
    bundle: DashboardIngestBundle,
    report: RiskReport
): HistoricalAnalysis {
    const state = bundle.stateCd || 'us';
    const archetype = pickArchetype(report);
    const body =
        archetype === 'flood'
            ? copyForFlood(state)
            : archetype === 'wildfire'
              ? copyForWildfire(state)
              : archetype === 'earthquake'
                ? copyForEarthquake(state)
                : archetype === 'multi'
                  ? copyForMulti(state)
                  : copyForBaseline(state);

    return {
        ...body,
        match_confidence: matchConfidence(report, archetype, bundle),
    };
}

export function applyHistoricalContextToReport(bundle: DashboardIngestBundle, report: RiskReport): RiskReport {
    return {
        ...report,
        historical_analysis: buildHistoricalAnalysisFromReport(bundle, report),
    };
}
