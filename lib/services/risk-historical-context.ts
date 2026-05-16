/**
 * Operational "historical context" quadrants keyed to the dominant hazard mix in this ingest.
 * Uses incident_distribution (+ active incident totals), not prose line counts.
 */

import {
    INCIDENT_HISTORY_TAB_KEYS,
    type DashboardIngestBundle,
    type HistoricalAnalysis,
    type IncidentHistoryCategory,
    type DistroPoint,
    type RiskReport,
} from '@/lib/types/risk-assessment';
import {
    classifyNwsIncidentDistributionBucket,
    isFloodRelatedEvent,
} from '@/lib/services/risk-ingest-service';

/**
 * Heuristic / “no signals” ingest lines — must not spawn historical tabs or drown chart alignment.
 */
export function isNoiseIngestFindingLine(line: string): boolean {
    const t = line.trim().toLowerCase();
    if (!t) return true;
    if (/^hydrological ingest incomplete\b/.test(t)) return true;
    if (/^wildfire layer signals sparse or unavailable\b/.test(t)) return true;
    if (/^no notable earthquake or flood\b/.test(t)) return true;
    if (/no earthquakes in m2\.5\+\b/.test(t)) return true;
    if (/no nasa viirs hotspots\b/.test(t)) return true;
    if (/^no inciweb wildfire rss items\b/.test(t)) return true;
    if (/firms json ok but no hotspot rows\b/.test(t)) return true;
    if (/csv parsed but no coordinate rows\b/.test(t)) return true;
    if (/\bno wfigs perimeter features\b/.test(t)) return true;
    if (/returned no features for this pull\b/.test(t)) return true;
    if (/interagency perimeter layer returned no features\b/.test(t)) return true;
    if (/empty window or outside current aoi\b/.test(t)) return true;
    return false;
}

/** Met findings bucketed for incident tabs (excludes earthquake — handled separately). */
const NWS_SURFACE_TABS: IncidentHistoryCategory[] = [
    'tornado',
    'storm',
    'hazardous',
    'coastal_surf',
    'marine',
];

function isKnownIncidentCategory(cat: string): cat is IncidentHistoryCategory {
    return (INCIDENT_HISTORY_TAB_KEYS as readonly string[]).includes(cat);
}

type HazardArchetype =
    | 'flood'
    | 'wildfire'
    | 'earthquake'
    | 'severe_weather'
    | 'multi'
    | 'baseline';

function distroCounts(report: RiskReport): {
    flood: number;
    wildfire: number;
    earthquake: number;
    tornado: number;
    storm: number;
    hazardous: number;
    coastal_surf: number;
    marine: number;
} {
    /** Sum counts across duplicate rows so totals match stacked bar-chart expectations. */
    const totals = {
        flood: 0,
        wildfire: 0,
        earthquake: 0,
        tornado: 0,
        storm: 0,
        hazardous: 0,
        coastal_surf: 0,
        marine: 0,
    };

    for (const row of report.incident_distribution ?? []) {
        const cat = String(row.category ?? '').trim().toLowerCase();
        if (!isKnownIncidentCategory(cat)) continue;
        const parsed = Number(row.count);
        const n = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
        totals[cat] += n;
    }

    return totals;
}

/** Incident types with strictly positive aggregated bar-chart count (single source for tabs + rollup). */
export function incidentCategoriesWithPositiveChartCount(report: RiskReport): IncidentHistoryCategory[] {
    const c = distroCounts(report);
    return INCIDENT_HISTORY_TAB_KEYS.filter((k) => (c[k] ?? 0) > 0);
}

/** One row per bar-chart bucket; counts match {@link distroCounts} (aggregated + lowercase keys). */
export function incidentDistributionRowsAligned(report: RiskReport): DistroPoint[] {
    const c = distroCounts(report);
    return INCIDENT_HISTORY_TAB_KEYS.map((category) => ({ category, count: c[category] ?? 0 }));
}

