/**
 * Fetch U.S. police station listings via Google Places API (New) Text Search.
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-police-stations.ts --limit 2
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-police-stations.ts --states AL,AK
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-police-stations.ts --continue
 *
 * Output: data/us-police-stations.json (single file, append-friendly)
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_URL = 'https://places.googleapis.com/v1/places:searchText';
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'us-police-stations.json');
const PAGE_SIZE = 20;
const NEXT_PAGE_DELAY_MS = 2100;
const REQUEST_DELAY_MS = 500;

const US_STATES: { code: string; name: string }[] = [
    { code: 'AL', name: 'Alabama' },
    { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'DE', name: 'Delaware' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' },
];

/** User cURL fields + id/nextPageToken for dedup and pagination. */
const FIELD_MASK =
    'places.id,places.displayName,places.formattedAddress,places.location,nextPageToken';

type PoliceStationRecord = {
    placeId: string;
    displayName: string;
    formattedAddress: string;
    location: {
        latitude: number;
        longitude: number;
    };
    stateCode: string;
    stateName: string;
};

type ApiErrorLog = {
    stateCode: string;
    stateName: string;
    page: number;
    message: string;
    status?: number;
    details?: unknown;
};

type StateFetchSummary = {
    stateCode: string;
    stateName: string;
    policeStationsRetrieved: number;
    pagesFetched: number;
    duplicatesSkipped: number;
};

type OutputFile = {
    metadata: {
        generatedAt: string;
        updatedAt: string;
        source: string;
        apiEndpoint: string;
        fieldMask: string;
        textQueryTemplate: string;
        statesProcessed: string[];
        statesPending: string[];
        perStateCounts: Record<string, number>;
        totalRecords: number;
        totalApiRequests: number;
        errors: ApiErrorLog[];
    };
    policeStations: PoliceStationRecord[];
};

type PlacesSearchResponse = {
    places?: Array<{
        id?: string;
        displayName?: { text?: string; languageCode?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
    }>;
    nextPageToken?: string;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(): string {
    const key =
        process.env.GOOGLE_MAPS_API_KEY?.trim() ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
        '';
    if (!key) {
        throw new Error(
            'Missing API key. Set GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.',
        );
    }
    return key;
}

function parseArgs() {
    const args = process.argv.slice(2);
    let states: string[] | null = null;
    let limit: number | null = null;
    let continueMode = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--continue') {
            continueMode = true;
        } else if (arg === '--limit' && args[i + 1]) {
            limit = Number.parseInt(args[++i]!, 10);
        } else if (arg === '--states' && args[i + 1]) {
            states = args[++i]!
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
        }
    }

    return { states, limit, continueMode };
}

function normalizePlaceId(id: string): string {
    return id.startsWith('places/') ? id.slice('places/'.length) : id;
}

function mapPlaceToRecord(
    place: NonNullable<PlacesSearchResponse['places']>[number],
    stateCode: string,
    stateName: string,
): PoliceStationRecord | null {
    if (!place.id) return null;
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    return {
        placeId: normalizePlaceId(place.id),
        displayName: place.displayName?.text?.trim() || 'Unknown',
        formattedAddress: place.formattedAddress?.trim() || '',
        location: { latitude: lat, longitude: lng },
        stateCode,
        stateName,
    };
}

async function searchPoliceStationsForState(
    apiKey: string,
    stateCode: string,
    stateName: string,
    seenPlaceIds: Set<string>,
): Promise<{ records: PoliceStationRecord[]; summary: StateFetchSummary; errors: ApiErrorLog[] }> {
    const records: PoliceStationRecord[] = [];
    const errors: ApiErrorLog[] = [];
    let page = 1;
    let pagesFetched = 0;
    let duplicatesSkipped = 0;
    let pageToken: string | undefined;

    const textQuery = `police stations in ${stateName}`;

    while (true) {
        const body: Record<string, unknown> = {
            textQuery,
            pageSize: PAGE_SIZE,
        };
        if (pageToken) body.pageToken = pageToken;

        let response: Response;
        try {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask': FIELD_MASK,
                },
                body: JSON.stringify(body),
            });
        } catch (err) {
            errors.push({
                stateCode,
                stateName,
                page,
                message: err instanceof Error ? err.message : String(err),
            });
            break;
        }

        if (!response.ok) {
            let details: unknown;
            try {
                details = await response.json();
            } catch {
                details = await response.text();
            }
            errors.push({
                stateCode,
                stateName,
                page,
                status: response.status,
                message: `HTTP ${response.status} ${response.statusText}`,
                details,
            });
            break;
        }

        const data = (await response.json()) as PlacesSearchResponse;
        pagesFetched += 1;

        for (const place of data.places ?? []) {
            const record = mapPlaceToRecord(place, stateCode, stateName);
            if (!record) continue;
            if (seenPlaceIds.has(record.placeId)) {
                duplicatesSkipped += 1;
                continue;
            }
            seenPlaceIds.add(record.placeId);
            records.push(record);
        }

        if (!data.nextPageToken) break;

        pageToken = data.nextPageToken;
        page += 1;
        await sleep(NEXT_PAGE_DELAY_MS);
    }

    return {
        records,
        summary: {
            stateCode,
            stateName,
            policeStationsRetrieved: records.length,
            pagesFetched,
            duplicatesSkipped,
        },
        errors,
    };
}

