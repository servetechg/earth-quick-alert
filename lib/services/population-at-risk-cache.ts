import type { PopulationAtRiskUserEntry } from '@/lib/services/users-in-aligned-alert-areas';

const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { users: PopulationAtRiskUserEntry[]; expiresAt: number }>();

export function getPopulationAtRiskCache(key: string): PopulationAtRiskUserEntry[] | null {
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
        if (entry) cache.delete(key);
        return null;
    }
    return entry.users;
}

export function setPopulationAtRiskCache(
    key: string,
    users: PopulationAtRiskUserEntry[],
): void {
    cache.set(key, { users, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function buildPopulationAtRiskCacheKey(userId: string, stateCd?: string): string {
    return `${userId}:${stateCd ?? 'nationwide'}:pop-at-risk-v1`;
}