/** Bar-chart / `incident_distribution` count — drives which historical subtabs appear. */
function distroCountForCategory(report: RiskReport, cat: IncidentHistoryCategory): number {
    return distroCounts(report)[cat];
}

function nwsSurfaceTotal(c: ReturnType<typeof distroCounts>): number {
    return Math.max(0, c.tornado + c.storm + c.hazardous + c.coastal_surf + c.marine);
}

function pickArchetype(report: RiskReport): HazardArchetype {
    const c = distroCounts(report);
    const met = nwsSurfaceTotal(c);
    const families = [
        c.flood > 0,
        c.wildfire > 0,
        c.earthquake > 0,
        met > 0,
    ].filter(Boolean).length;
    if (families >= 2) return 'multi';
    if (c.flood > 0) return 'flood';
    if (c.wildfire > 0) return 'wildfire';
    if (c.earthquake > 0) return 'earthquake';
    if (met > 0) return 'severe_weather';
    return 'baseline';
}

function matchConfidence(
    report: RiskReport,
    archetype: HazardArchetype | IncidentHistoryCategory,
    bundle: DashboardIngestBundle,
): number {
    const c = distroCounts(report);
    const n =
        c.flood +
        c.wildfire +
        c.earthquake +
        c.tornado +
        c.storm +
        c.hazardous +
        c.coastal_surf +
        c.marine;
    const major = report.major_incidents ?? 0;
    const feeds = bundle.successfulSources;
    if (archetype === 'baseline') {
        return Math.min(88, Math.round(52 + Math.min(24, feeds * 2.2)));
    }
    let base = 68 + Math.min(22, n * 3) + Math.min(8, major * 2) + Math.min(4, feeds);
    if ((report.alerts_count ?? 0) > 0 && major > 0) base += 4;
    return Math.min(96, Math.round(base));
}

const ST = (state: string) => {
    const s = state.toLowerCase().trim();
    if (s === 'us' || s === 'usa' || s === 'all' || s === 'national') return 'U.S. (nationwide)';
    return state.toUpperCase();
};

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

