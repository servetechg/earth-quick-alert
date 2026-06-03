import ReportEmailJob from '@/models/ReportEmailJob';
import { uploadRiskReportPdf } from '@/lib/cloudinary/report-pdf';
import { resolveEmailProvider } from '@/lib/email/config';
import {
    noRecipientsMessage,
    resolveRecipientAudience,
    resolveReportEmailRecipients,
    type ReportEmailAudience,
} from '@/lib/email/risk-report-recipients';

const MAX_PDF_BYTES = 12 * 1024 * 1024;

export type CreateReportEmailJobInput = {
    pdfBase64: string;
    filename: string;
    reportTitle: string;
    summaryLine?: string;
    audience?: string;
    senderUserId: string;
    senderEmail: string;
    senderName: string;
    senderRole: string;
};

export type ReportEmailJobSnapshot = {
    jobId: string;
    status: string;
    audience: string;
    reportTitle: string;
    provider: string;
    totalCount: number;
    sentCount: number;
    failedCount: number;
    completedAt: string | null;
    lastError: string | null;
};

function sanitizeFilename(filename: string): string {
    const trimmed = filename.trim().replace(/[^\w.\- ]+/g, '_');
    return trimmed.endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

export async function createReportEmailJob(input: CreateReportEmailJobInput) {
    const pdfBase64 = input.pdfBase64.trim();
    if (!pdfBase64) throw new Error('pdfBase64 is required');

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    if (!pdfBuffer.length || pdfBuffer.length > MAX_PDF_BYTES) {
        throw new Error('Invalid or oversized PDF attachment');
    }

    const audience = resolveRecipientAudience(input.senderRole, input.audience);
    const recipients = await resolveReportEmailRecipients({
        senderEmail: input.senderEmail,
        audience,
    });

    if (recipients.length === 0) {
        throw new Error(noRecipientsMessage(audience));
    }

    const filename = sanitizeFilename(input.filename || 'Ready2Go-Risk-Report.pdf');
    const upload = await uploadRiskReportPdf({ buffer: pdfBuffer, filename });

    const job = await ReportEmailJob.create({
        status: 'queued',
        audience: audience as ReportEmailAudience | 'responder-only',
        reportTitle: input.reportTitle.trim().slice(0, 200) || 'Situational Risk Assessment Report',
        summaryLine: input.summaryLine?.trim().slice(0, 500) ?? '',
        filename,
        pdfUrl: upload.secure_url,
        pdfPublicId: upload.public_id,
        sentByUserId: input.senderUserId,
        sentByEmail: input.senderEmail.trim().toLowerCase(),
        sentByName: input.senderName.trim() || input.senderEmail,
        provider: resolveEmailProvider(),
        recipients: recipients.map((r) => ({
            email: r.email,
            name: r.name,
            role: r.role,
            status: 'pending',
        })),
        totalCount: recipients.length,
        sentCount: 0,
        failedCount: 0,
    });

    return {
        jobId: String(job._id),
        recipientCount: recipients.length,
        status: job.status as string,
        provider: job.provider as string,
    };
}

export function serializeReportEmailJob(job: {
    _id: unknown;
    status: string;
    audience: string;
    reportTitle: string;
    provider?: string;
    totalCount: number;
    sentCount: number;
    failedCount: number;
    completedAt?: Date | null;
    lastError?: string;
}): ReportEmailJobSnapshot {
    return {
        jobId: String(job._id),
        status: job.status,
        audience: job.audience,
        reportTitle: job.reportTitle,
        provider: job.provider ?? 'smtp',
        totalCount: job.totalCount,
        sentCount: job.sentCount,
        failedCount: job.failedCount,
        completedAt: job.completedAt ? job.completedAt.toISOString() : null,
        lastError: job.lastError?.trim() || null,
    };
}

export async function getReportEmailJobForUser(jobId: string, userId: string) {
    const job = await ReportEmailJob.findOne({ _id: jobId, sentByUserId: userId }).lean();
    if (!job) return null;
    return serializeReportEmailJob(job);
}
