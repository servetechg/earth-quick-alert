/**
 * Fetch U.S. pharmacy listings via Google Places API (New) Text Search.
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-pharmacies.ts --limit 2
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-pharmacies.ts --states AL,AK
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-pharmacies.ts --continue
 *
 * Output: data/us-pharmacies.json (single file, append-friendly)
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_URL = 'https://places.googleapis.com/v1/places:searchText';
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'us-pharmacies.json');
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

const FIELD_MASK =
    'places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,nextPageToken';

type PharmacyRecord = {
    placeId: string;
    displayName: string;
    formattedAddress: string;
    phone: string;
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
    pharmaciesRetrieved: number;
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
        statesProcessed: string[];
        statesPending: string[];
        perStateCounts: Record<string, number>;
        totalRecords: number;
        errors: ApiErrorLog[];
    };
    pharmacies: PharmacyRecord[];
};

type PlacesSearchResponse = {
    places?: Array<{
        id?: string;
        displayName?: { text?: string; languageCode?: string };
        formattedAddress?: string;
        nationalPhoneNumber?: string;
        internationalPhoneNumber?: string;
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
): PharmacyRecord | null {
    if (!place.id) return null;
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    return {
        placeId: normalizePlaceId(place.id),
        displayName: place.displayName?.text?.trim() || 'Unknown',
        formattedAddress: place.formattedAddress?.trim() || '',
        phone:
            place.nationalPhoneNumber?.trim() ||
            place.internationalPhoneNumber?.trim() ||
            '',
        location: { latitude: lat, longitude: lng },
        stateCode,
        stateName,
    };
}

async function searchPharmaciesForState(
    apiKey: string,
    stateCode: string,
    stateName: string,
    seenPlaceIds: Set<string>,
): Promise<{ records: PharmacyRecord[]; summary: StateFetchSummary; errors: ApiErrorLog[] }> {
    const records: PharmacyRecord[] = [];
    const errors: ApiErrorLog[] = [];
    let page = 1;
    let pagesFetched = 0;
    let duplicatesSkipped = 0;
    let pageToken: string | undefined;

    const textQuery = `pharmacies in ${stateName}`;

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
            pharmaciesRetrieved: records.length,
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
            statesProcessed: [],
            statesPending: US_STATES.map((s) => s.code),
            perStateCounts: {},
            totalRecords: 0,
            errors: [],
        },
        pharmacies: [],
    };
}

async function main() {
    const apiKey = getApiKey();
    const { states: stateArg, limit, continueMode } = parseArgs();

    let output = continueMode ? await loadExistingOutput() : null;
    if (!output) output = buildEmptyOutput();

    const seenPlaceIds = new Set(output.pharmacies.map((p) => p.placeId));
    const alreadyProcessed = new Set(output.metadata.statesProcessed);

    let statesToProcess = US_STATES.filter((s) => !alreadyProcessed.has(s.code));

    if (stateArg?.length) {
        const allowed = new Set(stateArg);
        statesToProcess = US_STATES.filter((s) => allowed.has(s.code));
    } else if (limit && limit > 0) {
        statesToProcess = statesToProcess.slice(0, limit);
    }

    if (statesToProcess.length === 0) {
        console.log('[pharmacy-fetch] No states to process.');
        return;
    }

    console.log(
        `[pharmacy-fetch] Processing ${statesToProcess.length} state(s): ${statesToProcess.map((s) => s.code).join(', ')}`,
    );

    const runSummaries: StateFetchSummary[] = [];

    for (const state of statesToProcess) {
        console.log(`[pharmacy-fetch] Fetching ${state.name} (${state.code})...`);

        const { records, summary, errors } = await searchPharmaciesForState(
            apiKey,
            state.code,
            state.name,
            seenPlaceIds,
        );

        output.pharmacies.push(...records);
        output.metadata.statesProcessed.push(state.code);
        output.metadata.perStateCounts[state.code] =
            (output.metadata.perStateCounts[state.code] ?? 0) + records.length;
        output.metadata.errors.push(...errors);
        runSummaries.push(summary);

        console.log(
            `[pharmacy-fetch] ${state.code}: retrieved=${summary.pharmaciesRetrieved} pages=${summary.pagesFetched} duplicatesSkipped=${summary.duplicatesSkipped} errors=${errors.length}`,
        );

        if (errors.length > 0) {
            for (const err of errors) {
                console.error(`[pharmacy-fetch] ERROR ${state.code} page ${err.page}: ${err.message}`);
            }
        }

        await sleep(REQUEST_DELAY_MS);
    }

    output.metadata.updatedAt = new Date().toISOString();
    output.metadata.totalRecords = output.pharmacies.length;
    output.metadata.statesPending = US_STATES.map((s) => s.code).filter(
        (code) => !output!.metadata.statesProcessed.includes(code),
    );

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    const totalThisRun = runSummaries.reduce((sum, s) => sum + s.pharmaciesRetrieved, 0);
    const errorsThisRun = runSummaries.reduce(
        (sum, s) => sum + output.metadata.errors.filter((e) => e.stateCode === s.stateCode).length,
        0,
    );

    console.log('\n=== Pharmacy fetch summary ===');
    for (const s of runSummaries) {
        console.log(`  ${s.stateCode} (${s.stateName}): ${s.pharmaciesRetrieved} pharmacies`);
    }
    console.log(`  Total retrieved this run: ${totalThisRun}`);
    console.log(`  Total records in file: ${output.metadata.totalRecords}`);
    console.log(`  API errors this run: ${errorsThisRun}`);
    console.log(`  Output: ${OUTPUT_PATH}`);
    console.log(`  Pending states: ${output.metadata.statesPending.length}`);
}

main().catch((err) => {
    console.error('[pharmacy-fetch] failed:', err);
    process.exit(1);
});
