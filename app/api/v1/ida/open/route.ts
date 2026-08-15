import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { markIdaOpened } from '@/lib/services/ida-service';
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

        await markIdaOpened(auth.userId, parsed.data.invitationId);
        return apiJson({ message: 'Opened' });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'OPEN_FAILED';
        if (msg === 'INVITATION_NOT_FOUND') {
            return apiError('Invitation not found', 404, { code: 'NOT_FOUND' });
        }
        console.error('POST /ida/open:', e);
        return apiError('Failed to mark application opened', 500);
    }
}
