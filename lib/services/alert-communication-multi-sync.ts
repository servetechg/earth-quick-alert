/**
 * Sync multi-source hazard alerts (USGS, NWPS, NASA FIRMS, InciWeb, FEMA OpenFEMA) into `UnifiedEvent`
 * for the Alerts & Communication admin UI. Mirrors the pattern of `alert-communication-nws-sync.ts`
 * but reuses the hazard pipeline normalizers where applicable.
 */

import { format, formatDistanceToNow } from 'date-fns';
import type { UnifiedEvent, EventType, AlertLevel } from '@/lib/normalization/types';
import { getUSGSData, getNOAAForecast, getNwpsGauge } from '@/lib/services/flood-service';
import {
    getFIRMSData,
    getInciWebData,
    FIRMS_DEFAULT_BBOX,
    type FIRMSRecord,
    type InciWebIncident,
} from '@/lib/services/wildfire-service';
import type { USGSTimeSeries } from '@/lib/services/flood-service';
import { normalizeUSGS } from '@/lib/normalization/sources/normalize-usgs';
import { normalizeFIRMS } from '@/lib/normalization/sources/normalize-firms';
import { normalizeInciWeb } from '@/lib/normalization/sources/normalize-inciweb';
import { fetchOpenFemaRecentDisasters, type OpenFemaDisasterRecord } from '@/lib/services/openfema-service';
import {
    summarizeNwpsGauge,
    summarizeNwpsStreamflow,
    type NwpsMappedSummary,
} from '@/lib/services/nwps-reach-mapper';
import {
    DEFAULT_NWPS_GAUGE_LIDS_NATIONWIDE,
    DEFAULT_USGS_SITES_NATIONWIDE,
} from '@/lib/constants/nationwide-alert-feed-defaults';
import { buildNwsInstructionBullets } from '@/lib/services/alert-communication-nws-sync';
import { buildUnifiedEventFromMappedDoc } from '@/lib/unified-event/build-from-mapped';
import { upsertAndPruneUnifiedEvents } from '@/lib/unified-event/repository';

type Source = 'usgs' | 'firms' | 'inciweb' | 'nwps' | 'fema';

interface SyncStats {
    upserted: number;
    removed: number;
    skipped: number;
}

interface MappedDoc {
    externalId: string;
    name: string;
    type: 'Watch' | 'Warning';
    iconType: 'triangle' | 'lightning' | 'cloud';
    location: string;
    issuedAt: string;
    expiresAt: string;
    status: string;
    description: string;
    severity: string;
}

/** Elevated hydrology / wildfire signals only (unless USGS includes normal gauges). */
const ALERT_LEVELS_TO_SHOW: AlertLevel[] = ['watch', 'warning', 'emergency'];

function usgsAlertLevelsAllowed(): AlertLevel[] {
    if (process.env.USGS_SYNC_INCLUDE_NORMAL === 'false') {
        return ALERT_LEVELS_TO_SHOW;
    }
    return ['normal', 'watch', 'warning', 'emergency'];
}

/** Most FIRMS pixels map to `normal` brightness; include them unless explicitly disabled. */
function firmsAlertLevelsAllowed(): AlertLevel[] {
    if (process.env.FIRMS_SYNC_INCLUDE_NORMAL === 'false') {
        return ALERT_LEVELS_TO_SHOW;
    }
    return ['normal', 'watch', 'warning', 'emergency'];
}

function alertLevelToType(level: AlertLevel): 'Watch' | 'Warning' {
    if (level === 'warning' || level === 'emergency') return 'Warning';
    return 'Watch';
}

function eventTypeToIcon(type: EventType): 'triangle' | 'lightning' | 'cloud' {
    if (type === 'flood') return 'cloud';
    if (type === 'wildfire') return 'lightning';
    return 'triangle';
}

function eventDisplayName(event: UnifiedEvent): string {
    const typeLabel =
        event.event_type === 'flood'
            ? 'Flood'
            : event.event_type === 'wildfire'
                ? 'Wildfire'
                : 'Earthquake';
    const levelLabel =
        event.alert_level === 'emergency'
            ? 'Emergency'
            : event.alert_level === 'warning'
                ? 'Warning'
                : 'Watch';
    return `${typeLabel} ${levelLabel}`;
}

function severityScoreToLabel(score: number): string {
    if (score >= 75) return 'Extreme';
    if (score >= 50) return 'High';
    return 'Moderate';
}

function formatIssued(iso: string): string {
    try {
        return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
        return 'recently';
    }
}

function formatExpires(iso?: string): string {
    if (!iso) return 'See alert text';
    try {
        return format(new Date(iso), 'h:mm a');
    } catch {
        return 'See alert text';
    }
}

