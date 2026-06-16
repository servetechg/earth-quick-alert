/** Verdict buckets sent to Python `/v1/audit/summary` (§9.5 — legacy inSync/reviewing/deviation removed). */
export type IntegrityBreakdown = {
    compliant: number;
    underReview: number;
    nonCompliant: number;
    unanalyzed: number;
};

export function emptyIntegrityBreakdown(): IntegrityBreakdown {
    return { compliant: 0, underReview: 0, nonCompliant: 0, unanalyzed: 0 };
}

/** Normalize Mongo/API payloads that may still use legacy keys. */
export function normalizeIntegrityBreakdown(raw: unknown): IntegrityBreakdown {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    if (typeof o.compliant === 'number' || typeof o.underReview === 'number') {
        return {
            compliant: Number(o.compliant ?? 0),
            underReview: Number(o.underReview ?? 0),
            nonCompliant: Number(o.nonCompliant ?? 0),
            unanalyzed: Number(o.unanalyzed ?? 0),
        };
    }
    return {
        compliant: Number(o.inSync ?? 0),
        underReview: Number(o.reviewing ?? 0),
        nonCompliant: Number(o.deviation ?? 0),
        unanalyzed: Number(o.unanalyzed ?? 0),
    };
}
