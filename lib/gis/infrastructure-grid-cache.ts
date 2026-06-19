import connectDB from '@/lib/mongodb';
import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store';
import InfrastructurePlaceGridCache, {
    type CachedInfrastructurePlace,
} from '@/models/InfrastructurePlaceGridCache';

export const GRID_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REDIS_GRID_TTL_MS = 10 * 60 * 1000;
const REDIS_KEY_PREFIX = 'grid:';

function redisGridKey(
    scopeKey: string,
    cacheType: string,
    gridLat: number,
    gridLng: number,
): string {
    return `${REDIS_KEY_PREFIX}${scopeKey}:${cacheType}:${gridLat}:${gridLng}`;
}

export async function loadGridCellFromCache(
    scopeKey: string,
    cacheType: string,
    gridLat: number,
    gridLng: number,
): Promise<CachedInfrastructurePlace[] | null> {
    const redisHit = await cacheGetJson<CachedInfrastructurePlace[]>(
        redisGridKey(scopeKey, cacheType, gridLat, gridLng),
    );
    if (redisHit?.length) return redisHit;

    await connectDB();
    const doc = await InfrastructurePlaceGridCache.findOne({
        scopeKey,
        placeType: cacheType,
        gridLat,
        gridLng,
        expiresAt: { $gt: new Date() },
    })
        .select('places')
        .lean();

    if (!doc || !Array.isArray(doc.places)) return null;

    const places = doc.places as CachedInfrastructurePlace[];

    if (places.length > 0) {
        await cacheSetJson(
            redisGridKey(scopeKey, cacheType, gridLat, gridLng),
            places,
            REDIS_GRID_TTL_MS,
        );
    }

    return places;
}

export async function saveGridCellToCache(
    scopeKey: string,
    cacheType: string,
    gridLat: number,
    gridLng: number,
    places: CachedInfrastructurePlace[],
): Promise<void> {
    await connectDB();
    await InfrastructurePlaceGridCache.findOneAndUpdate(
        { scopeKey, placeType: cacheType, gridLat, gridLng },
        { $set: { places, expiresAt: new Date(Date.now() + GRID_CACHE_TTL_MS) } },
        { upsert: true },
    );

    if (places.length > 0) {
        await cacheSetJson(
            redisGridKey(scopeKey, cacheType, gridLat, gridLng),
            places,
            REDIS_GRID_TTL_MS,
        );
    }
}
