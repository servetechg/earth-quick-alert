import User from '@/models/User';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';

export type ResolvedRiskIngestScope = {
    nationwide: boolean;
    stateCd: string;
    stateRaw: string | null;
    /** True when a sub-admin has no valid assigned state — route must return 400. */
    unresolved?: boolean;
};

/**
 * Super-admin / default: nationwide (`stateCd` = `us`).
 * Sub-admin: always state-scoped from profile `User.state` (client cannot widen to USA).
 */
export async function resolveRiskIngestScopeForSession(
    role: string,
    userId: string | undefined,
    body: { nationwide?: boolean; stateCd?: string },
): Promise<ResolvedRiskIngestScope> {
    const r = String(role ?? '').toLowerCase();

    if (r === 'sub-admin' && userId) {
        const u = await User.findById(userId).select('state').lean();
        const stateRaw = typeof u?.state === 'string' ? u.state.trim() : '';
        const usps = normalizeStateToUsps(stateRaw);
        if (!usps || !/^[A-Z]{2}$/i.test(usps)) {
            // Sub-admin has no valid assigned state — signal the route to return 400
            return { nationwide: false, stateCd: '', stateRaw: stateRaw || null, unresolved: true };
        }
        return { nationwide: false, stateCd: usps.toLowerCase(), stateRaw: stateRaw || null };
    }

    if (body.nationwide !== false) {
        return { nationwide: true, stateCd: 'us', stateRaw: null };
    }

    const stateCd =
        typeof body.stateCd === 'string' && body.stateCd.length === 2 ? body.stateCd.toLowerCase() : 'ca';
    return { nationwide: false, stateCd, stateRaw: null };
}
