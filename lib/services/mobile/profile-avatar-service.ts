import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import type { ApiUser } from '@/lib/types/mobile/auth';
import { toApiUser } from '@/lib/auth/mobile/user-mapper';
import {
    destroyCloudinaryImage,
    uploadImageBufferToCloudinary,
} from '@/lib/cloudinary/upload-image-buffer';

export const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_AVATAR_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const PROFILE_AVATAR_FOLDER = 'earthquick/profiles';

export async function uploadMobileProfileAvatar(
    userId: string,
    file: { buffer: Buffer; mimeType: string; size: number; filename?: string },
): Promise<ApiUser> {
    if (!PROFILE_AVATAR_ALLOWED_MIME.has(file.mimeType)) {
        const err = new Error('UNSUPPORTED_MEDIA_TYPE') as Error & { code: string };
        err.code = 'UNSUPPORTED_MEDIA_TYPE';
        throw err;
    }
    if (file.size <= 0) {
        const err = new Error('EMPTY_FILE') as Error & { code: string };
        err.code = 'EMPTY_FILE';
        throw err;
    }
    if (file.size > PROFILE_AVATAR_MAX_BYTES) {
        const err = new Error('FILE_TOO_LARGE') as Error & { code: string };
        err.code = 'FILE_TOO_LARGE';
        throw err;
    }

    await connectDB();
    const existing = await User.findById(userId).select('profilePicPublicId');
    if (!existing) {
        const err = new Error('USER_NOT_FOUND') as Error & { code: string };
        err.code = 'USER_NOT_FOUND';
        throw err;
    }

    const { secure_url, public_id } = await uploadImageBufferToCloudinary({
        buffer: file.buffer,
        folder: PROFILE_AVATAR_FOLDER,
        filename: file.filename,
    });

    const oldPublicId = existing.profilePicPublicId?.trim() || '';
    if (oldPublicId && oldPublicId !== public_id) {
        await destroyCloudinaryImage(oldPublicId);
    }

    const updated = await User.findByIdAndUpdate(
        userId,
        { $set: { profilePic: secure_url, profilePicPublicId: public_id } },
        { new: true },
    );
    if (!updated) {
        const err = new Error('USER_NOT_FOUND') as Error & { code: string };
        err.code = 'USER_NOT_FOUND';
        throw err;
    }

    return toApiUser(updated);
}

export async function removeMobileProfileAvatar(userId: string): Promise<ApiUser> {
    await connectDB();
    const existing = await User.findById(userId).select('profilePicPublicId');
    if (!existing) {
        const err = new Error('USER_NOT_FOUND') as Error & { code: string };
        err.code = 'USER_NOT_FOUND';
        throw err;
    }

    const oldPublicId = existing.profilePicPublicId?.trim() || '';
    if (oldPublicId) {
        await destroyCloudinaryImage(oldPublicId);
    }

    const updated = await User.findByIdAndUpdate(
        userId,
        { $set: { profilePic: '', profilePicPublicId: '' } },
        { new: true },
    );
    if (!updated) {
        const err = new Error('USER_NOT_FOUND') as Error & { code: string };
        err.code = 'USER_NOT_FOUND';
        throw err;
    }

    return toApiUser(updated);
}
