import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { profileIncompleteReminderDelayLabel } from '@/lib/config/profile-incomplete-reminder';
import { processProfileIncompleteReminders } from '@/lib/services/mobile/profile-incomplete-reminder-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const result = await processProfileIncompleteReminders();

        return apiJson({
            message: 'Profile incomplete reminders processed',
            delay: profileIncompleteReminderDelayLabel(),
            ...result,
        });
    } catch (e) {
        console.error('cron/profile-incomplete-reminders:', e);
        return apiError('Failed to process reminders', 500);
    }
}

export async function POST(req: NextRequest) {
    return GET(req);
}
