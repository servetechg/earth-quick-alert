import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';
import {
    downloadHifldNextGeoJson,
    resolveHifldNextGeoJsonUrl,
} from '@/lib/gis/hifld-next/catalog-client';
import { normalizeHifldNextFeature } from '@/lib/gis/hifld-next/normalize-feature';
import { hifldNextSectorDef } from '@/lib/gis/hifld-next/sector-dataset-config';
import type { HifldNextNormalizedSite, HifldSiteMapMarker } from '@/lib/gis/hifld-next/types';

const LIVE_SECTOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function toHifldSiteMapMarker(site: HifldNextNormalizedSite): HifldSiteMapMarker {
    const city = site.city.trim();
    const stateKey = site.stateKey.trim().toUpperCase();

    return {
        id: `hifld:${site.sectorId}:${site.facilityId}`,
        facilityId: site.facilityId,
        sectorId: site.sectorId,
        title: site.name,
        lat: site.lat,
        lng: site.lng,
        stateKey,
        city,
        address: site.address.trim(),
        zip: site.zip.trim(),
        status: site.status.trim() || 'Active',
        phone: String(site.phone ?? '').trim(),
        location: city ? `${city}, ${stateKey}` : stateKey,
    };
}

function liveSectorCacheKey(sectorId: CriticalInfraSectorId, datasetSlugs?: string[]): string {
    if (!datasetSlugs?.length) {
        return `map-layer:hifld-next-live:sector:${sectorId}:all`;
    }
    return `map-layer:hifld-next-live:sector:${sectorId}:${[...datasetSlugs].sort().join(',')}`;
}

/** Download + normalize national HIFLD Next GeoJSON when Mongo ingest is unavailable. */
export async function loadLiveHifldSectorMarkers(
    sectorId: CriticalInfraSectorId,
    opts?: { datasetSlugs?: string[]; force?: boolean },
): Promise<HifldSiteMapMarker[]> {
    const cacheKey = liveSectorCacheKey(sectorId, opts?.datasetSlugs);

    if (!opts?.force) {
        const hit = await cacheGetJson<HifldSiteMapMarker[]>(cacheKey);
        if (hit) return hit;
    }

    const sectorDef = hifldNextSectorDef(sectorId);
    if (!sectorDef) return [];

    const datasets = opts?.datasetSlugs?.length
        ? sectorDef.datasets.filter((d) => opts.datasetSlugs!.includes(d.slug))
        : sectorDef.datasets;

    const markers: HifldSiteMapMarker[] = [];
    const seen = new Set<string>();

    for (const dataset of datasets) {
        const url = await resolveHifldNextGeoJsonUrl(dataset.slug, dataset.fileSlug);
        const collection = await downloadHifldNextGeoJson(url);

        for (const feature of collection.features ?? []) {
            const normalized = normalizeHifldNextFeature(feature, sectorId, dataset);
            if (!normalized) continue;

            const key = `${normalized.sectorId}:${normalized.facilityId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            markers.push(toHifldSiteMapMarker(normalized));
        }
    }

    await cacheSetJson(cacheKey, markers, LIVE_SECTOR_CACHE_TTL_MS);
    return markers;
}

export function filterLiveHifldMarkersByState(
    markers: HifldSiteMapMarker[],
    stateKey: string,
): HifldSiteMapMarker[] {
    const usps = stateKey.trim().toUpperCase();
    return markers.filter((m) => m.stateKey === usps);
}

export function filterLiveHifldMarkersByBounds(
    markers: HifldSiteMapMarker[],
    bounds: MapBounds,
    opts?: { stateKey?: string; limit?: number },
): HifldSiteMapMarker[] {
    const limit = Math.max(opts?.limit ?? 1_500, 1);
    const usps = opts?.stateKey?.trim().toUpperCase();
    const filtered: HifldSiteMapMarker[] = [];

    for (const marker of markers) {
        if (usps && marker.stateKey !== usps) continue;
        if (marker.lat < bounds.south || marker.lat > bounds.north) continue;
        if (marker.lng < bounds.west || marker.lng > bounds.east) continue;
        filtered.push(marker);
        if (filtered.length >= limit) break;
    }

    return filtered;
}

/** Sectors with zero Mongo rows, plus transportation intermodal if not yet ingested. */
export async function resolveLiveHifldSupplements(
    sectors: CriticalInfraSectorId[],
    mongoCountBySector: Map<CriticalInfraSectorId, number>,
    intermodalInMongo: boolean,
): Promise<Array<{ sectorId: CriticalInfraSectorId; datasetSlugs?: string[] }>> {
    const supplements: Array<{ sectorId: CriticalInfraSectorId; datasetSlugs?: string[] }> = [];

    for (const sectorId of sectors) {
        if ((mongoCountBySector.get(sectorId) ?? 0) === 0) {
            supplements.push({ sectorId });
        }
    }

    if (sectors.includes('ci_transportation') && !intermodalInMongo) {
        supplements.push({
            sectorId: 'ci_transportation',
            datasetSlugs: ['intermodal-passenger-connectivity-database-ipcd'],
        });
    }

    return supplements;
}

export async function fetchLiveHifldSupplementMarkers(
    supplements: Array<{ sectorId: CriticalInfraSectorId; datasetSlugs?: string[] }>,
    opts?: { force?: boolean },
): Promise<HifldSiteMapMarker[]> {
    const markers: HifldSiteMapMarker[] = [];
    const seen = new Set<string>();

    for (const supplement of supplements) {
        const batch = await loadLiveHifldSectorMarkers(supplement.sectorId, {
            datasetSlugs: supplement.datasetSlugs,
            force: opts?.force,
        });

        for (const marker of batch) {
            const key = `${marker.sectorId}:${marker.facilityId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            markers.push(marker);
        }
    }

    return markers;
}
