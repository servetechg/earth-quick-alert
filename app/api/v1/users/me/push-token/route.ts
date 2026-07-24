import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import {
    clearExpoPushToken,
    saveExpoPushToken,
} from '@/lib/services/mobile/profile-incomplete-reminder-service';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';

const pushTokenSchema = z.object({
    expoPushToken: z
        .string()
        .trim()
        .min(1, 'expoPushToken is required')
        // ExpoGo / EAS tokens: ExponentPushToken[...] or ExpoPushToken[...]
        .regex(/^Expo(nent)?PushToken\[.+\]$/, 'Invalid Expo push token format'),
});

export async function PUT(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = pushTokenSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        await saveExpoPushToken(auth.userId, parsed.data.expoPushToken);

        return apiJson({ message: 'Push token saved' });
    } catch (e) {
        console.error('v1/users/me/push-token PUT:', e);
        return apiError('Failed to save push token', 500);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        await clearExpoPushToken(auth.userId);

        return apiJson({ message: 'Push token removed' });
    } catch (e) {
        console.error('v1/users/me/push-token DELETE:', e);
        return apiError('Failed to remove push token', 500);
    }
}
