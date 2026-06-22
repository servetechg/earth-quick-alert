import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import {
    ingestAllFemaShelters,
    ingestFemaSheltersForState,
    FEMA_SHELTER_INGEST_STATE_CODES,
} from '@/lib/gis/layers/fema-shelters-ingest';
import { invalidateSheltersLayerCache } from '@/lib/gis/layers/fema-shelters-query';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
        return process.env.NODE_ENV !== 'production';
    }

    const authHeader = req.headers.get('authorization') ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const headerSecret = req.headers.get('x-cron-secret')?.trim() ?? '';
    const querySecret = req.nextUrl.searchParams.get('secret')?.trim() ?? '';
    const vercelCron =
        process.env.VERCEL === '1' && req.headers.get('x-vercel-cron')?.trim() === '1';

    return (
        vercelCron ||
        bearer === secret ||
        headerSecret === secret ||
        querySecret === secret
    );
}

/**
 * Sync FEMA NSS shelters into Mongo per state.
 * GET /api/cron/sync-fema-shelters?state=TX
 * GET /api/cron/sync-fema-shelters  (all states — long-running)
 */
export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const stateParam = req.nextUrl.searchParams.get('state')?.trim().toUpperCase() ?? '';

        if (stateParam) {
            const result = await ingestFemaSheltersForState(stateParam);
            await invalidateSheltersLayerCache(stateParam);
            return apiJson({
                message: `FEMA shelters ingested for ${stateParam}`,
                ...result,
            });
        }

        const { results, totalUpserted } = await ingestAllFemaShelters({
            onStateDone: async (r) => {
                await invalidateSheltersLayerCache(r.stateKey);
            },
        });

        return apiJson({
            message: 'FEMA shelters ingested for all states',
            states: FEMA_SHELTER_INGEST_STATE_CODES.length,
            totalUpserted,
            results,
        });
    } catch (e) {
        console.error('cron/sync-fema-shelters:', e);
        return apiError('Failed to sync FEMA shelters', 500);
    }
}
