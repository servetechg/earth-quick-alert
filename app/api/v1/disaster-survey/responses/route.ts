import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { submitDisasterSurveyResponse } from '@/lib/services/disaster-survey-service';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';
import {
    DISASTER_IMMEDIATE_NEED_IDS,
    type DisasterImmediateNeedId,
} from '@/lib/types/disaster-survey';

const needEnum = DISASTER_IMMEDIATE_NEED_IDS as unknown as [
    DisasterImmediateNeedId,
    ...DisasterImmediateNeedId[],
];

const schema = z.object({
    invitationId: z.string().min(1),
    immediateNeeds: z.array(z.enum(needEnum)).min(1),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) return validationError(zodFieldErrors(parsed.error));

        const result = await submitDisasterSurveyResponse(auth.userId, parsed.data);
        return apiJson({ message: 'Survey submitted', ...result });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'SUBMIT_FAILED';
        if (msg === 'INVITATION_NOT_FOUND') {
            return apiError('Survey invitation not found or expired', 404, { code: 'NOT_FOUND' });
        }
        if (msg === 'ALREADY_SUBMITTED') {
            return apiError('Survey already submitted', 409, { code: 'ALREADY_SUBMITTED' });
        }
        console.error('POST /disaster-survey/responses:', e);
        return apiError('Failed to submit survey', 500);
    }
}
