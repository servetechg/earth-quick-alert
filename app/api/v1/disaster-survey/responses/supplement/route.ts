import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { supplementDisasterSurveyResponse } from '@/lib/services/disaster-survey-service';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';

const mediaRefSchema = z.object({
    url: z.string().url(),
    fileName: z.string().min(1).optional(),
    mimeType: z.string().optional(),
    publicId: z.string().optional(),
    resourceType: z.enum(['image', 'video', 'raw']).optional(),
});

const schema = z.object({
    invitationId: z.string().min(1),
    comments: z.string().max(4000).optional(),
    incidentPictures: z.array(mediaRefSchema).max(3).optional(),
    incidentVideos: z.array(mediaRefSchema).max(1).optional(),
});

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) return validationError(zodFieldErrors(parsed.error));

        const result = await supplementDisasterSurveyResponse(auth.userId, {
            invitationId: parsed.data.invitationId,
            comments: parsed.data.comments,
            incidentPictures: parsed.data.incidentPictures?.map((m) => ({
                url: m.url,
                fileName: m.fileName ?? 'file',
                mimeType: m.mimeType,
                publicId: m.publicId,
                resourceType: m.resourceType,
            })),
            incidentVideos: parsed.data.incidentVideos?.map((m) => ({
                url: m.url,
                fileName: m.fileName ?? 'file',
                mimeType: m.mimeType,
                publicId: m.publicId,
                resourceType: m.resourceType,
            })),
        });

        return apiJson({ message: 'Survey details updated', ...result });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'SUPPLEMENT_FAILED';
        if (msg === 'INVITATION_NOT_FOUND') {
            return apiError('No open request for additional survey details', 404, {
                code: 'NOT_FOUND',
            });
        }
        if (msg === 'RESPONSE_NOT_FOUND') {
            return apiError('Survey response not found', 404, { code: 'NOT_FOUND' });
        }
        if (msg === 'NO_SUPPLEMENT_DATA') {
            return apiError('Provide at least one requested missing field', 400, {
                code: 'VALIDATION_ERROR',
            });
        }
        console.error('POST /disaster-survey/responses/supplement:', e);
        return apiError('Failed to update survey details', 500);
    }
}
