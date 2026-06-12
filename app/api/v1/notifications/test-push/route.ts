import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { sendExpoPushNotification } from '@/lib/services/mobile/expo-push-service';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_PUSH !== 'true') {
        return apiError('Not available', 404);
    }

    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        await connectDB();
        const user = await User.findById(auth.userId).select('expoPushToken firstName').lean();
        const pushToken = user?.expoPushToken?.trim();

        if (!pushToken) {
            return apiError(
                'No Expo push token on file. Open the app on a physical device with a dev build, allow notifications, and wait a few seconds after login.',
                400,
                { code: 'NO_PUSH_TOKEN' },
            );
        }

        const name = user?.firstName?.trim() || 'there';
        const result = await sendExpoPushNotification({
            to: pushToken,
            title: 'Ready2Go server push test',
            body: `Hi ${name}, this push was sent from the backend API.`,
            data: { screen: 'Onboarding' },
        });

        if (!result.ok) {
            return apiError(result.error ?? 'Push failed', 502, { code: 'PUSH_FAILED' });
        }

        return apiJson({
            message: 'Test push sent',
            tokenPreview: `${pushToken.slice(0, 24)}…`,
        });
    } catch (e) {
        console.error('v1/notifications/test-push:', e);
        return apiError('Failed to send test push', 500);
    }
}
