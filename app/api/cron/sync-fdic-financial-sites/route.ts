import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import {
    ingestAllFdicFinancialSites,
    ingestFdicFinancialSitesForState,
    FDIC_FINANCIAL_INGEST_STATE_CODES,
} from '@/lib/gis/layers/fdic-financial-ingest';
import { invalidateFinancialSitesLayerCache } from '@/lib/gis/layers/fdic-financial-query';

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
 * Sync FDIC bank locations into Mongo per state.
 * GET /api/cron/sync-fdic-financial-sites?state=FL
 */
export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const stateParam = req.nextUrl.searchParams.get('state')?.trim().toUpperCase() ?? '';

        if (stateParam) {
            const result = await ingestFdicFinancialSitesForState(stateParam);
            await invalidateFinancialSitesLayerCache(stateParam);
            return apiJson({
                message: `FDIC financial sites ingested for ${stateParam}`,
                ...result,
            });
        }

        const { results, totalUpserted } = await ingestAllFdicFinancialSites({
            onStateDone: async (r) => {
                await invalidateFinancialSitesLayerCache(r.stateKey);
            },
        });

        return apiJson({
            message: 'FDIC financial sites ingested for all states',
            states: FDIC_FINANCIAL_INGEST_STATE_CODES.length,
            totalUpserted,
            results,
        });
    } catch (e) {
        console.error('cron/sync-fdic-financial-sites:', e);
        return apiError('Failed to sync FDIC financial sites', 500);
    }
}
