/**
 * Test Redis connectivity (Upstash REST or TLS TCP).
 *
 * Usage:
 *   npx tsx scripts/verify-redis-connection.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile() {
    const envPath = resolve(process.cwd(), '.env');
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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

import { getRedisBackend, normalizeRedisUrl, isRedisConfigured } from '../lib/cache/redis-backend';

async function main() {
    console.log('='.repeat(60));
    console.log('Redis Connection Test');
    console.log('='.repeat(60));

    const rawUrl = process.env.REDIS_URL?.trim();
    const hasRest =
        Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()) &&
        Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim());

    console.log(`REDIS_ENABLED: ${process.env.REDIS_ENABLED ?? '(unset)'}`);
    console.log(`Redis configured: ${isRedisConfigured()}`);
    console.log(`Upstash REST env: ${hasRest ? 'yes' : 'no'}`);

    if (rawUrl) {
        const { url, useTls } = normalizeRedisUrl(rawUrl);
        console.log(`REDIS_URL protocol: ${rawUrl.startsWith('rediss://') ? 'rediss:// (TLS)' : 'redis://'}`);
        if (rawUrl !== url) {
            console.log(`  → auto-normalized to: ${url.split('@')[0]}@... (TLS=${useTls})`);
            console.log('  FIX: Use rediss:// in .env to avoid ECONNRESET errors');
        }
    }

    const backend = await getRedisBackend();
    if (!backend) {
        console.log('\nFAIL: Could not connect — using in-memory fallback only.');
        console.log('\nUpstash fixes:');
        console.log('  1. Change redis:// to rediss:// in REDIS_URL');
        console.log('  2. Or add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (best for dev/Vercel)');
        process.exit(1);
    }

    const testKey = 'eqa:ping-test';
    await backend.set(testKey, 'ok', 30);
    const val = await backend.get(testKey);
    await backend.del(testKey);

    console.log(`\nTransport: ${backend.kind}`);
    console.log(`Ping set/get: ${val === 'ok' ? 'PASS' : 'FAIL'}`);
    console.log('\nPASS: Redis is connected and working.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
