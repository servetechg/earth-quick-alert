import 'server-only';

export {
    cacheKeyPrefix,
    getRedisBackend,
    isRedisConfigured,
    normalizeRedisUrl,
    type RedisBackend,
} from '@/lib/cache/redis-backend';
