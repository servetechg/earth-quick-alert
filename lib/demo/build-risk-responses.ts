import type { DashboardIngestBundle, RiskReport } from '@/lib/types/risk-assessment';
import type { RiskSnapshot } from '@/lib/services/risk-current-snapshot';
import { computeRiskSnapshot } from '@/lib/services/risk-current-snapshot';
import type { SeverityBucket, BulletWithRefs } from '@/lib/types/risk-assessment';
import { groupRelatedEvents, toEventGroupSummary } from '@/lib/services/event-grouping';
import type { IncidentDetailResponse } from '@/app/api/risk-assessment/incident-details/route';
import {
    DEMO_CRITICAL_INFRA_MARKERS,
    buildCriticalInfraAtRiskSummary,
} from '@/lib/demo/critical-infrastructure-markers';
import {
    DEMO_CITIZEN_MARKERS,
    DEMO_HISTORICAL_ANALYSIS,
    DEMO_PATH_SEGMENTS,
    LITTLE_ROCK_TORNADO_2023,
} from '@/lib/demo/data/little-rock-tornado-2023';
import { buildDemoUnifiedEventDocs } from '@/lib/demo/build-unified-events';
import { DEMO_SCENARIO_ID, DEMO_SCENARIO_TITLE } from '@/lib/demo/constants';

export function buildDemoRiskSnapshot(): RiskSnapshot {
    const events = buildDemoUnifiedEventDocs();
    const snapshot = computeRiskSnapshot(events, { aiAvailable: true });
    const alertCount = events.length;
    return {
        ...snapshot,
        overall_risk_level: 'SEVERE',
        populations_at_risk: 412_000,
        ai_confidence: 92,
        sources_count: alertCount,
    };
}

export function buildDemoRiskReport(): RiskReport {
    const t = LITTLE_ROCK_TORNADO_2023;
    const snapshot = buildDemoRiskSnapshot();
    const eventDocs = buildDemoUnifiedEventDocs();
    return {
        id: `demo-report-${DEMO_SCENARIO_ID}`,
        generated_at: new Date().toISOString(),
        overall_risk_level: 'SEVERE',
        ai_confidence: 92,
        populations_at_risk: 412_000,
        ready2go_users_reachable: DEMO_CITIZEN_MARKERS.length,
        domain_severities: {
            meteorological: 'SEVERE',
            hydrological: 'ELEVATED',
            fire: 'LOW',
        },
        meteorological_findings: [
            `Confirmed EF-${t.rating.ef} tornado on ${t.meteorology.outlookDate} with ${t.rating.peakWindMph} mph peak winds across ${t.rating.pathLengthMiles} mi track.`,
            `SPC High Risk (5/5) outlook; Tornado Watch → Garland funnel (1:18 PM) → Pulaski Warning (2:03 PM) → Martindale touchdown (2:18 PM CDT).`,
            `Tornado emergencies for Cammack Village and Sherwood/Jacksonville; NWS LZK take-cover with Memphis warning handoff.`,
            `${t.impacts.structuresDamagedOrDestroyed.toLocaleString()} structures damaged/destroyed (588 major damage in Breckenridge segment); mass-casualty declared — 54 injuries.`,
        ],
        hydrological_findings: [
            'Localized flash flooding possible in debris-clogged drainage basins post-storm.',
            'No major river flood stage exceedances on Arkansas River at Little Rock gauge during event window.',
        ],
        fire_findings: ['No significant wildfire threat during convective outbreak.'],
        recommendations_list: [
            {
                priority: 'IMMEDIATE',
                action: 'Issue Ready2Go shelter-in-place alerts for Pulaski and Lonoke county users in tornado path.',
                deployable: true,
                step: 1,
            },
            {
                priority: 'IMMEDIATE',
                action: 'Deploy EMS and fire assets to Breckenridge, Amboy, and Jacksonville staging corridors.',
                deployable: true,
                step: 2,
            },
            {
                priority: 'URGENT',
                action: 'Email situational risk PDF to Arkansas sub-admins and responders via operational mail queue.',
                deployable: true,
                step: 3,
            },
            {
                priority: 'STANDARD',
                action: 'Open Virtual EOC bridge and track hospital capacity surge (54 injuries reported).',
                deployable: false,
                step: 4,
            },
        ],
        incident_distribution: snapshot.incident_distribution,
        historical_analysis: DEMO_HISTORICAL_ANALYSIS,
        historical_analysis_by_incident: {
            storm: DEMO_HISTORICAL_ANALYSIS,
            tornado: DEMO_HISTORICAL_ANALYSIS,
        },
        sources_count: eventDocs.length,
        alerts_count: eventDocs.length,
        meteorological_summary:
            `${DEMO_SCENARIO_TITLE}: high-end EF-3 wedge tornado tracked through densely populated Little Rock metro. ` +
            `NWS tornado emergency issued for Cammack Village; 54 injuries and 2,648 structures affected.`,
        hydrological_risk:
            'Secondary hydrological impacts limited to localized flooding; prioritize debris clearance for drainage.',
        fire_threats: 'Minimal wildfire coupling during this convective event.',
        recommendations:
            'Activate EOC, push shelter alerts, deploy responders along I-430/I-40, distribute AI risk report to stakeholders.',
        major_incidents: snapshot.major_incidents,
        minor_incidents: snapshot.minor_incidents,
    };
}