function coordString(lat: number, lon: number): string {
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

// ─── USGS ──────────────────────────────────────────────────────────────

function usgsSiteCode(series: USGSTimeSeries): string | null {
    return series.sourceInfo.siteCode?.[0]?.value ?? null;
}

function usgsSiteName(series: USGSTimeSeries): string {
    return series.sourceInfo.siteName?.trim() || 'USGS gauge';
}

function mapUSGS(series: USGSTimeSeries): MappedDoc | null {
    const siteCode = usgsSiteCode(series);
    if (!siteCode) return null;

    const events = normalizeUSGS(series);
    const event = events[0];
    if (!event) return null;
    if (!usgsAlertLevelsAllowed().includes(event.alert_level)) return null;

    return {
        externalId: `usgs:${siteCode}`,
        name: eventDisplayName(event),
        type: alertLevelToType(event.alert_level),
        iconType: eventTypeToIcon(event.event_type),
        location: usgsSiteName(series),
        issuedAt: formatIssued(event.valid_at || event.ingested_at),
        expiresAt: 'See alert text',
        status: 'Take Action',
        description: event.description,
        severity: severityScoreToLabel(event.severity_score),
    };
}

// ─── FIRMS ─────────────────────────────────────────────────────────────

function firmsExternalId(record: FIRMSRecord): string {
    const lat = parseFloat(record.latitude).toFixed(4);
    const lon = parseFloat(record.longitude).toFixed(4);
    const date = (record.acq_date ?? '').replace(/[^0-9]/g, '');
    const time = (record.acq_time ?? '').replace(/[^0-9]/g, '').padStart(4, '0');
    return `firms:${lat}:${lon}:${date}${time}`;
}

function mapFIRMS(record: FIRMSRecord): MappedDoc | null {
    if (!record.latitude || !record.longitude) return null;
    const events = normalizeFIRMS(record);
    const event = events[0];
    if (!event) return null;
    if (!firmsAlertLevelsAllowed().includes(event.alert_level)) return null;

    return {
        externalId: firmsExternalId(record),
        name: eventDisplayName(event),
        type: alertLevelToType(event.alert_level),
        iconType: eventTypeToIcon(event.event_type),
        location: `Hotspot near ${coordString(event.geo_coordinates.lat, event.geo_coordinates.lon)}`,
        issuedAt: formatIssued(event.valid_at || event.ingested_at),
        expiresAt: formatExpires(event.valid_at),
        status: 'Take Action',
        description: event.description,
        severity: severityScoreToLabel(event.severity_score),
    };
}

// ─── InciWeb ───────────────────────────────────────────────────────────

function inciWebExternalId(incident: InciWebIncident): string {
    if (incident.link) return `inciweb:${incident.link}`;
    return `inciweb:${incident.title}:${incident.pubDate}`;
}

function inciWebLocation(incident: InciWebIncident): string {
    const titleMatch = incident.title.match(/\(([^)]+)\)\s*$/);
    if (titleMatch) return titleMatch[1];
    return coordString(incident.lat, incident.lon);
}

function mapInciWeb(incident: InciWebIncident): MappedDoc | null {
    const events = normalizeInciWeb(incident);
    const event = events[0];
    if (!event) return null;
    if (!ALERT_LEVELS_TO_SHOW.includes(event.alert_level)) return null;

    return {
        externalId: inciWebExternalId(incident),
        name: eventDisplayName(event),
        type: alertLevelToType(event.alert_level),
        iconType: eventTypeToIcon(event.event_type),
        location: inciWebLocation(incident),
        issuedAt: formatIssued(event.valid_at || event.ingested_at),
        expiresAt: formatExpires(event.valid_at),
        status: 'Take Action',
        description: event.description,
        severity: severityScoreToLabel(event.severity_score),
    };
}

// ─── Upsert helper ─────────────────────────────────────────────────────

async function upsertAndPrune(source: Source, docs: MappedDoc[]): Promise<SyncStats> {
    const events = docs.map((d) =>
        buildUnifiedEventFromMappedDoc(source, d, {
            instructions: buildNwsInstructionBullets(undefined, d.description, d.name),
        }),
    );
    const stats = await upsertAndPruneUnifiedEvents(source, events);
    return { ...stats, skipped: 0 };
}

// ─── Public sync API ───────────────────────────────────────────────────

function parseSites(env: string | undefined, fallback: string[]): string[] {
    if (!env) return fallback;
    const parts = env
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts : fallback;
}

