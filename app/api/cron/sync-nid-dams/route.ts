import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { ingestAllNidDams, ingestNidDamsForState, NID_INGEST_STATE_CODES } from '@/lib/gis/layers/nid-dams-ingest';
import { invalidateDamsLayerCache } from '@/lib/gis/layers/nid-dams-query';

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
 * Sync NID dams into Mongo per state.
 * GET /api/cron/sync-nid-dams?state=TX
 * GET /api/cron/sync-nid-dams  (all states — long-running)
 */
export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const stateParam = req.nextUrl.searchParams.get('state')?.trim().toUpperCase() ?? '';

        if (stateParam) {
            const result = await ingestNidDamsForState(stateParam);
            await invalidateDamsLayerCache(stateParam);
            return apiJson({
                message: `NID dams ingested for ${stateParam}`,
                ...result,
            });
        }

        const { results, totalUpserted } = await ingestAllNidDams({
            onStateDone: async (r) => {
                await invalidateDamsLayerCache(r.stateKey);
            },
        });

        return apiJson({
            message: 'NID dams ingested for all states',
            states: NID_INGEST_STATE_CODES.length,
            totalUpserted,
            results,
        });
    } catch (e) {
        console.error('cron/sync-nid-dams:', e);
        return apiError('Failed to sync NID dams', 500);
    }
}