const _demoEventDocs = buildDemoUnifiedEventDocs();

export function buildDemoAnalyzeResponse() {
    const report = buildDemoRiskReport();
    const aligned = _demoEventDocs;
    const alertCount = aligned.length;
    const bundle: DashboardIngestBundle = {
        stateCd: 'ar',
        nwpsGaugeId: 'LITL1',
        ingestScope: 'state',
        ingestedAt: new Date().toISOString(),
        successfulSources: alertCount,
        totalSignals: aligned.length,
        narrative: report.meteorological_summary,
        sources: [
            { ok: true, source: 'nws', summary: 'Tornado warnings, emergencies, and watch — Pulaski & Lonoke' },
            { ok: true, source: 'manual', summary: 'EF-3 Little Rock tornado NWS survey & path segments' },
            { ok: true, source: 'manual', summary: 'Mass casualty, debris, curfew, and recovery advisories' },
            { ok: true, source: 'manual', summary: 'SPC High Risk outlook & Garland funnel precursor' },
        ],
        riskExposure: {
            populationAffectedEstimate: 412_000,
            censusVintageLabel: 'Demo scenario (ACS estimate)',
            countiesResolved: [
                { stateAbbr: 'AR', countyStem: 'Pulaski', label: 'Pulaski County, AR', population: 399_000 },
                { stateAbbr: 'AR', countyStem: 'Lonoke', label: 'Lonoke County, AR', population: 74_000 },
            ],
            countyHintsApplied: ['Pulaski', 'Lonoke'],
            countyMatchHints: [
                { stateAbbr: 'AR', countyStem: 'Pulaski' },
                { stateAbbr: 'AR', countyStem: 'Lonoke' },
            ],
            centroids: [
                { lat: 34.7465, lon: -92.2896, radiusKm: 55, label: 'Little Rock EF-3 track corridor' },
            ],
            dashboardStateCd: 'ar',
        },
    };

    return {
        report,
        population_exposure: bundle.riskExposure ?? null,
        ingest: {
            successfulSources: bundle.successfulSources,
            totalSignals: bundle.totalSignals,
            ingestedAt: bundle.ingestedAt,
            stateCd: 'ar',
            ingestScope: 'state' as const,
            nwpsGaugeId: bundle.nwpsGaugeId,
            populationsAtRiskAcsEstimate: 412_000,
            reachableReady2GoUsers: DEMO_CITIZEN_MARKERS.length,
            riskExposureVintage: bundle.riskExposure?.censusVintageLabel ?? null,
            aligned_event_count: aligned.length,
            aligned_alert_count: aligned.length,
            sources: bundle.sources.map((s) => ({
                source: s.source,
                ok: s.ok,
                error: s.error,
            })),
            demo: true,
            scenarioId: DEMO_SCENARIO_ID,
        },
    };
}

export function buildDemoSummaryResponse() {
    const snapshot = buildDemoRiskSnapshot();
    const report = buildDemoRiskReport();
    const analyze = buildDemoAnalyzeResponse();
    const populationAtRiskUsers = DEMO_CITIZEN_MARKERS.map((c, i) => ({
        id: c.id,
        name: c.title,
        email: `citizen${i + 1}@demo.ready2go.app`,
        address: c.location,
    }));
    const censusEstimate = analyze.ingest.populationsAtRiskAcsEstimate ?? 412_000;
    const { severity_buckets, ...rest } = snapshot;
    return {
        ...rest,
        alerts_count: report.alerts_count,
        major_incidents: report.major_incidents,
        minor_incidents: report.minor_incidents,
        incident_distribution: report.incident_distribution,
        populations_at_risk: censusEstimate,
        ready2go_users_at_risk: populationAtRiskUsers.length,
        population_exposure: analyze.population_exposure ?? null,
        population_at_risk_users: populationAtRiskUsers,
        ai_available: true,
        demo: true,
        scenarioId: DEMO_SCENARIO_ID,
        scenarioTitle: DEMO_SCENARIO_TITLE,
        critical_infrastructure_at_risk: buildCriticalInfraAtRiskSummary(DEMO_CRITICAL_INFRA_MARKERS).map(
            (row) => ({
                sectorId: row.sectorId,
                label: row.label,
                facilitiesAtRisk: row.facilitiesAtRisk,
                riskLevel: row.riskLevel,
            }),
        ),
        severity_buckets: severity_buckets.map((b) => ({
            severity: b.severity,
            categories: b.categories.map((c) => ({
                category: c.category,
                eventCount: c.events.length,
            })),
        })),
    };
}

