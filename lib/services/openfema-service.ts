/**
 * FEMA OpenFEMA API — disaster declarations (no API key required).
 * https://www.fema.gov/about/openfema/api
 */

const OPEN_FEMA_V2 = 'https://www.fema.gov/api/open/v2';
const OPEN_FEMA_V1 = 'https://www.fema.gov/api/open/v1';

export interface OpenFemaDisasterRecord {
    id?: string;
    femaDeclarationString?: string;
    disasterNumber?: number;
    state?: string;
    declarationType?: string;
    declarationDate?: string;
    incidentType?: string;
    declarationTitle?: string;
    designatedArea?: string;
    incidentBeginDate?: string;
    incidentEndDate?: string;
    iaProgramDeclared?: boolean;
    paProgramDeclared?: boolean;
    hmProgramDeclared?: boolean;
    ihProgramDeclared?: boolean;
    designatedIncidentTypes?: string;
    fipsStateCode?: string;
    fipsCountyCode?: string;
    region?: number;
}

/** v1 — financial / IA counts keyed by `disasterNumber`. */
export interface FemaWebDisasterSummary {
    id?: string;
    disasterNumber?: number;
    totalNumberIaApproved?: number;
    totalAmountIhpApproved?: number;
    totalAmountHaApproved?: number;
    totalAmountOnaApproved?: number;
    totalObligatedAmountPa?: number;
    totalObligatedAmountCatAb?: number;
    totalObligatedAmountCatC2g?: number;
    totalObligatedAmountHmgp?: number;
    paLoadDate?: string;
    iaLoadDate?: string;
    lastRefresh?: string;
}

interface OpenFemaDisasterResponse {
    DisasterDeclarationsSummaries?: OpenFemaDisasterRecord[];
    metadata?: { count?: number };
}

interface FemaWebSummaryResponse {
    FemaWebDisasterSummaries?: FemaWebDisasterSummary[];
    metadata?: { count?: number };
}

function upstreamUa(): string {
    return (
        process.env.OPENFEMA_USER_AGENT?.trim() ||
        process.env.NWS_USER_AGENT?.trim() ||
        'Ready2Go-EmergencyDashboard/1.0 (earthquick; openfema)'
    );
}

function femaHeaders(): HeadersInit {
    return { Accept: 'application/json', 'User-Agent': upstreamUa() };
}

function dedupeDeclarations(rows: OpenFemaDisasterRecord[]): OpenFemaDisasterRecord[] {
    const seen = new Set<string>();
    const out: OpenFemaDisasterRecord[] = [];
    for (const r of rows) {
        const key = r.id ?? `${r.disasterNumber}-${r.designatedArea}-${r.declarationDate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
    }
    return out;
}

async function openFemaGetJson<T>(url: string, retries = 3): Promise<T> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < retries; attempt += 1) {
        try {
            const res = await fetch(url, { cache: 'no-store', headers: femaHeaders() });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                const retryable = res.status === 503 || res.status === 429 || res.status >= 500;
                if (retryable && attempt < retries - 1) {
                    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
                    continue;
                }
                throw new Error(
                    `OpenFEMA fetch failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`,
                );
            }
            return res.json() as Promise<T>;
        } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e));
            if (attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            }
        }
    }
    throw lastErr ?? new Error('OpenFEMA fetch failed');
}

export function openFemaPast3MonthsSinceDate(from = new Date()): string {
    const d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() - 3);
    return d.toISOString().slice(0, 10);
}

/**
 * Paginated `DisasterDeclarationsSummaries` since `YYYY-MM-DD` (v2).
 */
export async function fetchOpenFemaDisastersSince(
    sinceIsoDate: string,
    options?: { pageSize?: number; maxPages?: number },
): Promise<OpenFemaDisasterRecord[]> {
    const since = sinceIsoDate.trim().slice(0, 10);
    const pageSize = Math.min(1000, Math.max(100, options?.pageSize ?? 500));
    const maxPages = Math.max(1, options?.maxPages ?? parseInt(process.env.OPENFEMA_MAX_PAGES ?? '20', 10));
    const filter = encodeURIComponent(`declarationDate ge '${since}'`);
    const all: OpenFemaDisasterRecord[] = [];
    let skip = 0;

    for (let page = 0; page < maxPages; page += 1) {
        const url =
            `${OPEN_FEMA_V2}/DisasterDeclarationsSummaries?$filter=${filter}` +
            `&$orderby=declarationDate%20desc&$top=${pageSize}&$skip=${skip}`;
        const json = await openFemaGetJson<OpenFemaDisasterResponse>(url);
        const batch = json.DisasterDeclarationsSummaries ?? [];
        if (batch.length === 0) break;
        all.push(...batch);
        if (batch.length < pageSize) break;
        skip += batch.length;
    }

    return dedupeDeclarations(all);
}

/** Past 3 months of declaration rows (v2). */
export async function fetchOpenFemaDisastersPast3Months(): Promise<OpenFemaDisasterRecord[]> {
    return fetchOpenFemaDisastersSince(openFemaPast3MonthsSinceDate());
}

/**
 * All `FemaWebDisasterSummaries` (v1) — financial IA/PA/HMGP totals by disaster number.
 */
export async function fetchFemaWebDisasterSummaries(): Promise<FemaWebDisasterSummary[]> {
    const pageSize = Math.min(5000, Math.max(500, parseInt(process.env.OPENFEMA_WEB_PAGE_SIZE ?? '2000', 10)));
    const maxPages = Math.max(1, parseInt(process.env.OPENFEMA_WEB_MAX_PAGES ?? '5', 10));
    const all: FemaWebDisasterSummary[] = [];
    let skip = 0;

    for (let page = 0; page < maxPages; page += 1) {
        const url = `${OPEN_FEMA_V1}/FemaWebDisasterSummaries?$orderby=disasterNumber%20desc&$top=${pageSize}&$skip=${skip}`;
        const json = await openFemaGetJson<FemaWebSummaryResponse>(url);
        const batch = json.FemaWebDisasterSummaries ?? [];
        if (batch.length === 0) break;
        all.push(...batch);
        if (batch.length < pageSize) break;
        skip += batch.length;
    }

    const byNum = new Map<number, FemaWebDisasterSummary>();
    for (const row of all) {
        if (row.disasterNumber == null) continue;
        byNum.set(row.disasterNumber, row);
    }
    return [...byNum.values()];
}

/** Map disasterNumber → web financial summary. */
export async function fetchFemaWebSummaryByDisasterNumber(): Promise<
    Map<number, FemaWebDisasterSummary>
> {
    const rows = await fetchFemaWebDisasterSummaries();
    const map = new Map<number, FemaWebDisasterSummary>();
    for (const r of rows) {
        if (r.disasterNumber != null) map.set(r.disasterNumber, r);
    }
    return map;
}

/**
 * Recent major disaster declarations (US-Affiliated). Dedupe by `id` when present.
 */
export async function fetchOpenFemaRecentDisasters(
    limit = 25,
): Promise<OpenFemaDisasterRecord[]> {
    const top = Math.min(100, Math.max(1, limit));
    const url = `${OPEN_FEMA_V2}/DisasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=${top}`;
    const json = await openFemaGetJson<OpenFemaDisasterResponse>(url);
    return dedupeDeclarations(json.DisasterDeclarationsSummaries ?? []);
}
