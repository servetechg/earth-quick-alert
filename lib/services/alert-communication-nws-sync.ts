/**
 * Sync National Weather Service active alerts into `AlertCommunication` for the Alerts & Communication admin UI.
 */

import { format, formatDistanceToNow } from 'date-fns';
import type { WeatherAlert as APIWeatherAlert } from '@/lib/types/api-alerts';
import { AlertSeverity } from '@/lib/types/api-alerts';
import { weatherAPI } from '@/lib/services/weather-api';
import { buildUnifiedEventFromNwsAlert } from '@/lib/unified-event/build-from-nws';
import { upsertAndPruneUnifiedEvents } from '@/lib/unified-event/repository';

function syncCoordinates(): { lat: number; lon: number } {
    const lat = parseFloat(process.env.NWS_ALERT_SYNC_LAT ?? '41.8781');
    const lon = parseFloat(process.env.NWS_ALERT_SYNC_LON ?? '-87.6298');
    return {
        lat: Number.isFinite(lat) ? lat : 41.8781,
        lon: Number.isFinite(lon) ? lon : -87.6298,
    };
}

/**
 * `national` (default) — all active USA alerts via paginated `/alerts/active`.
 * `point` — only alerts affecting `NWS_ALERT_SYNC_LAT` / `NWS_ALERT_SYNC_LON`.
 */
function useNwsNationwideSync(): boolean {
    const scope = (process.env.NWS_ALERT_SYNC_SCOPE ?? 'national').toLowerCase().trim();
    if (scope === 'point' || scope === 'local') return false;
    return true;
}

function inferWatchOrWarning(eventName: string): 'Watch' | 'Warning' {
    return /\bwatch\b/i.test(eventName) ? 'Watch' : 'Warning';
}

function inferIconType(eventName: string): 'triangle' | 'lightning' | 'cloud' {
    const e = eventName.toLowerCase();
    if (/tornado|thunderstorm|severe|lightning|squall/.test(e)) return 'lightning';
    if (
        /flood|rain|snow|winter|hurricane|tropical|marine|coastal|blizzard|ice|freeze|tsunami|cyclone|waterspout/.test(
            e
        )
    ) {
        return 'cloud';
    }
    return 'triangle';
}

function severityToLabel(s: AlertSeverity): string {
    switch (s) {
        case AlertSeverity.EXTREME:
            return 'Extreme';
        case AlertSeverity.SEVERE:
        case AlertSeverity.HIGH:
            return 'High';
        case AlertSeverity.MODERATE:
            return 'Moderate';
        case AlertSeverity.LOW:
        case AlertSeverity.INFO:
        default:
            return 'Moderate';
    }
}

function formatExpires(expiresIso?: string): string {
    if (!expiresIso) return 'See alert text';
    try {
        return format(new Date(expiresIso), 'h:mm a');
    } catch {
        return 'Unknown';
    }
}

function formatIssued(sentIso: string): string {
    try {
        return formatDistanceToNow(new Date(sentIso), { addSuffix: true });
    } catch {
        return 'recently';
    }
}

const DESC_MAX = 140;
const BULLET_MAX = 96;

const DESC_TRAILING_JUNK = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'but',
    'by',
    'for',
    'from',
    'if',
    'in',
    'nor',
    'of',
    'on',
    'or',
    'so',
    'the',
    'to',
    'with',
]);

const TRAILING_JUNK_WORDS = new Set([...DESC_TRAILING_JUNK]);

/** Shorten to max length at the last word boundary; no ellipsis. */
function shortenBulletText(text: string, maxLen: number): string {
    const t = text.trim();
    if (t.length <= maxLen) return t;
    const slice = t.slice(0, maxLen);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > 24) return slice.slice(0, lastSpace).trim();
    return slice.trim();
}

