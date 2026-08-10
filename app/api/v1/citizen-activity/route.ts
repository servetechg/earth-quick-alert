import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import {
    createCitizenActivityReport,
    createSafeCheckInActivity,
    listCitizenActivitiesForUser,
    MOBILE_REPORT_CATEGORIES,
} from '@/lib/services/citizen-activity-service';
import {
    CITIZEN_ACTIVITY_MAX_PICTURES,
    CITIZEN_ACTIVITY_MAX_VIDEOS,
} from '@/lib/services/citizen-activity-media-service';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';

const mediaRefSchema = z.object({
    url: z.string().url(),
    fileName: z.string().min(1).optional(),
    mimeType: z.string().optional(),
    publicId: z.string().optional(),
    resourceType: z.enum(['image', 'video', 'raw']).optional(),
});

const reportSchema = z.object({
    category: z.enum(MOBILE_REPORT_CATEGORIES as unknown as [string, ...string[]]),
    description: z.string().min(3).max(500),
    details: z.string().max(500).optional(),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
    location: z.string().max(240).optional(),
    pictures: z.array(mediaRefSchema).max(CITIZEN_ACTIVITY_MAX_PICTURES).optional(),
    videos: z.array(mediaRefSchema).max(CITIZEN_ACTIVITY_MAX_VIDEOS).optional(),
});

const safeCheckInSchema = z.object({
    isSafe: z.boolean(),
    message: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const limitRaw = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
        const items = await listCitizenActivitiesForUser(auth.userId, limit);
        return apiJson({ items });
    } catch (e) {
        console.error('GET /v1/citizen-activity:', e);
        return apiError('Failed to load activity history', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const action = String(body?.action ?? 'report').toLowerCase();

        if (action === 'safe_checkin') {
            const parsed = safeCheckInSchema.safeParse(body);
            if (!parsed.success) return validationError(zodFieldErrors(parsed.error));
            const item = await createSafeCheckInActivity(auth.userId, parsed.data);
            return apiJson({ message: 'Safety status recorded', item }, 201);
        }

        const parsed = reportSchema.safeParse(body);
        if (!parsed.success) return validationError(zodFieldErrors(parsed.error));

        const item = await createCitizenActivityReport(auth.userId, {
            category: parsed.data.category as (typeof MOBILE_REPORT_CATEGORIES)[number],
            description: parsed.data.description,
            details: parsed.data.details,
            lat: parsed.data.lat,
            lng: parsed.data.lng,
            location: parsed.data.location,
            pictures: parsed.data.pictures,
            videos: parsed.data.videos,
        });
        return apiJson({ message: 'Report submitted', item }, 201);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'SUBMIT_FAILED';
        if (msg === 'DESCRIPTION_REQUIRED') {
            return apiError('Description is required', 400, { code: 'VALIDATION_ERROR' });
        }
        if (msg === 'USER_NOT_FOUND') {
            return apiError('User not found', 404, { code: 'NOT_FOUND' });
        }
        console.error('POST /v1/citizen-activity:', e);
        return apiError('Failed to submit report', 500);
    }
}