function copyForSevereWeather(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `NOAA/NWS hazardous weather footprint — ${s} (surface warnings / watches via active alerts)`,
        similarity_summary: `Nationwide Active Alerts show concentrated tornado / thunderstorm / winter-wind exposures and, when present, coastal surf and marine products in ${s}. Comparable periods elevate spotter activation, surf rescue posture, small-craft decisions, and multilingual push updates when warning polygons stack across metro or shoreline counties.`,
        past_damages: [
            'Downed utility spans, roof and signage failures, and tree-strike fatalities when warning lead times shorten in fast-moving convection.',
            'EMS volume spikes tied to slips/falls during ice storms, heat exhaustion during excessive heat episodes, and wildfire spotting when gusts align with dryness aloft.',
            'Regional grid stability questions when contiguous severe-wind footprints stress vegetation and conductors simultaneously.',
        ],
        past_procedures: [
            'Polygon-targeted alerting with GIS overlap checks against campuses, hospitals, and industrial facilities.',
            'Skywarn / spotter nets stood up alongside radar-centric aviation holds and intermittent ground stops.',
            'Utility aviation pre-position for wire-down response; cooling / warming centers pre-staged for multi-day episodes.',
        ],
        current_procedures: [
            'Cross-verify NWS event types versus Virtual EOC user density and roadway closure feeds.',
            'Confirm redundant alerting paths (SMS, email, portal) ahead of plausible power blips in warned counties.',
            'Brief logistics on evacuation timing where rotating storms or snow squalls compress decision windows.',
        ],
        future_measures: [
            'Mesh mesonet investments and radar gap infill along known convective corridors.',
            'Post-event attribution studies linking polygon accuracy to preventable injuries for exercise planning.',
            'Expand probabilistic briefing templates coupling short-fuse warnings with preparedness checklists.',
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

function copyForTornado(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Tornado-focused warning episode — ${s}`,
        similarity_summary: `Short-fuse tornado and severe-convective polygons in ${s} historically compress warning lead time, stress spotter nets, and drive shelter-in-place messaging load on PSAPs and schools.`,
        past_damages: [
            'Structural / roof loss and debris fields when mesocyclones track across subdivisions or industrial parks.',
            'Downed power distribution and blocked ingress for EMS when tree falls align with road grids.',
        ],
        past_procedures: [
            'Polygon-targeted alerting with shelter mapping; Skywarn net activation ahead of mesoscale discussion windows.',
            'Pre-positioning damage assessment and utility aviation after initial rotation signals.',
        ],
        current_procedures: [],
        future_measures: [
            'Radar gap infill and lightning-density thresholds tied to push templates for outdoor venues.',
            'Tabletop reverse-911 saturation and multilingual shelter routing in dense metro counties.',
        ],
    };
}

function copyForStorm(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Severe thunderstorm / convective tropical episode — ${s}`,
        similarity_summary: `Hail, wind, lightning, and tropical-cyclone precursor products in ${s} correlate with aviation holds, ground-stop windows, and cascading power-line trips across broad warning areas.`,
        past_damages: [
            'Hail losses to exposed aircraft, solar, and vehicles; wind-thrown signage and partial roof lifts.',
            'Flashy rain rates overwhelming urban drainage when convection trains over the same corridors.',
        ],
        past_procedures: [
            'Coordinated ground stops and ramp holds with NWS updates each operational period.',
            'Utility mutual-aid staging for wire-down surges after MCS or bow-echo passages.',
        ],
        current_procedures: [],
        future_measures: [
            'Probabilistic briefing templates for probabilistic severe outlooks + asset pre-positioning.',
            'Hardened METAR/ASOS cross-checks inside Virtual EOC overlays.',
        ],
    };
}

function copyForHazardousSurface(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Hazardous weather / winter–wind / air-quality episode — ${s}`,
        similarity_summary: `Winter storm, ice, extreme temperature, dense smoke, and high-wind products for ${s} align with historical multi-day utility restoration, cooling/warming center demand, and evacuation timing friction.`,
        past_damages: [
            'Cold-related infrastructure failures, heat-illness surges, and smoke-inhalation presentations at clinics.',
            'Multi-county road treatment and tree-trim backlogs when icing stacks with wind gusts.',
        ],
        past_procedures: [
            'Warming/cooling center pre-activation; roadway treatment priority lists with hospital access routes.',
            'Air-quality health messaging coordination with schools and elder-care networks.',
        ],
        current_procedures: [],
        future_measures: [
            'Fuel and generator cache programs for extended grid-stress windows.',
            'Post-event attribution studies on warning polygon accuracy vs. preventable injuries.',
        ],
    };
}

function copyForCoastalSurf(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Coastal surf / beach-hazard episode — ${s}`,
        similarity_summary: `High surf, rip-current, and coastal flood-adjacent signage in ${s} mirror past surf rescue surges, inundation of low boardwalks, and tourist-heavy beach closures during long-period swell.`,
        past_damages: [
            'Rip-current drownings or near-misses when lifeguard coverage thins at dusk or during king tides.',
            'Erosion and structure undermining at vulnerable reaches during stacked high-tide cycles.',
        ],
        past_procedures: [
            'Beach closure boards, flag systems, and multilingual shore-access messaging.',
            'Coordinated USCG / lifeguard briefings when long-period swell overlaps holiday weekends.',
        ],
        current_procedures: [],
        future_measures: [
            'Annual update of inundation graphics and pier / promenade closure SOPs.',
            'Public education campaigns keyed to tide tables and NOAA surf products.',
        ],
    };
}

