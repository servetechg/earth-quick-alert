import User from '@/models/User';
import { alertRowMatchesAiAlignedStateScope } from '@/lib/utils/alert-location-state-match';
import { syncAlertCommunicationFeedsGate } from '@/lib/services/alert-communication-feed-sync-gate';
import { fetchUnifiedEventLegacyCards } from '@/lib/unified-event/feed';
import { unifiedCategoryToDistroBucket } from '@/lib/unified-event/category-infer';
import type { DistroPoint } from '@/lib/types/risk-assessment';
import type { UnifiedEventCategory } from '@/lib/unified-event/types';

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
 * Live `UnifiedEvent` rows (current ingest) after refresh + sub-admin filter — same feed as Alerts & Communication.
 */
export async function fetchAlignedUnifiedEventFeed(options: {
    userId?: string;
    role: string;
}): Promise<any[]> {
    await syncAlertCommunicationFeedsGate();
    const hydrated = await fetchUnifiedEventLegacyCards();

    const role = String(options.role ?? '').toLowerCase();
    if (role === 'sub-admin' && options.userId) {
        const stateRaw = await subAdminHomeStateRaw(options.userId);
        if (stateRaw) return filterHydratedForSubAdminState(hydrated, stateRaw);
    }

    return hydrated;
}

/** @deprecated Use `fetchAlignedUnifiedEventFeed` */
export const fetchAlignedAlertCommunicationFeed = fetchAlignedUnifiedEventFeed;

type DistroCat =
    | 'flood'
    | 'tornado'
    | 'storm'
    | 'hazardous'
    | 'coastal_surf'
    | 'marine'
    | 'wildfire'
    | 'earthquake';

function categorizeAlertRow(row: {
    source?: string;
    name?: string;
    description?: string;
    category?: string;
}): DistroCat {
    const cat = String(row.category ?? '').trim() as UnifiedEventCategory;
    if (cat) return unifiedCategoryToDistroBucket(cat);

    const src = String(row.source ?? 'nws').toLowerCase();
    if (src === 'earthquake') return 'earthquake';
    if (src === 'firms' || src === 'inciweb' || src === 'wfigs') return 'wildfire';
    if (src === 'usgs' || src === 'nwps') return 'flood';
    if (src === 'fema') return 'flood';
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
    return (
        [
            { category: 'flood', count: z.flood },
            { category: 'tornado', count: z.tornado },
            { category: 'storm', count: z.storm },
            { category: 'hazardous', count: z.hazardous },
            { category: 'coastal_surf', count: z.coastal_surf },
            { category: 'marine', count: z.marine },
            { category: 'wildfire', count: z.wildfire },
            { category: 'earthquake', count: z.earthquake },
        ] satisfies DistroPoint[]
    ).filter((row) => row.count > 0);
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
