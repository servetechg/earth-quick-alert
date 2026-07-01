import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { markDisasterSurveyOpened } from '@/lib/services/disaster-survey-service';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';

const schema = z.object({ invitationId: z.string().min(1) });

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) return validationError(zodFieldErrors(parsed.error));

        await markDisasterSurveyOpened(auth.userId, parsed.data.invitationId);
        return apiJson({ message: 'Survey opened' });
    } catch (e) {
        console.error('POST /disaster-survey/open:', e);
        return apiError('Failed to update survey', 500);
    }
}