function copyForMarine(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Marine / offshore hazard episode — ${s}`,
        similarity_summary: `Gale, small-craft, freezing-spray, and special marine contexts for ${s} historically stress port logistics, fisheries safety, and small-vessel egress timing ahead of sharpening gradients.`,
        past_damages: [
            'Vessel distress and marine SAR tasking when inexperienced operators underestimate building seas.',
            'Port slowdowns during gale windows and berth scheduling conflicts.',
        ],
        past_procedures: [
            'Harbor master coordination with NWS Marine Forecast Desk; PSC VHF guard monitoring.',
            'Predeclaration of tug/escort posture for laden tankers and cruise movements.',
        ],
        current_procedures: [],
        future_measures: [
            'Investment in AIS correlation with NOAA marine zones for tighter Virtual EOC geofencing.',
            'Seasonal small-craft education with bar-crossing hazards.',
        ],
    };
}

function copyForMulti(state: string): HistoricalAnalysis {
    const s = ST(state);
    return {
        matched_event: `Concurrent multi-hazard episode — ${s} (hydro + wildland + seismic + / or NOAA surface hazards)`,
        similarity_summary: `Ingest shows overlapping hydrologic, wildland, seismic, and/or NOAA surface-hazard indicators. Historically, ${s} windows like this strain unified command: competing resource claims, duplicated public messaging, and logistics friction across separated incident teams.`,
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

export const INCIDENT_HISTORY_TAB_LABELS: Record<IncidentHistoryCategory, string> = {
    flood: 'Flood',
    tornado: 'Tornado',
    storm: 'Storm',
    hazardous: 'Hazardous',
    coastal_surf: 'Coastal surf',
    marine: 'Marine',
    wildfire: 'Wildfire',
    earthquake: 'Earthquake',
};

export function isLikelyEarthquakeBullet(text: string): boolean {
    const t = text.toLowerCase();
    if (/\bearthquake\b|\bseismic\b|\bepicenter\b|\baftershock\b/.test(t)) return true;
    if (/earthquake\s+magnitude|magnitude\s+m\d/i.test(text)) return true;
    return /^earthquake\s+magnitude\s+m/i.test(text.trim());
}

/** Classify meteorological ingest line to a surface tab (not earthquake — use {@link isLikelyEarthquakeBullet}). */
export function classifyMeteorologicalLineToTab(line: string): IncidentHistoryCategory | null {
    if (!line.trim()) return null;
    if (isLikelyEarthquakeBullet(line)) return null;
    if (isFloodRelatedEvent(line)) return 'flood';

    const b = classifyNwsIncidentDistributionBucket(line);
    if (b === 'tornado') return 'tornado';
    if (b === 'storm') return 'storm';
    if (b === 'hazardous') return 'hazardous';
    if (b === 'coastal_surf') return 'coastal_surf';
    if (b === 'marine') return 'marine';

    const t = line.toLowerCase();
    if (/\btornado\b|\btor\b/.test(t)) return 'tornado';
    if (/\bthunderstorm\b|\bhurricane\b|\btropical storm\b|\btropical depression\b|\bhail\b|\bsquall line\b/.test(t)) {
        return 'storm';
    }
    if (/\brip current\b|\bhigh surf\b|\bbeach hazards?\b|\bcoastal flood\b|\bsneaker wave\b/.test(t)) {
        return 'coastal_surf';
    }
    if (
        /\bgale warning\b|\bgale watch\b|\bsmall craft\b|\bmarine weather\b|\btsunami\b|\brough bar\b|\bheavy freezing spray\b/.test(
            t,
        ) ||
        (/\bmarine\b/.test(t) && !/\bmarine thunderstorm\b/.test(t))
    ) {
        return 'marine';
    }
    if (/\bwarning\b|\bwatch\b|\badvisory\b/.test(t)) return 'hazardous';
    return null;
}

function dedupePreserveOrder(xs: string[]): string[] {
    const seen = new Set<string>();
    return xs.filter((x) => {
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
    });
}

/** Same buckets as {@link deriveEventBasedIncidentDistribution} / bar chart, from raw NWS GeoJSON. */
function nwsBriefLinesForCategory(bundle: DashboardIngestBundle, cat: IncidentHistoryCategory): string[] {
    const nws = bundle.sources.find((s) => s.source === 'NWS_FLOOD_ALERTS');
    if (!nws?.ok || !nws.data) return [];
    const feats = (nws.data as { features?: { properties?: Record<string, unknown> }[] })?.features;
    if (!Array.isArray(feats)) return [];
    const lines: string[] = [];
    for (const f of feats) {
        const p = f?.properties ?? {};
        const event = String(p.event ?? p.headline ?? '').trim();
        if (!event) continue;
        const area = String(p.areaDesc ?? '').trim();
        const sent = String(p.sent ?? p.effective ?? '').trim();
        const seg = [event, area, sent].filter(Boolean).join(' — ').trim();
        if (!seg || isNoiseIngestFindingLine(seg)) continue;

        if (cat === 'flood') {
            if (isFloodRelatedEvent(event)) lines.push(seg.slice(0, 520));
            continue;
        }
        if (isFloodRelatedEvent(event)) continue;
        const bucket = classifyNwsIncidentDistributionBucket(event);
        const match =
            (cat === 'tornado' && bucket === 'tornado') ||
            (cat === 'storm' && bucket === 'storm') ||
            (cat === 'hazardous' && bucket === 'hazardous') ||
            (cat === 'coastal_surf' && bucket === 'coastal_surf') ||
            (cat === 'marine' && bucket === 'marine');
        if (match) lines.push(seg.slice(0, 520));
    }
    return dedupePreserveOrder(lines).slice(0, 24);
}

function eqBriefLinesFromBundle(bundle: DashboardIngestBundle): string[] {
    const summary = bundle.sources.find((s) => s.source === 'USGS_EARTHQUAKES')?.summary;
    if (typeof summary !== 'string' || !summary.trim()) return [];
    const parts = summary
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length && !isNoiseIngestFindingLine(l));
    return dedupePreserveOrder(parts).slice(0, 24);
}

export function deriveRealtimeProceduresForIncident(
    report: RiskReport,
    cat: IncidentHistoryCategory,
    bundle?: DashboardIngestBundle | null,
): string[] {
    const metNoiseOk = (report.meteorological_findings ?? []).filter((l) => !isNoiseIngestFindingLine(l));

    const fromReport = (): string[] => {
        switch (cat) {
            case 'flood': {
                const hydro = (report.hydrological_findings ?? []).filter((l) => !isNoiseIngestFindingLine(l));
                const metFlood = metNoiseOk.filter((l) => !isLikelyEarthquakeBullet(l) && isFloodRelatedEvent(l));
                return dedupePreserveOrder([...hydro, ...metFlood]);
            }
            case 'wildfire':
                return (report.fire_findings ?? []).filter((l) => !isNoiseIngestFindingLine(l));
            case 'earthquake':
                return metNoiseOk.filter(isLikelyEarthquakeBullet);
            case 'tornado':
            case 'storm':
            case 'hazardous':
            case 'coastal_surf':
            case 'marine':
                return metNoiseOk.filter((l) => classifyMeteorologicalLineToTab(l) === cat);
            default:
                return [];
        }
    };

    const primary = fromReport();
    if (primary.length || !bundle) return primary;

    if (cat === 'flood' || NWS_SURFACE_TABS.includes(cat)) {
        const nws = nwsBriefLinesForCategory(bundle, cat);
        if (nws.length) return nws;
    }
    if (cat === 'earthquake') return eqBriefLinesFromBundle(bundle);
    return [];
}

function categoriesWithLiveFindings(
    report: RiskReport,
    bundle?: DashboardIngestBundle | null,
): IncidentHistoryCategory[] {
    return INCIDENT_HISTORY_TAB_KEYS.filter((k) => {
        if (distroCountForCategory(report, k) <= 0) return false;
        return deriveRealtimeProceduresForIncident(report, k, bundle).length > 0;
    });
}

function realtimePlaceholder(cat: IncidentHistoryCategory): string {
    switch (cat) {
        case 'flood':
            return 'No live hydrological findings in this ingest (USGS/NWPS/FEMA may be quiet or filtered for your scope).';
        case 'wildfire':
            return 'No live wildfire findings in this ingest (FIRMS/InciWeb/WFIGS may be sparse or unavailable).';
        case 'earthquake':
            return "No live seismic lines in this report's meteorological ingest for this pull.";
        case 'tornado':
        case 'storm':
        case 'hazardous':
        case 'coastal_surf':
        case 'marine':
            return `No live ${INCIDENT_HISTORY_TAB_LABELS[cat].toLowerCase()} lines in meteorological ingest for this pull.`;
        default:
            return 'No matching live findings for this category in this report.';
    }
}

function playbookForIncident(state: string, cat: IncidentHistoryCategory): Omit<HistoricalAnalysis, 'match_confidence'> {
    switch (cat) {
        case 'flood':
            return copyForFlood(state);
        case 'wildfire':
            return copyForWildfire(state);
        case 'earthquake':
            return copyForEarthquake(state);
        case 'tornado':
            return copyForTornado(state);
        case 'storm':
            return copyForStorm(state);
        case 'hazardous':
            return copyForHazardousSurface(state);
        case 'coastal_surf':
            return copyForCoastalSurf(state);
        case 'marine':
            return copyForMarine(state);
    }
}

function singleCategoryLiveProcedures(
    report: RiskReport,
    cat: IncidentHistoryCategory,
    bundle?: DashboardIngestBundle | null,
): string[] {
    const raw = deriveRealtimeProceduresForIncident(report, cat, bundle);
    if (raw.length) return raw;
    return [realtimePlaceholder(cat)];
}

function liveLineWithTabPrefix(cat: IncidentHistoryCategory, bullet: string): string {
    return `[${INCIDENT_HISTORY_TAB_LABELS[cat]}] ${bullet}`;
}

function buildRollupCurrentProcedures(
    report: RiskReport,
    archetype: HazardArchetype,
    bundle: DashboardIngestBundle,
): string[] {
    if (archetype === 'flood') return singleCategoryLiveProcedures(report, 'flood', bundle);
    if (archetype === 'wildfire') return singleCategoryLiveProcedures(report, 'wildfire', bundle);
    if (archetype === 'earthquake') return singleCategoryLiveProcedures(report, 'earthquake', bundle);

    if (archetype === 'severe_weather') {
        const tabs = NWS_SURFACE_TABS.filter((k) => {
            if (distroCountForCategory(report, k) <= 0) return false;
            return deriveRealtimeProceduresForIncident(report, k, bundle).length > 0;
        });
        if (!tabs.length) {
            return ['No live NWS / surface-hazard lines in meteorological ingest for this pull.'];
        }
        if (tabs.length === 1) return deriveRealtimeProceduresForIncident(report, tabs[0], bundle);
        const lines: string[] = [];
        for (const cat of tabs) {
            for (const bullet of deriveRealtimeProceduresForIncident(report, cat, bundle)) {
                lines.push(liveLineWithTabPrefix(cat, bullet));
            }
        }
        return dedupePreserveOrder(lines).slice(0, 28);
    }

    const liveCats = categoriesWithLiveFindings(report, bundle);
    const cats =
        archetype === 'multi'
            ? liveCats.length > 0
                ? liveCats
                : [...INCIDENT_HISTORY_TAB_KEYS]
            : [...INCIDENT_HISTORY_TAB_KEYS];

    const lines: string[] = [];
    for (const cat of cats) {
        if (distroCountForCategory(report, cat) <= 0) continue;
        const raw = deriveRealtimeProceduresForIncident(report, cat, bundle);
        if (!raw.length) continue;
        const prefixMulti = archetype === 'multi' || archetype === 'baseline' || cats.length > 1;
        for (const bullet of raw) {
            lines.push(prefixMulti ? liveLineWithTabPrefix(cat, bullet) : bullet);
        }
    }
    const trimmed = dedupePreserveOrder(lines).slice(0, 28);
    if (trimmed.length) return trimmed;
    return ['No category-specific live lines in this ingest — check upstream feeds or scope.'];
}

/** Prefer highest bar-chart count among categories that qualify for a historical subtab. */
export function pickDefaultHistoricalTab(
    report: RiskReport,
    bundle?: DashboardIngestBundle | null,
): IncidentHistoryCategory | null {
    const withLive = categoriesWithLiveFindings(report, bundle);
    if (!withLive.length) return null;
    const d = report.incident_distribution ?? [];
    const n = (cat: string) => Math.max(0, Math.floor(d.find((x) => x.category === cat)?.count ?? 0));
    return [...withLive].sort((a, b) => n(b) - n(a))[0] ?? withLive[0];
}

/** Playbook + live lines: only categories with bar-chart count ({@link RiskReport.incident_distribution}) & ingest lines. */
export function buildHistoricalAnalysisByIncident(
    bundle: DashboardIngestBundle,
    report: RiskReport,
): Partial<Record<IncidentHistoryCategory, HistoricalAnalysis>> {
    const state = bundle.stateCd || 'us';
    const out: Partial<Record<IncidentHistoryCategory, HistoricalAnalysis>> = {};
    for (const cat of INCIDENT_HISTORY_TAB_KEYS) {
        if (distroCountForCategory(report, cat) <= 0) continue;
        const live = deriveRealtimeProceduresForIncident(report, cat, bundle);
        if (!live.length) continue;
        const playbook = playbookForIncident(state, cat);
        out[cat] = {
            ...playbook,
            current_procedures: live,
            match_confidence: matchConfidence(report, cat, bundle),
        };
    }
    return out;
}

/**
 * Populate `historical_analysis` quadrant bullets from dominant hazard archetype derived from {@link RiskReport.incident_distribution}.
 */
export function buildHistoricalAnalysisFromReport(
    bundle: DashboardIngestBundle,
    report: RiskReport,
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
                : archetype === 'severe_weather'
                  ? copyForSevereWeather(state)
                  : archetype === 'multi'
                    ? copyForMulti(state)
                    : copyForBaseline(state);

    return {
        ...body,
        current_procedures: buildRollupCurrentProcedures(report, archetype, bundle),
        match_confidence: matchConfidence(report, archetype, bundle),
    };
}

/**
 * Live-data-only historical scaffold. Supplies `current_procedures` (from live ingest)
 * and the computed `match_confidence` ONLY — no static playbook prose. The OpenAI pass
 * fills matched_event / similarity_summary / past_damages / past_procedures / future_measures.
 *
 * Use this instead of {@link applyHistoricalContextToReport} so the displayed Historical
 * Context never shows the static copyFor* templates — only AI-generated analysis.
 */
export function buildLiveHistoricalContext(
    bundle: DashboardIngestBundle,
    report: RiskReport,
): Pick<RiskReport, 'historical_analysis' | 'historical_analysis_by_incident'> {
    const archetype = pickArchetype(report);
    const historical_analysis: HistoricalAnalysis = {
        current_procedures: buildRollupCurrentProcedures(report, archetype, bundle),
        match_confidence: matchConfidence(report, archetype, bundle),
    };

    const byIncident: Partial<Record<IncidentHistoryCategory, HistoricalAnalysis>> = {};
    for (const cat of INCIDENT_HISTORY_TAB_KEYS) {
        if (distroCountForCategory(report, cat) <= 0) continue;
        const live = deriveRealtimeProceduresForIncident(report, cat, bundle);
        if (!live.length) continue;
        byIncident[cat] = {
            current_procedures: live,
            match_confidence: matchConfidence(report, cat, bundle),
        };
    }

    return {
        historical_analysis,
        historical_analysis_by_incident: Object.keys(byIncident).length ? byIncident : undefined,
    };
}

export function applyHistoricalContextToReport(bundle: DashboardIngestBundle, report: RiskReport): RiskReport {
    return {
        ...report,
        historical_analysis: buildHistoricalAnalysisFromReport(bundle, report),
        historical_analysis_by_incident: buildHistoricalAnalysisByIncident(bundle, report),
    };
}
