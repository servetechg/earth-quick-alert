/** Decode values from Redis — Upstash REST may return parsed objects, ioredis returns strings. */
export function parseCachedJson<T>(raw: unknown): T {
    if (raw === null || raw === undefined) {
        throw new Error('empty cache value');
    }
    if (typeof raw === 'string') {
        return JSON.parse(raw) as T;
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
        return JSON.parse(raw.toString('utf8')) as T;
    }
    if (typeof raw === 'object') {
        return raw as T;
    }
    throw new Error(`unsupported cache value type: ${typeof raw}`);
}

export function serializeCachedJson(value: unknown): string {
    return JSON.stringify(value);
}
