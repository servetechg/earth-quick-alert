import connectDB from '@/lib/mongodb';
import UserProfile from '@/models/UserProfile';
import type { ProfileDocumentKind, ProfileDocumentRef } from '@/lib/types/mobile/profile-document';
import {
    destroyEmergencyPlanAsset,
    uploadEmergencyPlanBuffer,
} from '@/lib/emergency-plan-cloudinary';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';

export const PROFILE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PROFILE_DOCUMENT_ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
]);
export const PROFILE_DOCUMENT_FOLDER = 'earthquick/profile-documents';

const KIND_TO_FIELD: Record<ProfileDocumentKind, 'proofOfOwnership' | 'proofOfResidency'> = {
    ownership: 'proofOfOwnership',
    residency: 'proofOfResidency',
};

function toClientDocumentRef(stored: {
    url: string;
    fileName: string;
    mimeType?: string;
    publicId?: string;
    resourceType?: 'image' | 'raw';
}): ProfileDocumentRef {
    return {
        url: stored.url,
        fileName: stored.fileName,
        mimeType: stored.mimeType || undefined,
        publicId: stored.publicId || undefined,
        resourceType: stored.resourceType,
    };
}

export async function uploadMobileProfileDocument(
    userId: string,
    kind: ProfileDocumentKind,
    file: { buffer: Buffer; mimeType: string; size: number; filename?: string },
): Promise<{ document: ProfileDocumentRef; profile?: UserProfilePayload | null }> {
    if (!PROFILE_DOCUMENT_ALLOWED_MIME.has(file.mimeType)) {
        const err = new Error('UNSUPPORTED_MEDIA_TYPE') as Error & { code: string };
        err.code = 'UNSUPPORTED_MEDIA_TYPE';
        throw err;
    }
    if (file.size <= 0) {
        const err = new Error('EMPTY_FILE') as Error & { code: string };
        err.code = 'EMPTY_FILE';
        throw err;
    }
    if (file.size > PROFILE_DOCUMENT_MAX_BYTES) {
        const err = new Error('FILE_TOO_LARGE') as Error & { code: string };
        err.code = 'FILE_TOO_LARGE';
        throw err;
    }

    const upload = await uploadEmergencyPlanBuffer({
        buffer: file.buffer,
        mime: file.mimeType,
        filename: file.filename || `${kind}-document`,
        folder: PROFILE_DOCUMENT_FOLDER,
    });

    const document: ProfileDocumentRef = {
        url: upload.secure_url,
        fileName: file.filename || `${kind}-document`,
        mimeType: file.mimeType,
        publicId: upload.public_id,
        resourceType: upload.resource_type,
    };

    await connectDB();
    const field = KIND_TO_FIELD[kind];
    const existing = await UserProfile.findOne({ userId }).select(field).lean();

    if (existing) {
        const previous = existing[field] as ProfileDocumentRef | null | undefined;
        if (previous?.publicId && previous.publicId !== upload.public_id) {
            await destroyEmergencyPlanAsset(previous.publicId, previous.resourceType ?? 'raw');
        }
        await UserProfile.findOneAndUpdate({ userId }, { $set: { [field]: document } });
    }

    const profile = existing ? await loadUserProfile(userId) : null;
    return { document: toClientDocumentRef(document), profile };
}

export async function removeMobileProfileDocument(
    userId: string,
    kind: ProfileDocumentKind,
): Promise<{ document: null; profile?: UserProfilePayload | null }> {
    await connectDB();
    const field = KIND_TO_FIELD[kind];
    const existing = await UserProfile.findOne({ userId }).select(field).lean();
    const previous = existing?.[field] as ProfileDocumentRef | null | undefined;

    if (previous?.publicId) {
        await destroyEmergencyPlanAsset(previous.publicId, previous.resourceType ?? 'raw');
    }

    await UserProfile.findOneAndUpdate({ userId }, { $set: { [field]: null } });

    const profile = await loadUserProfile(userId);
    return { document: null, profile };
}
