import type { AfterActionReviewData } from '@/lib/types/after-action-review'
import { mapRowsToTimelineEvents } from '@/lib/services/after-action-review-builder'
import {
    DEMO_CITIZEN_MARKERS,
    DEMO_HISTORICAL_ANALYSIS,
    DEMO_RESPONDER_MARKERS,
    DEMO_SUPPORTING_EVENTS,
    LITTLE_ROCK_TORNADO_2023,
} from '@/lib/demo/data/little-rock-tornado-2023'
import { DEMO_SCENARIO_ID, DEMO_SCENARIO_TITLE } from '@/lib/demo/constants'

function formatCdt(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
        timeZoneName: 'short',
    })
}

/** Citizen help requests and responder deployments interleaved into the operational timeline. */
function buildFieldOperationsTimeline() {
    const t = LITTLE_ROCK_TORNADO_2023
    const base = new Date(t.issuedAt).getTime()

    const citizenRows = DEMO_CITIZEN_MARKERS.map((c, i) => ({
        issuedAt: new Date(base + (4 + i * 3) * 60_000).toISOString(),
        name: c.isSafe ? `Citizen Check-in — ${c.title}` : `Help Request — ${c.title}`,
        description: `${c.location}: ${c.description}`,
        severity: c.isSafe ? 'Moderate' : 'Extreme',
        type: c.isSafe ? 'Report' : 'Help',
        category: 'citizen',
    }))

    const responderRows = DEMO_RESPONDER_MARKERS.map((r, i) => ({
        issuedAt: new Date(base + (6 + i * 4) * 60_000).toISOString(),
        name: `${r.title} — ${r.status === 'deployed' ? 'Deployed' : 'Active'}`,
        description: `${r.location}: ${r.description}`,
        severity: 'High',
        type: 'Responder',
        category: 'responder',
    }))

    return [...citizenRows, ...responderRows]
}

/**
 * Authoritative Arkansas EF-3 tornado after-action review for presentation demo.
 * Sources: NWS LZK survey, DEMO_SUPPORTING_EVENTS, citizen/responder markers, DEMO_HISTORICAL_ANALYSIS.
 */
export function buildDemoAfterActionReview(): AfterActionReviewData {
    const t = LITTLE_ROCK_TORNADO_2023

    const nwsAndEocRows = [
        ...DEMO_SUPPORTING_EVENTS,
        {
            id: t.id,
            name: t.name,
            description: t.description,
            severity: t.severity,
            type: t.type,
            issuedAt: t.issuedAt,
            category: t.category,
        },
    ]

    const allTimelineSources = [...nwsAndEocRows, ...buildFieldOperationsTimeline()].sort(
        (a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime(),
    )

    const events = mapRowsToTimelineEvents(allTimelineSources)

    const helpRequests = DEMO_CITIZEN_MARKERS.filter((c) => !c.isSafe).length
    const safeCheckins = DEMO_CITIZEN_MARKERS.filter((c) => c.isSafe).length
    const responderCount = DEMO_RESPONDER_MARKERS.length
    const nwsProductCount = DEMO_SUPPORTING_EVENTS.length + 1

    const aiInsights = [
        {
            id: 'AAR-DEMO-SUMMARY',
            category: 'Summary',
            description:
                `${DEMO_SCENARIO_TITLE}. NWS survey confirmed EF-${t.rating.ef} with ${t.rating.peakWindMph} mph peak winds across ` +
                `${t.rating.pathLengthMiles} miles through Pulaski and Lonoke counties. ` +
                `${t.impacts.structuresDamagedOrDestroyed.toLocaleString()} structures damaged or destroyed; ` +
                `${t.impacts.injuriesDirect} direct injuries. ${DEMO_HISTORICAL_ANALYSIS.similarity_summary}`,
            status: 'Addressed' as const,
        },
        {
            id: 'AAR-DEMO-WELL',
            category: 'What Went Well',
            description:
                'Tornado Warning preceded Martindale touchdown by ~15 minutes. NWS tornado emergencies for Cammack Village and ' +
                'Sherwood/Jacksonville corridor enabled Ready2Go shelter-in-place messaging. Mass casualty protocols activated; ' +
                `${responderCount} responder units staged along I-430, I-40, and US-67 within the first hour.`,
            status: 'Addressed' as const,
        },
        {
            id: 'AAR-DEMO-IMPROVE',
            category: 'Areas for Improvement',
            description:
                'Post-storm debris (130,000+ cubic yards in Little Rock) delayed secondary access routes. Insurance and long-term ' +
                'recovery coordination required multi-day VOAD activation. Pre-stage additional SAR assets east of North Little Rock ' +
                'when long-track supercell signatures approach the metro under SPC High Risk.',
            status: 'Pending' as const,
        },
        {
            id: 'AAR-DEMO-COMM',
            category: 'Communication',
            description:
                `${nwsProductCount} NWS/EOC products issued from SPC High Risk through Day-2 recovery brief. ` +
                `${helpRequests} help requests and ${safeCheckins} safe check-ins captured via Ready2Go citizen layer during the event window.`,
            status: 'Addressed' as const,
        },
    ]

    const warningLeadMinutes = 15
    const shelterReachPct = 94
    const responderDeploymentPct = Math.min(98, 72 + responderCount * 4)

    return {
        id: t.id,
        name: t.shortName,
        type: 'Tornado Event',
        duration: `${t.rating.durationMinutes}m`,
        durationDetail: `${formatCdt(t.issuedAt)} – ${formatCdt(t.expiresAt)}`,
        insights: aiInsights.length,
        events,
        aiInsights,
        performanceIndicators: [
            {
                label: 'Warning Lead Time (Pulaski)',
                val: `${warningLeadMinutes} min`,
                status: 'optimal',
                percent: Math.min(100, warningLeadMinutes * 5),
            },
            {
                label: 'Shelter Alert Reach',
                val: `${shelterReachPct}%`,
                status: 'optimal',
                percent: shelterReachPct,
            },
            {
                label: 'Responder Deployment',
                val: `${responderDeploymentPct}%`,
                status: 'optimal',
                percent: responderDeploymentPct,
            },
        ],
        strategicEnhancements: [
            ...DEMO_HISTORICAL_ANALYSIS.past_procedures.slice(0, 2).map((p) => p.replace(/^Mass casualty/, 'Maintain mass casualty')),
            'Pre-stage urban SAR and EMS task forces east of I-430 when SPC High Risk overlaps Pulaski County.',
            'Automate debris-corridor GIS layers for post-tornado drainage and access routing within 6 hours of dissipation.',
            'Conduct regional insurance/VOAD recovery brief within 48 hours (mirrors $489M regional payout planning cycle).',
        ],
        scenarioId: DEMO_SCENARIO_ID,
        demo: true,
        metadata: {
            efRating: t.rating.ef,
            peakWindMph: t.rating.peakWindMph,
            pathLengthMiles: t.rating.pathLengthMiles,
            pathWidthYards: t.rating.maxWidthYards,
            durationMinutes: t.rating.durationMinutes,
            counties: [...t.counties],
            structuresAffected: t.impacts.structuresDamagedOrDestroyed,
            injuriesDirect: t.impacts.injuriesDirect,
            citizenReports: DEMO_CITIZEN_MARKERS.length,
            responderDeployments: responderCount,
            nwsProducts: nwsProductCount,
            location: t.location,
            issuedAt: t.issuedAt,
            resolvedAt: t.expiresAt,
            historicalMatchConfidence: DEMO_HISTORICAL_ANALYSIS.match_confidence,
        },
    }
}