export function buildDemoSeveritySummaries(): { buckets: SeverityBucket[] } {
    const snapshot = buildDemoRiskSnapshot();
    const docs = buildDemoUnifiedEventDocs();
    const idByPrefix = (prefix: string) =>
        docs.find((d) => String(d._id).startsWith(prefix))?._id ?? LITTLE_ROCK_TORNADO_2023.id;

    const bullets: BulletWithRefs[] = [
        {
            text: `EF-3 tornado (165 mph peak) tracked 34.44 miles through Little Rock, North Little Rock, Sherwood, and Jacksonville — 2,648 structures affected.`,
            eventIds: [LITTLE_ROCK_TORNADO_2023.id],
        },
        {
            text: 'SPC High Risk (5/5) and Tornado Watch preceded Garland funnel (1:18 PM) and Pulaski Tornado Warning at 2:03 PM CDT — touchdown Martindale 2:18 PM.',
            eventIds: [
                String(idByPrefix('demo-lrk-spc-outlook')),
                String(idByPrefix('demo-lrk-tornado-watch')),
                String(idByPrefix('demo-lrk-garland-funnel')),
                String(idByPrefix('demo-lrk-tornado-warning-pulaski')),
            ],
        },
        {
            text: 'Tornado emergencies issued for Cammack Village and Sherwood/Jacksonville; NWS LZK took shelter and transferred warnings to Memphis during office take-cover.',
            eventIds: [
                String(idByPrefix('demo-lrk-tornado-emergency-cammack')),
                String(idByPrefix('demo-lrk-tornado-emergency-sherwood')),
            ],
        },
        {
            text: 'Breckenridge/Chenal segment: 588 major-damage structures; Calais Forest and Turtle Creek apartments devastated along Chenal Parkway.',
            eventIds: [String(idByPrefix('demo-lrk-ef3-peak-breckenridge'))],
        },
        {
            text: 'Mass casualty declared (54 verified injuries; initial ~600 estimate); North Little Rock curfew, 130k+ yd³ debris, 115 cleanup workers by April 1.',
            eventIds: [
                String(idByPrefix('demo-lrk-mass-casualty')),
                String(idByPrefix('demo-lrk-nlr-curfew')),
                String(idByPrefix('demo-lrk-power-debris')),
            ],
        },
    ];

    const buckets: SeverityBucket[] = [];
    for (const bucket of snapshot.severity_buckets) {
        const categories = bucket.categories.map((catGroup) => {
            const eventGroups = groupRelatedEvents(catGroup.events);
            return {
                category: catGroup.category,
                eventCount: catGroup.events.length,
                groupCount: eventGroups.length,
                bullets: catGroup.category === 'storm' ? bullets : [],
                groups: eventGroups.map(toEventGroupSummary),
            };
        });
        buckets.push({
            severity: bucket.severity,
            categories,
        });
    }

    return { buckets };
}

export function buildDemoIncidentDetails(eventIds: string[]): IncidentDetailResponse {
    const docs = buildDemoUnifiedEventDocs().filter((d) => eventIds.includes(String(d._id)));
    const useDocs = docs.length > 0 ? docs : [buildDemoUnifiedEventDocs()[0]];
    const groups = groupRelatedEvents(useDocs).map(toEventGroupSummary);

    return {
        groups,
        narrative: {
            overview: LITTLE_ROCK_TORNADO_2023.description,
            currentStatus:
                'Tornado emergency active 2:18–2:58 PM CDT March 31, 2023. Mass casualty protocols activated; debris clearance underway. ' +
                'Full timeline: SPC High Risk → Tornado Watch → Garland funnel (1:18 PM) → Pulaski Warning (2:03 PM) → ' +
                'Martindale touchdown → Cammack Village & Sherwood/Jacksonville emergencies → dissipation near Parnell.',
            affectedAreas: LITTLE_ROCK_TORNADO_2023.affectedAreas.join('; '),
            keyStatistics:
                `EF-${LITTLE_ROCK_TORNADO_2023.rating.ef}, ${LITTLE_ROCK_TORNADO_2023.rating.peakWindMph} mph peak winds, ` +
                `${LITTLE_ROCK_TORNADO_2023.rating.pathLengthMiles} mi path, ${LITTLE_ROCK_TORNADO_2023.rating.maxWidthYards} yd max width, ` +
                `${LITTLE_ROCK_TORNADO_2023.impacts.structuresDamagedOrDestroyed} structures, ` +
                `${LITTLE_ROCK_TORNADO_2023.impacts.injuriesDirect} injuries, ` +
                `$${(LITTLE_ROCK_TORNADO_2023.impacts.propertyDamageUsd / 1_000_000).toFixed(0)}M+ property damage.`,
            historicalContext: DEMO_HISTORICAL_ANALYSIS.similarity_summary,
            pathSegments: DEMO_PATH_SEGMENTS.map(
                (s) => `${s.label} (${s.timeCdt}, EF-${s.efRating}): ${s.summary}`,
            ),
        },
        pastContext: {
            matchedEvent: DEMO_HISTORICAL_ANALYSIS.matched_event,
            similaritySummary: DEMO_HISTORICAL_ANALYSIS.similarity_summary,
            pastDamages: [...DEMO_HISTORICAL_ANALYSIS.past_damages],
            pastProcedures: [...DEMO_HISTORICAL_ANALYSIS.past_procedures],
            matchConfidence: DEMO_HISTORICAL_ANALYSIS.match_confidence,
        },
        eventCount: useDocs.length,
    };
}
