import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getCloudinary } from '@/lib/cloudinary';
import { DISASTER_SURVEY_MEDIA_FOLDER } from '@/lib/services/disaster-survey-media-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ kind: z.enum(['picture', 'video']) });

/**
 * Returns a short-lived Cloudinary signature so the mobile app can upload
 * directly. Large media must not pass through the serverless function
 * (Vercel caps request bodies at ~4.5MB).
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
            return apiError('kind must be picture or video', 400, { code: 'VALIDATION_ERROR' });
        }

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        if (!cloudName || !apiKey || !apiSecret) {
            console.error('[disaster-survey] Cloudinary env vars missing');
            return apiError('Media uploads are not configured on the server', 500, {
                code: 'UPLOAD_NOT_CONFIGURED',
            });
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const folder = DISASTER_SURVEY_MEDIA_FOLDER;

        const cld = getCloudinary();
        const signature = cld.utils.api_sign_request({ folder, timestamp }, apiSecret);

        return apiJson({
            cloudName,
            apiKey,
            timestamp,
            signature,
            folder,
            resourceType: parsed.data.kind === 'video' ? 'video' : 'image',
        });
    } catch (e) {
        console.error('POST /disaster-survey/media/signature:', e);
        return apiError('Failed to prepare media upload', 500);
    }
}
