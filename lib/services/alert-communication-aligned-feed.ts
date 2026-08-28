import {
    filterUnifiedEventDocsForJurisdiction,
    resolveSubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { matchesStateWideUnifiedAlert } from '@/lib/utils/alert-location-state-match';
import { syncAlertCommunicationFeedsGate } from '@/lib/services/alert-communication-feed-sync-gate';
import {
    getCurrentEvents,
    getCurrentEventsForJurisdiction,
    type UnifiedEventDoc,
} from '@/lib/services/unified-event-repo';
import { unifiedCategoryToDistroBucket } from '@/lib/unified-event/category-infer';
import { unifiedEventToLegacyAlertCard } from '@/lib/unified-event/legacy-card';
import { hydrateAlertCommunicationRows } from '@/lib/utils/alert-communication-hydrate';
import { enrichAlignedCardsWithMapCoordinates } from '@/lib/geo/enrich-alert-cards-coordinates';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import type { DistroPoint } from '@/lib/types/risk-assessment';
import type { UnifiedEventCategory } from '@/lib/unified-event/types';
import User from '@/models/User';
import { resolveDemoSessionContext, getDemoFeedEntry } from '@/lib/demo/provider';

const FEED_CACHE_TTL_MS = 60_000;

type FeedCacheEntry = {
    docs: UnifiedEventDoc[];
    cards: Record<string, unknown>[];
    expiresAt: number;
};

const feedCache = new Map<string, FeedCacheEntry>();

function feedCacheKey(userId: string | undefined, role: string): string {
    return `${userId ?? 'anon'}:${String(role ?? '').toLowerCase()}:aligned-v4`;
}

export function invalidateAlignedFeedCache(userId?: string, role?: string): void {
    if (userId && role) {
        feedCache.delete(feedCacheKey(userId, role));
        return;
    }
    feedCache.clear();
}

/** State-only filter (legacy fallback when jurisdiction cannot be resolved). */
export function filterHydratedForSubAdminState(hydrated: any[], stateRaw: string) {
    return hydrated.filter((row) =>
        matchesStateWideUnifiedAlert(
            {
                source: typeof row.source === 'string' ? row.source : '',
                location: typeof row.location === 'string' ? row.location : '',
                locations: row.locations as string[],
                description: typeof row.description === 'string' ? row.description : '',
                name: typeof row.name === 'string' ? row.name : '',
                instructions: Array.isArray(row.instructions) ? row.instructions : undefined,
                lat: typeof row.lat === 'number' ? row.lat : null,
                lng: typeof row.lng === 'number' ? row.lng : null,
            },
            stateRaw,
        ),
    );
}

function filterDocsForSubAdminState(docs: UnifiedEventDoc[], stateRaw: string): UnifiedEventDoc[] {
    return docs.filter((doc) =>
        matchesStateWideUnifiedAlert(
            {
                source: doc.source,
                location: doc.location,
                description: doc.description,
                name: doc.name,
                instructions: doc.instructions,
                lat: doc.lat,
                lng: doc.lng,
            },
            stateRaw,
        ),
    );
}

function docsToLegacyCards(docs: UnifiedEventDoc[]): Record<string, unknown>[] {
    const cards = docs.map((doc) =>
        unifiedEventToLegacyAlertCard(doc as unknown as Record<string, unknown>),
    );
    return hydrateAlertCommunicationRows(cards);
}

async function resolvePreferStateForSession(
    userId?: string,
    role?: string,
): Promise<string | null> {
    const r = String(role ?? '').toLowerCase();
    if (r !== 'sub-admin' || !userId) return null;
    const jurisdiction = await resolveSubAdminJurisdiction(userId);
    if (jurisdiction?.stateCode) return jurisdiction.stateCode;
    const u = await User.findById(userId).select('state').lean();
    return normalizeStateToUsps(typeof u?.state === 'string' ? u.state : null);
}

/** Map legacy alert cards to `UnifiedEventDoc` for AI Risk snapshot APIs. */
export function legacyAlertCardsToUnifiedEventDocs(rows: Record<string, unknown>[]): UnifiedEventDoc[] {
    return rows.map((row) => {
        const severity = String(row.severity ?? 'Moderate');
        const sevNorm =
            severity === 'Low' || severity === 'Moderate' || severity === 'High' || severity === 'Extreme'
                ? severity
                : 'Moderate';
        return {
            _id: String(row._id ?? row.id ?? ''),
            externalId: String(row.externalId ?? row._id ?? row.id ?? ''),
            source: String(row.source ?? 'nws'),
            category: String(row.category ?? ''),
            name: String(row.name ?? ''),
            description: String(row.description ?? ''),
            severity: sevNorm,
            type: String(row.type ?? ''),
            status: String(row.status ?? ''),
            location: String(row.location ?? ''),
            lat: typeof row.lat === 'number' ? row.lat : null,
            lng: typeof row.lng === 'number' ? row.lng : null,
            issuedAt: String(row.issuedAt ?? ''),
            expiresAt: String(row.expiresAt ?? ''),
            instructions: Array.isArray(row.instructions) ? (row.instructions as string[]) : [],
            properties: {},
            dataStatus: (row.dataStatus === 'past' ? 'past' : 'current') as 'current' | 'past',
            createdAt: String(row.createdAt ?? ''),
            updatedAt: String(row.updatedAt ?? ''),
        };
    });
}

async function loadAlignedUnifiedEvents(options: {
    userId?: string;
    role: string;
    syncFeeds?: boolean;
}): Promise<FeedCacheEntry> {
    const key = feedCacheKey(options.userId, options.role);

    // DEMO: presentation feed for arkansas@admin.com when simulation cookie is set.
    if (options.userId) {
        const u = await User.findById(options.userId).select('email').lean();
        const demoCtx = await resolveDemoSessionContext(options.userId, u?.email as string | undefined);
        if (demoCtx) {
            const demo = getDemoFeedEntry();
            return {
                docs: demo.docs,
                cards: demo.cards,
                expiresAt: Date.now() + FEED_CACHE_TTL_MS,
            };
        }
    }

    const cached = feedCache.get(key);
    if (cached && cached.expiresAt > Date.now() && !options.syncFeeds) {
        return cached;
    }

    if (options.syncFeeds) {
        await syncAlertCommunicationFeedsGate();
        feedCache.delete(key);
    }

    const role = String(options.role ?? '').toLowerCase();
    let docs: UnifiedEventDoc[];

    if (role === 'sub-admin' && options.userId) {
        const jurisdiction = await resolveSubAdminJurisdiction(options.userId);
        if (jurisdiction) {
            if (jurisdiction.coverageType === 'state') {
                // Same statewide pool + rules as mobile citizens in that state.
                const candidates = await getCurrentEvents();
                docs = candidates.filter((doc) =>
                    matchesStateWideUnifiedAlert(
                        {
                            source: doc.source,
                            location: doc.location,
                            description: doc.description,
                            name: doc.name,
                            instructions: doc.instructions,
                            lat: doc.lat,
                            lng: doc.lng,
                        },
                        jurisdiction.stateRaw,
                    ),
                );
            } else {
                const candidates = await getCurrentEventsForJurisdiction(jurisdiction);
                docs = await filterUnifiedEventDocsForJurisdiction(candidates, jurisdiction);
            }
        } else {
            const u = await User.findById(options.userId).select('state').lean();
            const stateRaw = typeof u?.state === 'string' ? u.state.trim() : '';
            docs = await getCurrentEvents();
            if (stateRaw) {
                docs = filterDocsForSubAdminState(docs, stateRaw);
            }
        }
    } else {
        docs = await getCurrentEvents();
    }

    const rawCards = docsToLegacyCards(docs);
    const preferState = await resolvePreferStateForSession(options.userId, role);
    const cards = await enrichAlignedCardsWithMapCoordinates(rawCards, preferState);

    const entry: FeedCacheEntry = {
        docs,
        cards,
        expiresAt: Date.now() + FEED_CACHE_TTL_MS,
    };
    feedCache.set(key, entry);
    return entry;
}

/**
 * Live unified events for this session — same rows as Alerts & Communication.
 * Sub-admins: radius/county license = alerts inside coverage; state license = full state (same as mobile).
 */
export async function fetchAlignedUnifiedEventDocsForSession(options: {
    userId?: string;
    role: string;
    syncFeeds?: boolean;
}): Promise<UnifiedEventDoc[]> {
    const entry = await loadAlignedUnifiedEvents({
        ...options,
        syncFeeds: options.syncFeeds ?? false,
    });
    return entry.docs;
}

/**
 * Live unified event cards after optional feed sync + sub-admin jurisdiction filter.
 * Pass `syncFeeds: true` only from Alerts & Communication (throttled upstream refresh).
 */
export async function fetchAlignedUnifiedEventFeed(options: {
    userId?: string;
    role: string;
    syncFeeds?: boolean;
}): Promise<any[]> {
    const entry = await loadAlignedUnifiedEvents({
        ...options,
        syncFeeds: options.syncFeeds ?? false,
    });
    return entry.cards;
}

/** Single load for docs + legacy cards (summary / enrichment — avoids duplicate DB reads). */
export async function loadAlignedUnifiedEventBundle(options: {
    userId?: string;
    role: string;
    syncFeeds?: boolean;
}): Promise<FeedCacheEntry> {
    return loadAlignedUnifiedEvents({
        ...options,
        syncFeeds: options.syncFeeds ?? false,
    });
}

/** @deprecated Use `fetchAlignedUnifiedEventFeed` */
export const fetchAlignedAlertCommunicationFeed = fetchAlignedUnifiedEventFeed;

/**
 * Incident rows for Population at Risk KPI.
 * Sub-admins: all current events in their **state** (not license-radius only), so users in the
 * license area can match statewide alerts (e.g. Phoenix users vs AZ incidents, not only San Carlos).
 * Super-admin / others: same nationwide feed as operational aligned feed.
 */
export async function fetchPopulationAtRiskAlignedEventFeed(options: {
    userId?: string;
    role: string;
}): Promise<Record<string, unknown>[]> {
    if (options.userId) {
        const u = await User.findById(options.userId).select('email').lean();
        const demoCtx = await resolveDemoSessionContext(
            options.userId,
            u?.email as string | undefined,
        );
        if (demoCtx) {
            const demo = getDemoFeedEntry();
            return demo.cards;
        }
    }

    const role = String(options.role ?? '').toLowerCase();

    if (role === 'sub-admin' && options.userId) {
        const u = await User.findById(options.userId).select('state').lean();
        const stateRaw = typeof u?.state === 'string' ? u.state.trim() : '';
        let docs = await getCurrentEvents();
        if (stateRaw) {
            docs = filterDocsForSubAdminState(docs, stateRaw);
        }
        return docsToLegacyCards(docs);
    }

    const docs = await getCurrentEvents();
    return docsToLegacyCards(docs);
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

/** Canonical incident stats — same row set as Alerts & Communication list. */
export function alignedIncidentStatsFromCards(cards: Record<string, unknown>[]) {
    const count = cards.length;
    const { major, minor } = majorMinorFromAlignedAlerts(cards);
    return {
        alignedEventCount: count,
        incident_distribution: incidentDistributionFromAlignedAlerts(cards),
        major_incidents: major,
        minor_incidents: minor,
    };
}
