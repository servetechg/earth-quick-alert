import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes';
import { normalizeStateToUsps, textMentionsUsState } from '@/lib/utils/us-state-usps';

export function isNationwideRiskIngestState(stateCd: string): boolean {
    const s = stateCd.toLowerCase();
    return s === 'us' || s === 'usa' || s === 'all' || s === 'national';
}

export function uspsFromRiskStateCd(stateCd: string): string | null {
    if (isNationwideRiskIngestState(stateCd)) return null;
    const raw = stateCd.trim();
    if (raw.length === 2) return raw.toUpperCase();
    return normalizeStateToUsps(raw);
}

export function filterTextLinesForState(lines: string[], usps: string): string[] {
    return lines.filter((line) => textMentionsUsState(line, usps));
}

export function femaRowMatchesState(row: { state?: string }, usps: string): boolean {
    const st = String(row.state ?? '')
        .trim()
        .toUpperCase();
    if (!st) return false;
    if (st === usps) return true;
    return textMentionsUsState(st, usps);
}

function earthquakeInState(
    place: string,
    coords: number[] | undefined,
    usps: string,
): boolean {
    if (textMentionsUsState(place, usps)) return true;
    if (Array.isArray(coords) && coords.length >= 2) {
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
            return pointInUsStateBBox(lon, lat, usps);
        }
    }
    return false;
}

type EqRanked = {
    f: unknown;
    p: Record<string, unknown>;
    c: number[];
};

function rankUsEarthquakes(feats: unknown[]): EqRanked[] {
    const inRoughUs = (lon: number, lat: number) => lon >= -170 && lon <= -60 && lat >= 15 && lat <= 72;
    return feats
        .map((f) => ({
            f,
            p: (f as { properties?: Record<string, unknown> })?.properties ?? {},
            c: (f as { geometry?: { coordinates?: number[] } })?.geometry?.coordinates as number[],
        }))
        .filter(({ c, p }) => Array.isArray(c) && c.length >= 2 && p?.mag != null)
        .filter(({ c }) => inRoughUs(c[0]!, c[1]!))
        .sort((a, b) => (Number(b.p.mag) || 0) - (Number(a.p.mag) || 0));
}

/** Nationwide: top US events. State: only in-state (place or bbox); never fall back to other states. */
export function pickEarthquakeFeaturesForIngest(feats: unknown[], stateCd: string, cap = 15): unknown[] {
    const ranked = rankUsEarthquakes(feats);
    if (isNationwideRiskIngestState(stateCd)) {
        return ranked.slice(0, cap).map(({ f }) => f);
    }
    const usps = uspsFromRiskStateCd(stateCd);
    if (!usps) return ranked.slice(0, cap).map(({ f }) => f);
    return ranked
        .filter(({ p, c }) => earthquakeInState(String(p.place ?? ''), c, usps))
        .slice(0, cap)
        .map(({ f }) => f);
}

export function formatEarthquakeLinesFromFeatures(features: unknown[]): string {
    const lines = features.map((f) => {
        const p = (f as { properties?: Record<string, unknown> })?.properties ?? {};
        // USGS `time` is epoch milliseconds (a number); String() made `new Date` parse a
        // digit-string and yield "Invalid Date". Convert numerically and guard against NaN.
        const epochMs = p.time != null ? Number(p.time) : NaN;
        const t = Number.isFinite(epochMs)
            ? new Date(epochMs).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'UTC',
              }) + ' UTC'
            : 'time unavailable';
        const mag = Number(p.mag);
        const magTxt = Number.isFinite(mag) ? mag.toFixed(1).replace(/\.0$/, '') : String(p.mag ?? '?');
        const place = p.place ?? 'unspecified epicenter';
        return `Earthquake magnitude M${magTxt} — ${place} · ${t}.`;
    });
    return lines.length ? lines.join('\n') : 'No earthquakes in M2.5+ past-day feed for this state AOI.';
}

export function filterFirmsPointsForState(
    points: { lat: string; lon: string }[],
    usps: string,
): { lat: string; lon: string }[] {
    return points.filter(({ lat, lon }) => {
        const la = Number(lat);
        const lo = Number(lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
        return pointInUsStateBBox(lo, la, usps);
    });
}
