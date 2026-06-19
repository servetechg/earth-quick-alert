type UpstashRedis = import('@upstash/redis').Redis;

export type RedisBackend = {
    kind: 'upstash-rest' | 'ioredis';
    get(key: string): Promise<unknown>;
    set(key: string, value: string, ttlSec: number): Promise<void>;
    del(...keys: string[]): Promise<void>;
    scanAndDel(match: string): Promise<void>;
};

type GlobalRedis = {
    backend: RedisBackend | null;
    connecting: Promise<RedisBackend | null> | null;
    lastErrorLogAt: number;
};

const globalKey = '__eqa_redis__' as const;

function redisGlobal(): GlobalRedis {
    const g = globalThis as typeof globalThis & { [globalKey]?: GlobalRedis };
    if (!g[globalKey]) {
        g[globalKey] = { backend: null, connecting: null, lastErrorLogAt: 0 };
    }
    return g[globalKey]!;
}

function redisEnabled(): boolean {
    if (process.env.REDIS_ENABLED === 'false') return false;
    return Boolean(
        process.env.REDIS_URL?.trim() ||
            (process.env.UPSTASH_REDIS_REST_URL?.trim() &&
                process.env.UPSTASH_REDIS_REST_TOKEN?.trim()),
    );
}

/** Upstash requires TLS — upgrade redis:// → rediss:// for *.upstash.io hosts. */
export function normalizeRedisUrl(raw: string): { url: string; useTls: boolean } {
    let url = raw.trim();
    const isUpstash = /\.upstash\.io/i.test(url);

    if (isUpstash && url.startsWith('redis://')) {
        url = `rediss://${url.slice('redis://'.length)}`;
    }

    const useTls = url.startsWith('rediss://') || isUpstash;
    return { url, useTls };
}

function logRedisError(message: string): void {
    const state = redisGlobal();
    const now = Date.now();
    if (now - state.lastErrorLogAt < 30_000) return;
    state.lastErrorLogAt = now;
    console.warn(`[redis] ${message}`);
}

function invalidateBackend(): void {
    const state = redisGlobal();
    state.backend = null;
    state.connecting = null;
}

function createUpstashRestBackend(client: UpstashRedis): RedisBackend {
    return {
        kind: 'upstash-rest',
        async get(key) {
            const val = await client.get(key);
            return val ?? null;
        },
        async set(key, value, ttlSec) {
            await client.set(key, value, { ex: ttlSec });
        },
        async del(...keys) {
            if (keys.length > 0) await client.del(...keys);
        },
        async scanAndDel(match) {
            let cursor: string | number = 0;
            do {
                const [next, keys] = await client.scan(cursor, { match, count: 100 });
                if (keys.length > 0) await client.del(...keys);
                cursor = next;
            } while (cursor !== '0');
        },
    };
}

async function createIoredisBackend(): Promise<RedisBackend | null> {
    const rawUrl = process.env.REDIS_URL?.trim();
    if (!rawUrl) return null;

    const { url, useTls } = normalizeRedisUrl(rawUrl);
    const { default: Redis } = await import('ioredis');

    const client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        enableOfflineQueue: false,
        connectTimeout: 10_000,
        commandTimeout: 8_000,
        keepAlive: 10_000,
        tls: useTls ? {} : undefined,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 300, 2_000)),
    });

    client.on('error', (err) => {
        logRedisError(`connection error: ${err.message}`);
        invalidateBackend();
    });

    client.on('close', () => {
        invalidateBackend();
    });

    await client.connect();

    return {
        kind: 'ioredis',
        async get(key) {
            return client.get(key);
        },
        async set(key, value, ttlSec) {
            await client.set(key, value, 'EX', ttlSec);
        },
        async del(...keys) {
            if (keys.length > 0) await client.del(...keys);
        },
        async scanAndDel(match) {
            let cursor = '0';
            do {
                const [next, keys] = await client.scan(cursor, 'MATCH', match, 'COUNT', 100);
                cursor = next;
                if (keys.length > 0) await client.del(...keys);
            } while (cursor !== '0');
        },
    };
}

async function connectBackend(): Promise<RedisBackend | null> {
    const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const restToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

    if (restUrl && restToken) {
        try {
            const { Redis } = await import('@upstash/redis');
            const client = new Redis({
                url: restUrl,
                token: restToken,
                // Keep string payloads — cache-store owns JSON parse/stringify.
                automaticDeserialization: false,
            });
            await client.ping();
            console.info('[redis] connected via Upstash REST (recommended for serverless)');
            return createUpstashRestBackend(client);
        } catch (err) {
            logRedisError(
                `Upstash REST failed, trying TCP: ${err instanceof Error ? err.message : err}`,
            );
        }
    }

    try {
        const backend = await createIoredisBackend();
        if (backend) {
            const { url } = normalizeRedisUrl(process.env.REDIS_URL!.trim());
            if (url.startsWith('rediss://')) {
                console.info('[redis] connected via TLS (rediss://)');
            }
        }
        return backend;
    } catch (err) {
        logRedisError(
            `unavailable, using in-memory fallback: ${err instanceof Error ? err.message : err}`,
        );
        return null;
    }
}

export function cacheKeyPrefix(): string {
    return (process.env.REDIS_CACHE_PREFIX ?? 'eqa:').trim() || 'eqa:';
}

export function isRedisConfigured(): boolean {
    return redisEnabled();
}

/** Shared cache backend — Upstash REST preferred, then ioredis with TLS. */
export async function getRedisBackend(): Promise<RedisBackend | null> {
    if (!redisEnabled()) return null;

    const state = redisGlobal();
    if (state.backend) return state.backend;

    if (!state.connecting) {
        state.connecting = (async () => {
            try {
                const backend = await connectBackend();
                state.backend = backend;
                return backend;
            } finally {
                state.connecting = null;
            }
        })();
    }

    return state.connecting;
}
