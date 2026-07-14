/**
 * Fetch U.S. food distribution center listings via Google Places API (New) Text Search.
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-food-distribution-centers.ts --limit 2
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-food-distribution-centers.ts --states AL,AK
 *   GOOGLE_MAPS_API_KEY=... npx tsx scripts/fetch-us-food-distribution-centers.ts --continue
 *
 * Output: data/us-food-distribution-centers.json (single file, append-friendly)
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_URL = 'https://places.googleapis.com/v1/places:searchText';
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'us-food-distribution-centers.json');
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

const SEARCH_QUERIES: { category: string; template: string }[] = [
    { category: 'food_distribution_center', template: 'Food Distribution Center in {stateName}' },
    {
        category: 'emergency_food_distribution',
        template: 'Emergency Food Distribution Center in {stateName}',
    },
    {
        category: 'disaster_food_distribution',
        template: 'Disaster Food Distribution Center in {stateName}',
    },
];

const FIELD_MASK =
    'places.id,places.displayName,places.formattedAddress,places.location,nextPageToken';

type FoodDistributionCenterRecord = {
    placeId: string;
    displayName: string;
    formattedAddress: string;
    location: {
        latitude: number;
        longitude: number;
    };
    stateCode: string;
    stateName: string;
    searchCategory: string;
    sourceTextQuery: string;
};

type ApiErrorLog = {
    stateCode: string;
    stateName: string;
    searchCategory: string;
    textQuery: string;
    page: number;
    message: string;
    status?: number;
    details?: unknown;
};

type StateFetchSummary = {
    stateCode: string;
    stateName: string;
    centersRetrieved: number;
    queriesRun: number;
    pagesFetched: number;
    duplicatesSkipped: number;
    byCategory: Record<string, number>;
};

type OutputFile = {
    metadata: {
        generatedAt: string;
        updatedAt: string;
        source: string;
        apiEndpoint: string;
        fieldMask: string;
        searchQueries: typeof SEARCH_QUERIES;
        deduplication: string;
        statesProcessed: string[];
        statesPending: string[];
        perStateCounts: Record<string, number>;
        totalRecords: number;
        totalApiRequests: number;
        errors: ApiErrorLog[];
    };
    foodDistributionCenters: FoodDistributionCenterRecord[];
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

type DedupState = {
    placeIds: Set<string>;
    nameLocationKeys: Set<string>;
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

function nameLocationKey(displayName: string, lat: number, lng: number): string {
    const name = displayName.trim().toLowerCase().replace(/\s+/g, ' ');
    const roundedLat = Math.round(lat * 10_000) / 10_000;
    const roundedLng = Math.round(lng * 10_000) / 10_000;
    return `${name}|${roundedLat}|${roundedLng}`;
}

function buildTextQuery(template: string, stateName: string): string {
    return template.replace('{stateName}', stateName);
}

function isDuplicate(record: FoodDistributionCenterRecord, dedup: DedupState): boolean {
    if (dedup.placeIds.has(record.placeId)) return true;
    const key = nameLocationKey(
        record.displayName,
        record.location.latitude,
        record.location.longitude,
    );
    return dedup.nameLocationKeys.has(key);
}

function registerRecord(record: FoodDistributionCenterRecord, dedup: DedupState): void {
    dedup.placeIds.add(record.placeId);
    dedup.nameLocationKeys.add(
        nameLocationKey(
            record.displayName,
            record.location.latitude,
            record.location.longitude,
        ),
    );
}

function buildDedupStateFromRecords(records: FoodDistributionCenterRecord[]): DedupState {
    const dedup: DedupState = { placeIds: new Set(), nameLocationKeys: new Set() };
    for (const record of records) registerRecord(record, dedup);
    return dedup;
}

function mapPlaceToRecord(
    place: NonNullable<PlacesSearchResponse['places']>[number],
    stateCode: string,
    stateName: string,
    searchCategory: string,
    sourceTextQuery: string,
): FoodDistributionCenterRecord | null {
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
        searchCategory,
        sourceTextQuery,
    };
}

async function searchTextQueryAllPages(
    apiKey: string,
    textQuery: string,
    searchCategory: string,
    stateCode: string,
    stateName: string,
    dedup: DedupState,
): Promise<{
    records: FoodDistributionCenterRecord[];
    pagesFetched: number;
    duplicatesSkipped: number;
    errors: ApiErrorLog[];
}> {
    const records: FoodDistributionCenterRecord[] = [];
    const errors: ApiErrorLog[] = [];
    let page = 1;
    let pagesFetched = 0;
    let duplicatesSkipped = 0;
    let pageToken: string | undefined;

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
                searchCategory,
                textQuery,
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
                searchCategory,
                textQuery,
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
            const record = mapPlaceToRecord(
                place,
                stateCode,
                stateName,
                searchCategory,
                textQuery,
            );
            if (!record) continue;
            if (isDuplicate(record, dedup)) {
                duplicatesSkipped += 1;
                continue;
            }
            registerRecord(record, dedup);
            records.push(record);
        }

        if (!data.nextPageToken) break;

        pageToken = data.nextPageToken;
        page += 1;
        await sleep(NEXT_PAGE_DELAY_MS);
    }

    return { records, pagesFetched, duplicatesSkipped, errors };
}

async function searchFoodDistributionCentersForState(
    apiKey: string,
    stateCode: string,
    stateName: string,
    dedup: DedupState,
): Promise<{ records: FoodDistributionCenterRecord[]; summary: StateFetchSummary; errors: ApiErrorLog[] }> {
    const records: FoodDistributionCenterRecord[] = [];
    const errors: ApiErrorLog[] = [];
    const byCategory: Record<string, number> = {};
    let pagesFetched = 0;
    let duplicatesSkipped = 0;

    for (const queryDef of SEARCH_QUERIES) {
        const textQuery = buildTextQuery(queryDef.template, stateName);
        console.log(`[food-fetch]   query: ${textQuery}`);

        const result = await searchTextQueryAllPages(
            apiKey,
            textQuery,
            queryDef.category,
            stateCode,
            stateName,
            dedup,
        );

        records.push(...result.records);
        byCategory[queryDef.category] = result.records.length;
        pagesFetched += result.pagesFetched;
        duplicatesSkipped += result.duplicatesSkipped;
        errors.push(...result.errors);

        await sleep(REQUEST_DELAY_MS);
    }

    return {
        records,
        summary: {
            stateCode,
            stateName,
            centersRetrieved: records.length,
            queriesRun: SEARCH_QUERIES.length,
            pagesFetched,
            duplicatesSkipped,
            byCategory,
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
            searchQueries: SEARCH_QUERIES,
            deduplication: 'placeId and normalized displayName + location (4 decimal degrees)',
            statesProcessed: [],
            statesPending: US_STATES.map((s) => s.code),
            perStateCounts: {},
            totalRecords: 0,
            totalApiRequests: 0,
            errors: [],
        },
        foodDistributionCenters: [],
    };
}

async function main() {
    const apiKey = getApiKey();
    const { states: stateArg, limit, continueMode } = parseArgs();

    let output = continueMode ? await loadExistingOutput() : null;
    if (!output) output = buildEmptyOutput();

    const dedup = buildDedupStateFromRecords(output.foodDistributionCenters);
    const alreadyProcessed = new Set(output.metadata.statesProcessed);

    let statesToProcess = US_STATES.filter((s) => !alreadyProcessed.has(s.code));

    if (stateArg?.length) {
        const allowed = new Set(stateArg);
        statesToProcess = US_STATES.filter((s) => allowed.has(s.code));
    } else if (limit && limit > 0) {
        statesToProcess = statesToProcess.slice(0, limit);
    }

    if (statesToProcess.length === 0) {
        console.log('[food-fetch] No states to process.');
        return;
    }

    console.log(
        `[food-fetch] Processing ${statesToProcess.length} state(s): ${statesToProcess.map((s) => s.code).join(', ')}`,
    );

    const runSummaries: StateFetchSummary[] = [];
    let apiRequestsThisRun = 0;

    for (const state of statesToProcess) {
        console.log(`[food-fetch] Fetching ${state.name} (${state.code})...`);

        const { records, summary, errors } = await searchFoodDistributionCentersForState(
            apiKey,
            state.code,
            state.name,
            dedup,
        );

        output.foodDistributionCenters.push(...records);
        output.metadata.statesProcessed.push(state.code);
        output.metadata.perStateCounts[state.code] =
            (output.metadata.perStateCounts[state.code] ?? 0) + records.length;
        output.metadata.errors.push(...errors);
        output.metadata.totalApiRequests += summary.pagesFetched;
        apiRequestsThisRun += summary.pagesFetched;
        runSummaries.push(summary);

        console.log(
            `[food-fetch] ${state.code}: retrieved=${summary.centersRetrieved} queries=${summary.queriesRun} pages=${summary.pagesFetched} duplicatesSkipped=${summary.duplicatesSkipped} errors=${errors.length}`,
        );
        console.log(`[food-fetch] ${state.code} by category:`, summary.byCategory);

        if (errors.length > 0) {
            for (const err of errors) {
                console.error(
                    `[food-fetch] ERROR ${state.code} [${err.searchCategory}] page ${err.page}: ${err.message}`,
                );
            }
        }
    }

    output.metadata.updatedAt = new Date().toISOString();
    output.metadata.totalRecords = output.foodDistributionCenters.length;
    output.metadata.statesPending = US_STATES.map((s) => s.code).filter(
        (code) => !output!.metadata.statesProcessed.includes(code),
    );

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    const totalThisRun = runSummaries.reduce((sum, s) => sum + s.centersRetrieved, 0);
    const errorsThisRun = runSummaries.reduce(
        (sum, s) => sum + output.metadata.errors.filter((e) => e.stateCode === s.stateCode).length,
        0,
    );

    console.log('\n=== Food distribution center fetch summary ===');
    for (const s of runSummaries) {
        console.log(
            `  ${s.stateCode} (${s.stateName}): ${s.centersRetrieved} centers (${s.queriesRun} queries, ${s.pagesFetched} API pages)`,
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
    console.error('[food-fetch] failed:', err);
    process.exit(1);
});
