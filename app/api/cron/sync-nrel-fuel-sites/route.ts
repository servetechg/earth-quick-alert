import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import {
    ingestAllNrelFuelSites,
    ingestNrelFuelSitesForState,
    NREL_FUEL_INGEST_STATE_CODES,
} from '@/lib/gis/layers/nrel-fuel-sites-ingest';
import { invalidateFuelSitesLayerCache } from '@/lib/gis/layers/nrel-fuel-sites-query';

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
 * Sync NREL AFDC fuel sites into Mongo per state.
 * GET /api/cron/sync-nrel-fuel-sites?state=AR
 * GET /api/cron/sync-nrel-fuel-sites  (all states — long-running)
 */
export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const stateParam = req.nextUrl.searchParams.get('state')?.trim().toUpperCase() ?? '';

        if (stateParam) {
            const result = await ingestNrelFuelSitesForState(stateParam);
            await invalidateFuelSitesLayerCache(stateParam);
            return apiJson({
                message: `NREL fuel sites ingested for ${stateParam}`,
                ...result,
            });
        }

        const { results, totalUpserted } = await ingestAllNrelFuelSites({
            onStateDone: async (r) => {
                await invalidateFuelSitesLayerCache(r.stateKey);
            },
        });

        return apiJson({
            message: 'NREL fuel sites ingested for all states',
            states: NREL_FUEL_INGEST_STATE_CODES.length,
            totalUpserted,
            results,
        });
    } catch (e) {
        console.error('cron/sync-nrel-fuel-sites:', e);
        return apiError('Failed to sync NREL fuel sites', 500);
    }
}