async function loadExistingOutput(): Promise<OutputFile | null> {
    try {
        const raw = await readFile(OUTPUT_PATH, 'utf8');
        return JSON.parse(raw) as OutputFile;
    } catch {
        return null;
    }
}

function buildEmptyOutput(): OutputFile {
    return {
        metadata: {
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: 'Google Places API (New) — places:searchText',
            apiEndpoint: API_URL,
            fieldMask: FIELD_MASK,
            textQueryTemplate: 'police stations in {stateName}',
            statesProcessed: [],
            statesPending: US_STATES.map((s) => s.code),
            perStateCounts: {},
            totalRecords: 0,
            totalApiRequests: 0,
            errors: [],
        },
        policeStations: [],
    };
}

async function main() {
    const apiKey = getApiKey();
    const { states: stateArg, limit, continueMode } = parseArgs();

    let output = continueMode ? await loadExistingOutput() : null;
    if (!output) output = buildEmptyOutput();

    const seenPlaceIds = new Set(output.policeStations.map((p) => p.placeId));
    const alreadyProcessed = new Set(output.metadata.statesProcessed);

    let statesToProcess = US_STATES.filter((s) => !alreadyProcessed.has(s.code));

    if (stateArg?.length) {
        const allowed = new Set(stateArg);
        statesToProcess = US_STATES.filter((s) => allowed.has(s.code));
    } else if (limit && limit > 0) {
        statesToProcess = statesToProcess.slice(0, limit);
    }

    if (statesToProcess.length === 0) {
        console.log('[police-fetch] No states to process.');
        return;
    }

    console.log(
        `[police-fetch] Processing ${statesToProcess.length} state(s): ${statesToProcess.map((s) => s.code).join(', ')}`,
    );

    const runSummaries: StateFetchSummary[] = [];
    let apiRequestsThisRun = 0;

    for (const state of statesToProcess) {
        console.log(`[police-fetch] Fetching ${state.name} (${state.code})...`);

        const { records, summary, errors } = await searchPoliceStationsForState(
            apiKey,
            state.code,
            state.name,
            seenPlaceIds,
        );

        output.policeStations.push(...records);
        output.metadata.statesProcessed.push(state.code);
        output.metadata.perStateCounts[state.code] =
            (output.metadata.perStateCounts[state.code] ?? 0) + records.length;
        output.metadata.errors.push(...errors);
        output.metadata.totalApiRequests += summary.pagesFetched;
        apiRequestsThisRun += summary.pagesFetched;
        runSummaries.push(summary);

        console.log(
            `[police-fetch] ${state.code}: retrieved=${summary.policeStationsRetrieved} pages=${summary.pagesFetched} duplicatesSkipped=${summary.duplicatesSkipped} errors=${errors.length}`,
        );

        if (errors.length > 0) {
            for (const err of errors) {
                console.error(`[police-fetch] ERROR ${state.code} page ${err.page}: ${err.message}`);
            }
        }

        await sleep(REQUEST_DELAY_MS);
    }

    output.metadata.updatedAt = new Date().toISOString();
    output.metadata.totalRecords = output.policeStations.length;
    output.metadata.statesPending = US_STATES.map((s) => s.code).filter(
        (code) => !output!.metadata.statesProcessed.includes(code),
    );

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    const totalThisRun = runSummaries.reduce((sum, s) => sum + s.policeStationsRetrieved, 0);
    const errorsThisRun = runSummaries.reduce(
        (sum, s) => sum + output.metadata.errors.filter((e) => e.stateCode === s.stateCode).length,
        0,
    );

    console.log('\n=== Police station fetch summary ===');
    for (const s of runSummaries) {
        console.log(
            `  ${s.stateCode} (${s.stateName}): ${s.policeStationsRetrieved} police stations`,
        );
    }
    console.log(`  Total retrieved this run: ${totalThisRun}`);
    console.log(`  Total records in file: ${output.metadata.totalRecords}`);
    console.log(`  API requests this run: ${apiRequestsThisRun}`);
    console.log(`  Total API requests: ${output.metadata.totalApiRequests}`);
    console.log(`  API errors this run: ${errorsThisRun}`);
    console.log(`  Output: ${OUTPUT_PATH}`);
    console.log(`  Pending states: ${output.metadata.statesPending.length}`);
}

main().catch((err) => {
    console.error('[police-fetch] failed:', err);
    process.exit(1);
});
