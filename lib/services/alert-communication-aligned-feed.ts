import AlertCommunication from '@/models/AlertCommunication';
import User from '@/models/User';
import { alertCommunicationFeedFilter } from '@/lib/constants/alert-communication-feed';
import { hydrateAlertCommunicationRows } from '@/lib/utils/alert-communication-hydrate';
import { alertRowMatchesAiAlignedStateScope } from '@/lib/utils/alert-location-state-match';
import { syncAlertCommunicationFeedsGate } from '@/lib/services/alert-communication-feed-sync-gate';
import type { DistroPoint } from '@/lib/types/risk-assessment';
import {
    classifyNwsIncidentDistributionBucket,
    isFloodRelatedEvent,
} from '@/lib/services/risk-ingest-service';

export function filterHydratedForSubAdminState(hydrated: any[], stateRaw: string) {
    return hydrated.filter((row) =>
        alertRowMatchesAiAlignedStateScope(
            {
                source: typeof row.source === 'string' ? row.source : '',
                location: typeof row.location === 'string' ? row.location : '',
                locations: row.locations as string[],
                description: typeof row.description === 'string' ? row.description : '',
                name: typeof row.name === 'string' ? row.name : '',
                instructions: Array.isArray(row.instructions) ? row.instructions : undefined,
            },
            stateRaw,
        ),
    );
}

async function subAdminHomeStateRaw(userId: string | undefined): Promise<string | null> {
    if (!userId) return null;
    const u = await User.findById(userId).select('state').lean();
    const st = typeof u?.state === 'string' ? u.state.trim() : '';
    return st || null;
}

/**
 * Live `AlertCommunication` rows after the same refresh + hydration + sub-admin filter as Alerts & Communication.
 */
export async function fetchAlignedAlertCommunicationFeed(options: {
    userId?: string;
    role: string;
    /** When true, read Mongo only (no NWS/multi-source refresh). Use on hot paths like risk analyze. */
    skipUpstreamSync?: boolean;
}): Promise<any[]> {
    if (!options.skipUpstreamSync) {
        await syncAlertCommunicationFeedsGate();
    }
    const feedFilter = alertCommunicationFeedFilter();
    const data = await AlertCommunication.find(feedFilter).sort({ createdAt: -1 }).lean();
    const hydrated = hydrateAlertCommunicationRows(data as any[]);

    const role = String(options.role ?? '').toLowerCase();
    if (role === 'sub-admin' && options.userId) {
        const stateRaw = await subAdminHomeStateRaw(options.userId);
        if (stateRaw) return filterHydratedForSubAdminState(hydrated, stateRaw);
    }

    return hydrated;
}

type DistroCat =
    | 'flood'
    | 'tornado'
    | 'storm'
    | 'hazardous'
    | 'coastal_surf'
    | 'marine'
    | 'wildfire'
    | 'earthquake';

function categorizeAlertRow(row: { source?: string; name?: string; description?: string }): DistroCat {
    const src = String(row.source ?? 'nws').toLowerCase();
    const name = String(row.name ?? '');
    const desc = String(row.description ?? '');

    if (src === 'earthquake') return 'earthquake';
    if (src === 'firms' || src === 'inciweb' || src === 'wfigs') return 'wildfire';
    if (src === 'usgs' || src === 'nwps' || src === 'fema') return 'flood';

    if (src === 'nws') {
        if (isFloodRelatedEvent(name) || isFloodRelatedEvent(desc)) return 'flood';
        const bucket = classifyNwsIncidentDistributionBucket(name) ?? classifyNwsIncidentDistributionBucket(desc);
        if (bucket === 'tornado') return 'tornado';
        if (bucket === 'storm') return 'storm';
        if (bucket === 'hazardous') return 'hazardous';
        if (bucket === 'coastal_surf') return 'coastal_surf';
        if (bucket === 'marine') return 'marine';
        return 'hazardous';
    }

    return 'hazardous';
}

/** Bar chart buckets in the same order as `deriveEventBasedIncidentDistribution`. */
export function incidentDistributionFromAlignedAlerts(
    rows: Array<{ source?: string; name?: string; description?: string }>,
): DistroPoint[] {
    const z: Record<DistroCat, number> = {
        flood: 0,
        tornado: 0,
        storm: 0,
        hazardous: 0,
        coastal_surf: 0,
        marine: 0,
        wildfire: 0,
        earthquake: 0,
    };
    for (const row of rows) {
        z[categorizeAlertRow(row)] += 1;
    }
    return [
        { category: 'flood', count: z.flood },
        { category: 'tornado', count: z.tornado },
        { category: 'storm', count: z.storm },
        { category: 'hazardous', count: z.hazardous },
        { category: 'coastal_surf', count: z.coastal_surf },
        { category: 'marine', count: z.marine },
        { category: 'wildfire', count: z.wildfire },
        { category: 'earthquake', count: z.earthquake },
    ];
}

export function majorMinorFromAlignedAlerts(rows: any[]): { major: number; minor: number } {
    let major = 0;
    for (const row of rows) {
        const sev = String(row.severity ?? '').toLowerCase();
        const isMajor =
            /extreme|high|severe|critical/.test(sev) || String(row.type ?? '') === 'Warning';
        if (isMajor) major += 1;
    }
    return { major, minor: Math.max(0, rows.length - major) };
}
