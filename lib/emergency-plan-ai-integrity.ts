import * as XLSX from 'xlsx';

/** Fast upload path — smaller excerpt = quicker model turnaround */
export const FAST_TEXT_CAP = 8000;

/** Manual re-scan / backfill — slightly more context */
export const DEFAULT_TEXT_CAP = 12000;

export type ExtractTextOptions = {
    maxChars?: number;
    /** XLSX only — fewer sheets = faster parsing */
    maxSheets?: number;
};

/**
 * Extract plain text from continuity vault buffers (PDF, DOCX, CSV, XLSX).
 */
export async function extractTextFromBuffer(
    buffer: Buffer,
    ext: string,
    opts?: ExtractTextOptions
): Promise<string> {
    const maxChars = opts?.maxChars ?? DEFAULT_TEXT_CAP;
    const maxSheets = opts?.maxSheets ?? 15;
    const e = ext.replace(/^\./, '').toLowerCase();

    if (e === 'csv') {
        return buffer.toString('utf8').slice(0, maxChars);
    }

    if (e === 'pdf') {
        try {
            const { PDFParse } = await import('pdf-parse');
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
            await parser.destroy();
            return String(result?.text || '').slice(0, maxChars);
        } catch {
            return '';
        }
    }

    if (e === 'docx') {
        try {
            const mammoth = await import('mammoth');
            const { value } = await mammoth.extractRawText({ buffer });
            return String(value || '').slice(0, maxChars);
        } catch {
            return '';
        }
    }

    if (e === 'xlsx' || e === 'xls') {
        try {
            const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
            const chunks: string[] = [];
            for (const name of wb.SheetNames.slice(0, maxSheets)) {
                const sheet = wb.Sheets[name];
                if (!sheet) continue;
                chunks.push(`--- Sheet: ${name} ---`);
                chunks.push(XLSX.utils.sheet_to_csv(sheet));
            }
            return chunks.join('\n').slice(0, maxChars);
        } catch {
            return '';
        }
    }

    return '';
}
