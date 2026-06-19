import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store';
import type { PopulationAtRiskUserEntry } from '@/lib/services/users-in-aligned-alert-areas';

const CACHE_TTL_MS = 60_000;
const KEY_PREFIX = 'pop-at-risk:';

export async function getPopulationAtRiskCache(
    key: string,
): Promise<PopulationAtRiskUserEntry[] | null> {
    return cacheGetJson<PopulationAtRiskUserEntry[]>(`${KEY_PREFIX}${key}`);
}

export async function setPopulationAtRiskCache(
    key: string,
    users: PopulationAtRiskUserEntry[],
): Promise<void> {
    await cacheSetJson(`${KEY_PREFIX}${key}`, users, CACHE_TTL_MS);
}

export function buildPopulationAtRiskCacheKey(userId: string, stateCd?: string): string {
    return `${userId}:${stateCd ?? 'nationwide'}:pop-at-risk-v1`;
}
