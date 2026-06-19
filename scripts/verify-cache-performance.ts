/**
 * Benchmark shared cache layer (memory fallback works without Redis).
 *
 * Usage:
 *   npx tsx scripts/verify-cache-performance.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile() {
    const envPath = resolve(process.cwd(), '.env');
    if (!existsSync(envPath)) return;
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
    }
}

loadEnvFile();

import { getOrRevalidate } from '@/lib/cache/swr-cache';
import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store';
import { parseCachedJson } from '@/lib/cache/json-codec';
import { getCacheMetrics, resetCacheMetrics } from '@/lib/cache/cache-metrics';
import { isRedisConfigured } from '@/lib/cache/redis-backend';

async function benchSwr() {
    let computeCount = 0;
    const producer = async () => {
        computeCount++;
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true, n: computeCount };
    };

    const key = 'bench:swr:v1';
    const t0 = Date.now();
    await getOrRevalidate(key, producer, { ttlMs: 30_000, staleMs: 60_000 });
    const coldMs = Date.now() - t0;

    const t1 = Date.now();
    await getOrRevalidate(key, producer, { ttlMs: 30_000, staleMs: 60_000 });
    const warmMs = Date.now() - t1;

    return { coldMs, warmMs, computeCount };
}

async function benchJsonStore() {
    const key = 'bench:json:v1';
    const payload = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `place-${i}` })) };

    await cacheSetJson(key, payload, 60_000);
    const hit = await cacheGetJson<typeof payload>(key);
    return { ok: Boolean(hit?.items?.length === 100) };
}

async function main() {
    console.log('='.repeat(60));
    console.log('Cache Performance Verification');
    console.log('='.repeat(60));
    console.log(`Redis configured: ${isRedisConfigured()}`);

    resetCacheMetrics();

    const swr = await benchSwr();
    console.log('\n── SWR cache ──');
    console.log(`  cold fetch: ${swr.coldMs}ms`);
    console.log(`  warm fetch: ${swr.warmMs}ms`);
    console.log(`  producer runs: ${swr.computeCount} (expect 1)`);

    const json = await benchJsonStore();
    console.log('\n── JSON store ──');
    console.log(`  round-trip: ${json.ok ? 'ok' : 'FAIL'}`);

    const parsedFromObject = parseCachedJson<{ n: number }>({ n: 42 });
    const parsedFromString = parseCachedJson<{ n: number }>('{"n":42}');
    console.log('\n── JSON decode (Upstash object vs string) ──');
    console.log(
        `  object branch: ${parsedFromObject.n === 42 ? 'ok' : 'FAIL'}, string branch: ${parsedFromString.n === 42 ? 'ok' : 'FAIL'}`,
    );

    const metrics = getCacheMetrics();
    console.log('\n── Metrics ──');
    console.log(`  hits: ${metrics.hits}, misses: ${metrics.misses}`);
    console.log(`  stale served: ${metrics.staleServed}`);
    console.log(`  redis errors: ${metrics.redisErrors}, memory fallback: ${metrics.memoryFallback}`);

    const failures: string[] = [];
    if (swr.computeCount !== 1) failures.push('SWR did not dedupe second call');
    if (swr.warmMs > swr.coldMs) failures.push('Warm fetch slower than cold (unexpected)');
    if (!json.ok) failures.push('JSON store round-trip failed');
    if (parsedFromObject.n !== 42 || parsedFromString.n !== 42) {
        failures.push('parseCachedJson object/string decode failed');
    }

    console.log('\n── Summary ──');
    if (failures.length) {
        for (const f of failures) console.log(`  FAIL: ${f}`);
        process.exit(1);
    }
    console.log('PASS: Cache layer working (Redis or in-memory fallback).');
    if (!isRedisConfigured()) {
        console.log('\nNote: Set REDIS_URL for shared cache across Vercel instances.');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
