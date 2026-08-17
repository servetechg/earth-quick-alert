import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { processAutoIdaDispatch } from '@/lib/services/ida-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return process.env.NODE_ENV !== 'production';

    const authHeader = req.headers.get('authorization') ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const headerSecret = req.headers.get('x-cron-secret')?.trim() ?? '';
    const querySecret = req.nextUrl.searchParams.get('secret')?.trim() ?? '';
    const vercelCron =
        process.env.VERCEL === '1' && req.headers.get('x-vercel-cron')?.trim() === '1';

    return vercelCron || bearer === secret || headerSecret === secret || querySecret === secret;
}

export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const result = await processAutoIdaDispatch();
        return apiJson({ message: 'IDA auto-dispatch processed', ...result });
    } catch (e) {
        console.error('cron/ida-dispatch:', e);
        return apiError('Failed to process IDA dispatch', 500);
    }
}

export async function POST(req: NextRequest) {
    return GET(req);
}