function stripTrailingDanglers(s: string): string {
    let t = s.replace(/[,:;]\s*$/g, '').trim();
    const words = t.split(/\s+/).filter(Boolean);
    while (words.length > 1) {
        const raw = words[words.length - 1] ?? '';
        const last = raw.replace(/[^a-z']/gi, '').toLowerCase();
        if (last && TRAILING_JUNK_WORDS.has(last)) words.pop();
        else break;
    }
    return words.join(' ').trim();
}

function stripDescriptionDanglers(s: string): string {
    let t = s.trim();
    const words = t.split(/\s+/).filter(Boolean);
    while (words.length > 1) {
        const raw = words[words.length - 1] ?? '';
        const last = raw.replace(/[^a-z0-9']/gi, '').toLowerCase();
        if (last && DESC_TRAILING_JUNK.has(last)) words.pop();
        else break;
    }
    return words.join(' ').trim();
}

/** One concise line ending with a full stop; no “…” and no dangling “and”. */
function shortenDescriptionLine(raw: string): string {
    let t = raw.trim().replace(/\s+/g, ' ');
    if (!t) return 'Weather conditions may be hazardous.';

    if (/\s+and\s+/i.test(t)) {
        const andParts = t.split(/\s+and\s+/i);
        const first = andParts[0]?.trim() ?? '';
        const rest = andParts.slice(1).join(' and ').trim();
        const firstMentionsWind =
            /\b(kt|knots|mph|winds?|gusts?)\b/i.test(first) || /\bmph\b/i.test(first);
        const restIsSecondHazard =
            /\b(seas?|surf|ft\b|waves?|surge|snow|rain|ice|visibility)\b/i.test(rest);
        if (first.length >= 15 && firstMentionsWind && restIsSecondHazard) t = first;
        else if (t.length > DESC_MAX && first.length >= 12) t = first;
    }

    if (t.length > DESC_MAX) t = shortenBulletText(t, DESC_MAX);
    t = stripDescriptionDanglers(t);

    if (!/[.!?]$/.test(t)) {
        t = t.replace(/[,;]\s*$/, '');
        t = `${t}.`;
    }
    return t;
}

/** Prefer CAP `* WHAT...` line; else first headline line; else event name. */
function nwsOneLineSummary(alert: APIWeatherAlert): string {
    const full = alert.description || '';
    const whatMatch = full.match(/\*\s*WHAT\.\.\.\s*([^\n*]+)/i);
    if (whatMatch) {
        return shortenDescriptionLine(whatMatch[1]);
    }
    const headline = (alert.title || '').split('\n')[0]?.trim();
    if (headline) return shortenDescriptionLine(headline);
    return shortenDescriptionLine(alert.event || 'Weather alert');
}

function finalizeBullet(s: string): string {
    return stripTrailingDanglers(shortenBulletText(s.trim(), BULLET_MAX));
}

function explodeInstructionPhrases(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    function splitTooLong(s: string): string[] {
        const u = s.trim();
        if (u.length <= BULLET_MAX) return [finalizeBullet(u)];

        const bySemi = u.split(';').map((x) => x.trim()).filter((x) => x.length > 6);
        if (bySemi.length >= 2) return bySemi.flatMap(splitTooLong);

        const byComma = u.split(',').map((x) => x.trim()).filter((x) => x.length > 6);
        if (byComma.length >= 2) return byComma.flatMap(splitTooLong);

        const byAnd = u.split(/\s+and\s+/i).map((x) => x.trim()).filter((x) => x.length > 6);
        if (byAnd.length >= 2) return byAnd.flatMap(splitTooLong);

        const byOr = u.split(/\s+or\s+/i).map((x) => x.trim()).filter((x) => x.length > 6);
        if (byOr.length >= 2) return byOr.flatMap(splitTooLong);

        return [finalizeBullet(u)];
    }

    const sentences = normalized
        .split(/(?<=[.!?])\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 6);
    const blocks = sentences.length > 0 ? sentences : [normalized];
    return blocks.flatMap(splitTooLong);
}

function splitIntoInstructionBullets(text: string, maxBullets: number): string[] {
    const phrases = explodeInstructionPhrases(text);
    const seen = new Set<string>();
    const bullets: string[] = [];
    for (const p of phrases) {
        if (bullets.length >= maxBullets) break;
        const b = p.trim();
        if (b.length < 10) continue;
        const key = b.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        let line = b;
        if (!/[.!?]$/.test(line)) {
            line = line.replace(/[,;]\s*$/, '');
            line = `${line}.`;
        }
        bullets.push(line);
    }
    return bullets;
}

function extractInstructionsBlock(fullDescription: string): string | undefined {
    const lower = fullDescription.toLowerCase();
    const key = 'instructions:';
    const pos = lower.lastIndexOf(key);
    if (pos === -1) return undefined;
    return fullDescription.slice(pos + key.length).trim() || undefined;
}

function genericSafetyBullets(eventName: string): string[] {
    const e = eventName.toLowerCase();
    if (/heat|hot|heat index|excessive heat/i.test(e)) {
        return [
            'Drink plenty of water; take breaks in shade or A/C',
            'Limit strenuous outdoor activity during peak heating',
            'Check on seniors, children, and pets — never leave anyone in a closed vehicle',
        ];
    }
    if (/frost|freeze|cold|wind chill|blizzard|winter|ice/i.test(e)) {
        return [
            'Limit exposure to cold and wind; dress in layers',
            'Protect pipes, plants, and pets from freezing conditions',
            'Allow extra travel time and watch for icy surfaces',
        ];
    }
    if (/flood|flash flood|coastal|marine|surf|rip|small craft|gale|hurricane|tropical|tsunami/i.test(e)) {
        return [
            'Avoid flooded roads and fast-moving water',
            'Follow evacuation or harbor orders if issued',
            'Stay tuned to official updates and move to safer ground if needed',
        ];
    }
    if (/tornado|severe thunderstorm|squall|lightning/i.test(e)) {
        return [
            'Seek sturdy shelter indoors away from windows',
            'Avoid travel and exposed areas until the threat passes',
            'Monitor warnings and have multiple ways to receive alerts',
        ];
    }
    if (/fire|red flag|wildfire|smoke/i.test(e)) {
        return [
            'Follow evacuation routes promptly if ordered',
            'Reduce ignition risks and avoid outdoor burning where restricted',
            'Keep emergency supplies ready and stay informed on fire spread',
        ];
    }
    if (/wind/i.test(e)) {
        return [
            'Secure loose outdoor objects that could blow away',
            'Use caution driving, especially in high-profile vehicles',
            'Stay alert for downed limbs or power lines',
        ];
    }
    return [
        'Stay informed using trusted weather and emergency sources',
        'Avoid unnecessary travel in the worst-affected areas',
        'Have a plan and supplies ready if conditions worsen',
    ];
}

function ensureBulletEndsWithStop(lines: string[]): string[] {
    return lines.map((b) => {
        const t = b.trim();
        if (/[.!?]$/.test(t)) return t;
        return `${t.replace(/[,;]\s*$/, '')}.`;
    });
}

/** Up to three short actionable lines for UI bullets. */
export function buildNwsInstructionBullets(
    capInstruction: string | undefined,
    fullDescription: string,
    eventName: string
): string[] {
    let src = capInstruction?.trim();
    if (!src) src = extractInstructionsBlock(fullDescription);

    let parsed = src ? splitIntoInstructionBullets(src, 3) : [];

    if (parsed.length >= 3) return ensureBulletEndsWithStop(parsed.slice(0, 3));

    const fallback = genericSafetyBullets(eventName);
    const merged = [...parsed];
    for (const line of fallback) {
        if (merged.length >= 3) break;
        const dup = merged.some((m) => m.toLowerCase().slice(0, 40) === line.toLowerCase().slice(0, 40));
        if (!dup) merged.push(line);
    }
    return ensureBulletEndsWithStop(merged.slice(0, 3));
}

/**
 * Pull active NWS alerts (nationwide by default, or single-point if `NWS_ALERT_SYNC_SCOPE=point`), upsert Mongo docs, prune stale NWS rows.
 */
export async function syncNwsAlertsToAlertCommunication(): Promise<{ upserted: number; removed: number }> {
    const alerts: APIWeatherAlert[] = useNwsNationwideSync()
        ? await weatherAPI.fetchNWSActiveAlertsNationwide()
        : await weatherAPI.fetchNWSActiveAlertsForPoint(syncCoordinates().lat, syncCoordinates().lon);

    const events = [];

    for (const a of alerts) {
        if (!a.id) continue;

        const eventName = a.event || a.title || 'Weather Alert';
        const location =
            a.areaDesc ||
            (a.affectedAreas && a.affectedAreas.length > 0
                ? a.affectedAreas.join(', ')
                : 'See affected areas in description');

        const issuedAt = formatIssued(a.timestamp);
        const expiresAt = formatExpires(a.expiresAt);
        const description = nwsOneLineSummary(a);
        const instructions = buildNwsInstructionBullets(a.instruction, a.description || '', eventName);

        events.push(
            buildUnifiedEventFromNwsAlert(a, {
                eventName,
                location,
                issuedAt,
                expiresAt,
                description,
                instructions,
                severity: severityToLabel(a.severity),
                type: inferWatchOrWarning(eventName),
                iconType: inferIconType(eventName),
            }),
        );
    }

    return upsertAndPruneUnifiedEvents('nws', events);
}

let lastSyncMs = 0;
const DEFAULT_MIN_INTERVAL_MS = 90_000;

/** Rate-limit sync when called from hot paths (e.g. GET). */
export async function syncNwsAlertsIfStale(): Promise<void> {
    if (process.env.NWS_ALERT_SYNC_ENABLED === 'false') return;

    const minMs = parseInt(process.env.NWS_SYNC_MIN_INTERVAL_MS ?? `${DEFAULT_MIN_INTERVAL_MS}`, 10);
    const now = Date.now();
    if (now - lastSyncMs < minMs) return;

    lastSyncMs = now;
    await syncNwsAlertsToAlertCommunication().catch((err) => {
        console.error('[nws-sync]', err);
        lastSyncMs = 0;
    });
}

/** Bypass throttle (e.g. POST /api/alerts-communication refresh). */
export async function syncNwsAlertsNow(): Promise<{ upserted: number; removed: number }> {
    lastSyncMs = Date.now();
    return syncNwsAlertsToAlertCommunication();
}
