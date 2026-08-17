import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getCloudinary } from '@/lib/cloudinary';
import { IDA_MEDIA_FOLDER } from '@/lib/services/ida-media-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ kind: z.enum(['picture', 'video', 'document']) });

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
            return apiError('kind must be picture, video, or document', 400, {
                code: 'VALIDATION_ERROR',
            });
        }

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        if (!cloudName || !apiKey || !apiSecret) {
            return apiError('Media uploads are not configured on the server', 500, {
                code: 'UPLOAD_NOT_CONFIGURED',
            });
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const folder = IDA_MEDIA_FOLDER;
        const cld = getCloudinary();
        const signature = cld.utils.api_sign_request({ folder, timestamp }, apiSecret);

        const resourceType =
            parsed.data.kind === 'video' ? 'video' : parsed.data.kind === 'document' ? 'raw' : 'image';

        return apiJson({
            cloudName,
            apiKey,
            timestamp,
            signature,
            folder,
            resourceType,
        });
    } catch (e) {
        console.error('POST /ida/media/signature:', e);
        return apiError('Failed to prepare media upload', 500);
    }
}
