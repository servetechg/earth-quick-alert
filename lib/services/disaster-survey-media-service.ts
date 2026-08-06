import type { DisasterSurveyMediaRef } from '@/lib/types/disaster-survey';

export const DISASTER_SURVEY_MAX_PICTURES = 3;
export const DISASTER_SURVEY_MAX_VIDEOS = 1;
export const DISASTER_SURVEY_MEDIA_FOLDER = 'earthquick/disaster-survey';

/** Only accept media we actually host, so clients cannot store arbitrary links. */
function isCloudinaryUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && parsed.hostname.endsWith('cloudinary.com');
    } catch {
        return false;
    }
}

export function normalizeMediaList(
    value: unknown,
    max: number,
): DisasterSurveyMediaRef[] {
    if (!Array.isArray(value)) return [];
    const out: DisasterSurveyMediaRef[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const url = typeof row.url === 'string' ? row.url.trim() : '';
        if (!url || !isCloudinaryUrl(url)) continue;
        out.push({
            url,
            fileName:
                typeof row.fileName === 'string' && row.fileName.trim()
                    ? row.fileName.trim()
                    : 'file',
            mimeType: typeof row.mimeType === 'string' ? row.mimeType : undefined,
            publicId: typeof row.publicId === 'string' ? row.publicId : undefined,
            resourceType:
                row.resourceType === 'image' ||
                row.resourceType === 'video' ||
                row.resourceType === 'raw'
                    ? row.resourceType
                    : undefined,
        });
        if (out.length >= max) break;
    }
    return out;
}
