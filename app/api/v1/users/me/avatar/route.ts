import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import {
    PROFILE_AVATAR_MAX_BYTES,
    removeMobileProfileAvatar,
    uploadMobileProfileAvatar,
} from '@/lib/services/mobile/profile-avatar-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const form = await req.formData().catch(() => null);
        const file = form?.get('file');
        if (!file || !(file instanceof File)) {
            return apiError('file is required (multipart/form-data field "file")', 400, {
                code: 'VALIDATION_ERROR',
            });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const user = await uploadMobileProfileAvatar(auth.userId, {
            buffer,
            mimeType: file.type,
            size: file.size,
            filename: file.name,
        });

        return apiJson({ message: 'Profile photo updated', user });
    } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'UNSUPPORTED_MEDIA_TYPE') {
            return apiError('Use PNG, JPG, or WebP.', 415, { code: 'UNSUPPORTED_MEDIA_TYPE' });
        }
        if (code === 'EMPTY_FILE') {
            return apiError('Empty file', 400, { code: 'VALIDATION_ERROR' });
        }
        if (code === 'FILE_TOO_LARGE') {
            return apiError(`Profile photo must be ${PROFILE_AVATAR_MAX_BYTES / (1024 * 1024)}MB or smaller.`, 413, {
                code: 'FILE_TOO_LARGE',
            });
        }
        if (code === 'USER_NOT_FOUND') {
            return apiError('User not found', 404);
        }
        console.error('v1/users/me/avatar POST:', e);
        return apiError('Failed to upload profile photo', 500);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const user = await removeMobileProfileAvatar(auth.userId);
        return apiJson({ message: 'Profile photo removed', user });
    } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'USER_NOT_FOUND') {
            return apiError('User not found', 404);
        }
        console.error('v1/users/me/avatar DELETE:', e);
        return apiError('Failed to remove profile photo', 500);
    }
}
