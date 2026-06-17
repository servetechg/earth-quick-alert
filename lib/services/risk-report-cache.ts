type Entry<T> = { value: T; freshUntil: number; staleUntil: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export interface SwrOptions {
  ttlMs?: number;    // fresh window, default 90_000
  staleMs?: number;  // additional serve-stale window, default 600_000
  /** Bypass cache: skip fresh/stale hits and recompute now (still single-flight deduped). */
  force?: boolean;
}

/**
 * Returns a cached value with single-flight + stale-while-revalidate.
 * - fresh hit  -> return immediately, no recompute
 * - stale hit  -> return stale immediately, kick off ONE background refresh
 * - miss/expired -> await producer once (deduped), store, return
 * - force=true -> always await a fresh recompute (deduped), ignoring any cached value
 */
export async function getOrRevalidate<T>(
  key: string,
  producer: () => Promise<T>,
  opts: SwrOptions = {},
): Promise<T> {
  const ttlMs = opts.ttlMs ?? 90_000;
  const staleMs = opts.staleMs ?? 600_000;
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (!opts.force && hit && now < hit.freshUntil) return hit.value;

  const refresh = (): Promise<T> => {
    if (inflight.has(key)) return inflight.get(key) as Promise<T>;
    const p = (async () => {
      try {
        const value = await producer();
        store.set(key, { value, freshUntil: Date.now() + ttlMs, staleUntil: Date.now() + ttlMs + staleMs });
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  };

  if (!opts.force && hit && now < hit.staleUntil) {
    void refresh().catch((e) => console.error('[risk-cache] bg refresh', key, e)); // serve stale, refresh behind
    return hit.value;
  }
  return refresh(); // cold, fully expired, or forced: await once (deduped)
}

export function invalidate(prefix: string): void {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
