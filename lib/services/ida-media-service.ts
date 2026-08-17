import { normalizeMediaList } from '@/lib/services/disaster-survey-media-service';
import type { IdaDocumentKindId, IdaDocumentRef, IdaMediaRef } from '@/lib/types/ida';
import { IDA_DOCUMENT_KIND_IDS } from '@/lib/types/ida';

export const IDA_MEDIA_FOLDER = 'earthquick/ida';
export const IDA_MAX_DOCUMENTS = 20;
export const IDA_MAX_DAMAGE_PHOTOS = 5;

export { normalizeMediaList };

export function normalizeIdaDocuments(value: unknown): IdaDocumentRef[] {
    if (!Array.isArray(value)) return [];
    const out: IdaDocumentRef[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const base = normalizeMediaList([row], 1)[0] as IdaMediaRef | undefined;
        if (!base) continue;
        const kindRaw = String(row.kind ?? 'damage_photo').trim();
        const kind = (IDA_DOCUMENT_KIND_IDS as readonly string[]).includes(kindRaw)
            ? (kindRaw as IdaDocumentKindId)
            : 'damage_photo';
        out.push({ ...base, kind });
        if (out.length >= IDA_MAX_DOCUMENTS) break;
    }
    return out;
}
