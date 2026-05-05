/**
 * FEMA OpenFEMA API — disaster declarations (no API key required).
 * https://www.fema.gov/about/openfema/api
 */

const OPEN_FEMA_BASE = 'https://www.fema.gov/api/open/v2';

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
}

interface OpenFemaDisasterResponse {
    DisasterDeclarationsSummaries?: OpenFemaDisasterRecord[];
}

function upstreamUa(): string {
    return (
        process.env.OPENFEMA_USER_AGENT?.trim() ||
        process.env.NWS_USER_AGENT?.trim() ||
        'Ready2Go-EmergencyDashboard/1.0 (earthquick; openfema)'
    );
}

/**
 * Recent major disaster declarations (US-Affiliated). Dedupe by `id` when present.
 */
export async function fetchOpenFemaRecentDisasters(
    limit = 25
): Promise<OpenFemaDisasterRecord[]> {
    const top = Math.min(100, Math.max(1, limit));
    const url = `${OPEN_FEMA_BASE}/DisasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=${top}`;

    const res = await fetch(url, {
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
            'User-Agent': upstreamUa(),
        },
    });

    if (!res.ok) {
        throw new Error(`OpenFEMA fetch failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as OpenFemaDisasterResponse;
    const rows = json.DisasterDeclarationsSummaries ?? [];
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
