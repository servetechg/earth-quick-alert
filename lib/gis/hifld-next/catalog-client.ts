import type { GeoJsonFeatureCollection } from '@/lib/gis/geojson-map-utils';

const HIFLD_NEXT_API_BASE =
    process.env.HIFLD_NEXT_API_BASE?.trim() || 'https://hifld.publicenvirodata.org/api';
const HIFLD_NEXT_STORAGE_BASE =
    process.env.HIFLD_NEXT_STORAGE_BASE?.trim() || 'https://hifld.publicenvirodata.org/storage';

const INGEST_TIMEOUT_MS = 300_000;

type HifldFileFormatRow = {
    format?: { format_type?: string };
    sources?: Array<{
        url?: string;
        location?: { path?: string };
    }>;
};

type HifldFileResponse = {
    file?: {
        formats?: HifldFileFormatRow[];
    };
};

export async function resolveHifldNextGeoJsonUrl(
    datasetSlug: string,
    fileSlug?: string,
): Promise<string> {
    const file = fileSlug?.trim() || datasetSlug;
    const url = `${HIFLD_NEXT_API_BASE}/collections/hifld/datasets/${encodeURIComponent(datasetSlug)}/files/${encodeURIComponent(file)}`;

    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
        throw new Error(`HIFLD Next metadata ${datasetSlug} HTTP ${res.status}`);
    }

    const data = (await res.json()) as HifldFileResponse;
    const formats = data.file?.formats ?? [];
    const geojson = formats.find((f) => f.format?.format_type === 'geojson');
    const source = geojson?.sources?.[0];

    if (source?.url) return source.url;

    const path = source?.location?.path;
    if (path) {
        return `${HIFLD_NEXT_STORAGE_BASE}/${path.replace(/^\/+/, '')}`;
    }

    throw new Error(`HIFLD Next GeoJSON source not found for ${datasetSlug}`);
}

export async function downloadHifldNextGeoJson(url: string): Promise<GeoJsonFeatureCollection> {
    const res = await fetch(url, {
        headers: { Accept: 'application/geo+json, application/json' },
        signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
    });

    if (!res.ok) {
        throw new Error(`HIFLD Next download failed HTTP ${res.status}: ${url}`);
    }

    const data = (await res.json()) as GeoJsonFeatureCollection;
    if (!Array.isArray(data.features)) {
        throw new Error(`HIFLD Next GeoJSON invalid for ${url}`);
    }

    return data;
}
