import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { supplementIdaApplication } from '@/lib/services/ida-service';
import { IDA_DOCUMENT_KIND_IDS } from '@/lib/types/ida';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const mediaRefSchema = z.object({
    url: z.string().url(),
    fileName: z.string().min(1).optional(),
    mimeType: z.string().optional(),
    publicId: z.string().optional(),
    resourceType: z.enum(['image', 'video', 'raw']).optional(),
    kind: z.enum(IDA_DOCUMENT_KIND_IDS).optional(),
});

const schema = z.object({
    invitationId: z.string().min(1),
    insuranceCompany: z.string().max(240).optional(),
    currentLocation: z.string().max(500).optional(),
    documents: z.array(mediaRefSchema).max(20).optional(),
});

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) return validationError(zodFieldErrors(parsed.error));

        const result = await supplementIdaApplication(auth.userId, parsed.data);
        return apiJson({
            message: 'Additional information submitted',
            ...result,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'SUPPLEMENT_FAILED';
        if (msg === 'INVITATION_NOT_FOUND' || msg === 'APPLICATION_NOT_FOUND') {
            return apiError('Application not found', 404, { code: 'NOT_FOUND' });
        }
        console.error('POST /ida/applications/supplement:', e);
        return apiError('Failed to submit additional information', 500);
    }
}
