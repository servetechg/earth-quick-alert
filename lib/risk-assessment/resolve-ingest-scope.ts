import User from '@/models/User';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';

export type ResolvedRiskIngestScope = {
    nationwide: boolean;
    stateCd: string;
    stateRaw: string | null;
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
        const stateCd =
            usps && /^[A-Z]{2}$/i.test(usps)
                ? usps.toLowerCase()
                : typeof body.stateCd === 'string' && body.stateCd.length === 2
                  ? body.stateCd.toLowerCase()
                  : 'ca';
        return { nationwide: false, stateCd, stateRaw: stateRaw || null };
    }

    if (body.nationwide !== false) {
        return { nationwide: true, stateCd: 'us', stateRaw: null };
    }

    const stateCd =
        typeof body.stateCd === 'string' && body.stateCd.length === 2 ? body.stateCd.toLowerCase() : 'ca';
    return { nationwide: false, stateCd, stateRaw: null };
}
