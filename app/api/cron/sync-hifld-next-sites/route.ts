import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';
import {
    HIFLD_NEXT_SECTOR_IDS,
    ingestAllHifldNextSectors,
    ingestHifldNextSector,
} from '@/lib/gis/layers/hifld-next-ingest';
import { invalidateHifldSitesLayerCache } from '@/lib/gis/layers/hifld-next-query';

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

function parseSectorParam(raw: string | null): CriticalInfraSectorId | null {
    const sector = raw?.trim() as CriticalInfraSectorId | undefined;
    if (!sector) return null;
    return HIFLD_NEXT_SECTOR_IDS.includes(sector) ? sector : null;
}

/**
 * Sync HIFLD Next national datasets into Mongo per sector.
 * GET /api/cron/sync-hifld-next-sites?sector=ci_healthcare
 */
export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const sectorParam = parseSectorParam(req.nextUrl.searchParams.get('sector'));

        if (sectorParam) {
            const result = await ingestHifldNextSector(sectorParam);
            await invalidateHifldSitesLayerCache(sectorParam);
            return apiJson({
                message: `HIFLD Next sites ingested for ${sectorParam}`,
                ...result,
            });
        }

        const { results, failedSectors } = await ingestAllHifldNextSectors({
            onSectorDone: async (r) => {
                await invalidateHifldSitesLayerCache(r.sectorId);
            },
        });

        return apiJson({
            message: 'HIFLD Next sites ingested for all configured sectors',
            sectors: HIFLD_NEXT_SECTOR_IDS.length,
            results,
            failedSectors,
        });
    } catch (e) {
        console.error('cron/sync-hifld-next-sites:', e);
        return apiError('Failed to sync HIFLD Next sites', 500);
    }
}
