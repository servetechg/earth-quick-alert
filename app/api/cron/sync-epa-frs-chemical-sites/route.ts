import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import {
    ingestAllEpaFrsChemicalSites,
    ingestEpaFrsChemicalSitesForState,
    EPA_CHEMICAL_INGEST_STATE_CODES,
} from '@/lib/gis/layers/epa-frs-chemical-ingest';
import { invalidateChemicalSitesLayerCache } from '@/lib/gis/layers/epa-frs-chemical-query';

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
 * Sync EPA FRS chemical facilities (SEMS) into Mongo per state.
 * GET /api/cron/sync-epa-frs-chemical-sites?state=VA
 * GET /api/cron/sync-epa-frs-chemical-sites  (all states — long-running)
 */
export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const stateParam = req.nextUrl.searchParams.get('state')?.trim().toUpperCase() ?? '';

        if (stateParam) {
            const result = await ingestEpaFrsChemicalSitesForState(stateParam);
            await invalidateChemicalSitesLayerCache(stateParam);
            return apiJson({
                message: `EPA FRS chemical sites ingested for ${stateParam}`,
                ...result,
            });
        }

        const { results, totalUpserted } = await ingestAllEpaFrsChemicalSites({
            onStateDone: async (r) => {
                await invalidateChemicalSitesLayerCache(r.stateKey);
            },
        });

        return apiJson({
            message: 'EPA FRS chemical sites ingested for all states',
            states: EPA_CHEMICAL_INGEST_STATE_CODES.length,
            totalUpserted,
            results,
        });
    } catch (e) {
        console.error('cron/sync-epa-frs-chemical-sites:', e);
        return apiError('Failed to sync EPA FRS chemical sites', 500);
    }
}
