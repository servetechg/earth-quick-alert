import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { listMobileAlerts } from '@/lib/services/mobile/alerts-service';
import type { MobileAlertSeverity } from '@/lib/types/mobile/alerts';

export const dynamic = 'force-dynamic';

const SEVERITIES = new Set(['LOW', 'MODERATE', 'HIGH', 'EXTREME']);

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const url = new URL(req.url);
        const sort = url.searchParams.get('sort') === 'severity' ? 'severity' : 'recent';
        const severityRaw = url.searchParams.get('severity')?.toUpperCase();
        const severity = SEVERITIES.has(severityRaw ?? '')
            ? (severityRaw as MobileAlertSeverity)
            : undefined;
        const readParam = url.searchParams.get('read');
        const read =
            readParam === 'true' ? true : readParam === 'false' ? false : undefined;
        const q = url.searchParams.get('q') ?? undefined;
        const page = Number(url.searchParams.get('page') || 1);
        const limit = Number(url.searchParams.get('limit') || 20);

        const data = await listMobileAlerts(auth.userId, {
            sort,
            severity,
            read,
            q,
            page: Number.isFinite(page) ? page : 1,
            limit: Number.isFinite(limit) ? limit : 20,
        });

        return apiJson(data);
    } catch (e) {
        console.error('v1/alerts:', e);
        return apiError('Failed to load alerts', 500);
    }
}
