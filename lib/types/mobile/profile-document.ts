export type ProfileDocumentKind = 'ownership' | 'residency';

export const PROFILE_DOCUMENT_KINDS: ProfileDocumentKind[] = ['ownership', 'residency'];

export type ProfileDocumentRef = {
    url: string;
    fileName: string;
    mimeType?: string;
    /** Stored server-side for Cloudinary cleanup; optional in client payloads */
    publicId?: string;
    resourceType?: 'image' | 'raw';
};
