import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import {
    PROFILE_DOCUMENT_MAX_BYTES,
    removeMobileProfileDocument,
    uploadMobileProfileDocument,
} from '@/lib/services/mobile/profile-document-service';
import { isProfileDocumentKind } from '@/lib/validation/mobile/profile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ kind: string }> };

function invalidKindResponse() {
    return apiError('kind must be ownership or residency', 400, { code: 'VALIDATION_ERROR' });
}

export async function POST(req: NextRequest, context: RouteContext) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const { kind: rawKind } = await context.params;
        if (!isProfileDocumentKind(rawKind)) return invalidKindResponse();

        const form = await req.formData().catch(() => null);
        const file = form?.get('file');
        if (!file || !(file instanceof File)) {
            return apiError('file is required (multipart/form-data field "file")', 400, {
                code: 'VALIDATION_ERROR',
            });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadMobileProfileDocument(auth.userId, rawKind, {
            buffer,
            mimeType: file.type,
            size: file.size,
            filename: file.name,
        });

        return apiJson({
            message: 'Document uploaded',
            document: result.document,
            ...(result.profile ? { profile: result.profile } : {}),
        });
    } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'UNSUPPORTED_MEDIA_TYPE') {
            return apiError('Use PDF, PNG, JPG, or WebP.', 415, { code: 'UNSUPPORTED_MEDIA_TYPE' });
        }
        if (code === 'EMPTY_FILE') {
            return apiError('Empty file', 400, { code: 'VALIDATION_ERROR' });
        }
        if (code === 'FILE_TOO_LARGE') {
            return apiError(
                `Document must be ${PROFILE_DOCUMENT_MAX_BYTES / (1024 * 1024)}MB or smaller.`,
                413,
                { code: 'FILE_TOO_LARGE' },
            );
        }
        console.error('v1/profile/documents POST:', e);
        return apiError('Failed to upload document', 500);
    }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const { kind: rawKind } = await context.params;
        if (!isProfileDocumentKind(rawKind)) return invalidKindResponse();

        const result = await removeMobileProfileDocument(auth.userId, rawKind);
        return apiJson({
            message: 'Document removed',
            document: result.document,
            ...(result.profile ? { profile: result.profile } : {}),
        });
    } catch (e) {
        console.error('v1/profile/documents DELETE:', e);
        return apiError('Failed to remove document', 500);
    }
}