function parseFloatEnv(env: string | undefined, fallback: number): number {
    if (!env) return fallback;
    const n = parseFloat(env);
    return Number.isFinite(n) ? n : fallback;
}

function firmsBboxFromEnv(): string {
    return process.env.FIRMS_BBOX?.trim() || FIRMS_DEFAULT_BBOX;
}

/** NASA FIRMS Area API allows day range 1–5 only (larger values return 400). */
function firmsLookbackDays(): number {
    const n = parseFloatEnv(process.env.FIRMS_DAYS, 1);
    return Math.max(1, Math.min(5, Math.round(n)));
}

export async function syncUSGSAlerts(): Promise<SyncStats> {
    const sites = parseSites(process.env.USGS_SITES, DEFAULT_USGS_SITES_NATIONWIDE);
    const series = await getUSGSData(sites);
    const docs = series.map(mapUSGS).filter((d): d is MappedDoc => d != null);
    return upsertAndPrune('usgs', docs);
}

export async function syncFIRMSAlerts(): Promise<SyncStats> {
    const records = await getFIRMSData(
        firmsBboxFromEnv(),
        firmsLookbackDays(),
        process.env.FIRMS_SOURCE?.trim() || 'VIIRS_SNPP_NRT'
    );
    const maxCards = Math.max(
        1,
        Math.min(5000, Math.round(parseFloatEnv(process.env.FIRMS_MAX_CARDS, 150)))
    );
    const sorted = [...records].sort(
        (a, b) => parseFloat(b.brightness ?? '0') - parseFloat(a.brightness ?? '0')
    );
    const docs = sorted
        .map(mapFIRMS)
        .filter((d): d is MappedDoc => d != null)
        .slice(0, maxCards);
    return upsertAndPrune('firms', docs);
}

export async function syncInciWebAlerts(): Promise<SyncStats> {
    if (process.env.INCIWEB_SYNC_ENABLED === 'false') {
        return { upserted: 0, removed: 0, skipped: 0 };
    }
    const incidents = await getInciWebData();
    const docs = incidents.map(mapInciWeb).filter((d): d is MappedDoc => d != null);
    return upsertAndPrune('inciweb', docs);
}

