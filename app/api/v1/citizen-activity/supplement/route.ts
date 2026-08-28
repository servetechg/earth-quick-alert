import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { supplementCitizenActivity } from '@/lib/services/citizen-activity-service';
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

const supplementSchema = z.object({
    activityId: z.string().min(1),
    details: z.string().max(500).optional(),
    pictures: z.array(mediaRefSchema).max(CITIZEN_ACTIVITY_MAX_PICTURES).optional(),
    videos: z.array(mediaRefSchema).max(CITIZEN_ACTIVITY_MAX_VIDEOS).optional(),
});

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = supplementSchema.safeParse(body);
        if (!parsed.success) return validationError(zodFieldErrors(parsed.error));

        const result = await supplementCitizenActivity(auth.userId, parsed.data);
        return apiJson({
            message: result.completed
                ? 'Additional details submitted'
                : 'Details saved — more information still needed',
            ...result,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'SUPPLEMENT_FAILED';
        if (msg === 'NOT_FOUND') {
            return apiError('Activity not found', 404, { code: 'NOT_FOUND' });
        }
        if (msg === 'NO_CHANGES') {
            return apiError('No requested details were provided', 400, { code: 'VALIDATION_ERROR' });
        }
        console.error('POST /v1/citizen-activity/supplement:', e);
        return apiError('Failed to submit additional details', 500);
    }
}