function parseNwpsReachIds(): string[] {
    const raw = process.env.NWPS_REACH_IDS?.trim();
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseNwpsGaugeLids(): string[] {
    const raw = process.env.NWPS_GAUGE_LIDS?.trim();
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function nwpsDocFromSummary(
    externalId: string,
    summary: NwpsMappedSummary | null,
    nowIso: string
): MappedDoc | null {
    if (!summary) return null;
    return {
        externalId,
        name: summary.cardTitle,
        type: summary.severityHint === 'Extreme' ? 'Warning' : 'Watch',
        iconType: 'cloud',
        location: summary.placeLabel,
        issuedAt: formatIssued(nowIso),
        expiresAt: 'See gauge / NWPS',
        status: 'Take Action',
        description: summary.detail,
        severity:
            summary.severityHint === 'Extreme'
                ? 'Extreme'
                : summary.severityHint === 'High'
                  ? 'High'
                  : 'Moderate',
    };
}

export async function syncNwpsAlerts(): Promise<SyncStats> {
    if (process.env.NWPS_SYNC_ENABLED === 'false') {
        return { upserted: 0, removed: 0, skipped: 0 };
    }
    const reaches = parseNwpsReachIds();
    let gaugeLids = parseNwpsGaugeLids();
    if (
        reaches.length === 0 &&
        gaugeLids.length === 0 &&
        process.env.NWPS_SYNC_DEFAULT_GAUGES !== 'false'
    ) {
        gaugeLids = [...DEFAULT_NWPS_GAUGE_LIDS_NATIONWIDE];
    }
    if (reaches.length === 0 && gaugeLids.length === 0) {
        return { upserted: 0, removed: 0, skipped: 0 };
    }

    const docs: MappedDoc[] = [];
    const nowIso = new Date().toISOString();

    for (const reachId of reaches) {
        try {
            const raw = await getNOAAForecast(reachId);
            const summary = summarizeNwpsStreamflow(reachId, raw);
            const doc = nwpsDocFromSummary(`nwps:${reachId}`, summary, nowIso);
            if (doc) docs.push(doc);
        } catch (err) {
            console.error(`[nwps-sync:${reachId}]`, err instanceof Error ? err.message : err);
        }
    }

    for (const lid of gaugeLids) {
        try {
            const raw = await getNwpsGauge(lid);
            const summary = summarizeNwpsGauge(lid, raw);
            const doc = nwpsDocFromSummary(`nwps:gauge:${lid}`, summary, nowIso);
            if (doc) docs.push(doc);
        } catch (err) {
            console.error(`[nwps-sync:gauge:${lid}]`, err instanceof Error ? err.message : err);
        }
    }

    return upsertAndPrune('nwps', docs);
}

/** Title-case FEMA’s often ALL-CAPS declaration titles for card display. */
function formatFemaDeclarationTitle(raw: string): string {
    const s = raw.trim();
    if (!s) return 'Disaster declaration';
    if (s.length > 4 && s === s.toUpperCase()) {
        return s
            .toLowerCase()
            .split(/\s+/)
            .map((word) =>
                word
                    .split('-')
                    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
                    .join('-')
            )
            .join(' ');
    }
    return s;
}

function mapFemaDeclaration(r: OpenFemaDisasterRecord): MappedDoc {
    const ext = r.id
        ? `fema:${r.id}`
        : `fema:DR-${r.disasterNumber}-${(r.designatedArea ?? 'area').replace(/\s+/g, '-').slice(0, 80)}`;
    const loc =
        [r.designatedArea, r.state].filter(Boolean).join(', ') ||
        r.state ||
        'United States';
    const titleRaw = r.declarationTitle || r.incidentType || 'Disaster declaration';
    const decl = r.femaDeclarationString ?? `DR-${r.disasterNumber ?? '?'}`;
    const incident = (r.incidentType ?? '').toLowerCase();
    const icon: MappedDoc['iconType'] =
        /flood|hurricane|typhoon|rain|coastal|storm surge/.test(incident) ? 'cloud' : 'triangle';

    return {
        externalId: ext,
        name: formatFemaDeclarationTitle(titleRaw),
        type: 'Warning',
        iconType: icon,
        location: loc,
        issuedAt: formatIssued(r.declarationDate ?? new Date().toISOString()),
        expiresAt: r.incidentEndDate ? formatExpires(r.incidentEndDate) : 'See OpenFEMA',
        status: 'Take Action',
        description: [
            `Declaration: ${decl}${r.state ? ` · ${r.state}` : ''}`,
            r.incidentType && `Type: ${r.incidentType}`,
        ]
            .filter(Boolean)
            .join(' — '),
        severity: 'High',
    };
}

export async function syncFemaOpenAlerts(): Promise<SyncStats> {
    if (process.env.FEMA_OPEN_SYNC_ENABLED === 'false') {
        return { upserted: 0, removed: 0, skipped: 0 };
    }
    const limit = Math.min(
        100,
        Math.max(5, parseInt(process.env.FEMA_OPEN_TOP ?? '25', 10))
    );
    const rows = await fetchOpenFemaRecentDisasters(limit);
    const docs = rows.map(mapFemaDeclaration);
    return upsertAndPrune('fema', docs);
}

export type AllSourcesSyncReport = {
    usgs?: SyncStats | { error: string };
    firms?: SyncStats | { error: string };
    inciweb?: SyncStats | { error: string };
    nwps?: SyncStats | { error: string };
    fema?: SyncStats | { error: string };
};

async function runSafely(label: Source | string, fn: () => Promise<SyncStats>) {
    try {
        return await fn();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[multi-source-sync:${label}]`, message);
        return { error: message };
    }
}

/** Force fetch + upsert from every supplemental source (no throttle). */
export async function syncAllSourcesNow(): Promise<AllSourcesSyncReport> {
    const [usgs, firms, inciweb, nwps, fema] = await Promise.all([
        runSafely('usgs', syncUSGSAlerts),
        runSafely('firms', syncFIRMSAlerts),
        runSafely('inciweb', syncInciWebAlerts),
        runSafely('nwps', syncNwpsAlerts),
        runSafely('fema', syncFemaOpenAlerts),
    ]);
    return { usgs, firms, inciweb, nwps, fema };
}

let lastMultiSyncMs = 0;
const DEFAULT_MIN_INTERVAL_MS = 5 * 60_000;

/** Rate-limit multi-source sync when called from hot paths (e.g. GET /api/alerts-communication). */
export async function syncAllSourcesIfStale(): Promise<void> {
    if (process.env.MULTI_ALERT_SYNC_ENABLED === 'false') return;

    const minMs = parseInt(
        process.env.MULTI_ALERT_SYNC_MIN_INTERVAL_MS ?? `${DEFAULT_MIN_INTERVAL_MS}`,
        10
    );
    const now = Date.now();
    if (now - lastMultiSyncMs < minMs) return;

    lastMultiSyncMs = now;
    try {
        await syncAllSourcesNow();
    } catch (err) {
        console.error('[multi-source-sync]', err);
        lastMultiSyncMs = 0;
    }
}
