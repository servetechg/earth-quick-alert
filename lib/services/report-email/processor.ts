import ReportEmailJob from '@/models/ReportEmailJob';
import { buildReportEmailContent } from '@/lib/email/report-email-content';
import { emailDeliveryConfigured, resendBatchSize } from '@/lib/email/config';
import { sendOperationalEmailBatch } from '@/lib/email/operational-mail';
import type { OperationalEmailMessage } from '@/lib/email/types';

function logRecipientDelivery(params: {
    jobId: string;
    provider: string;
    email: string;
    name: string;
    role: string;
    sent: boolean;
    messageId?: string;
    error?: string;
}) {
    const tag = params.sent ? 'SENT' : 'FAILED';
    const payload = {
        jobId: params.jobId,
        provider: params.provider,
        email: params.email,
        name: params.name,
        role: params.role,
        ...(params.sent
            ? { messageId: params.messageId ?? undefined }
            : { error: params.error ?? 'Unknown delivery error' }),
    };
    if (params.sent) console.log(`[report-email] ${tag}`, payload);
    else console.error(`[report-email] ${tag}`, payload);
}

function buildMessagesForRecipients(
    job: {
        sentByName: string;
        sentByEmail: string;
        reportTitle: string;
        summaryLine: string;
        pdfUrl: string;
        filename: string;
    },
    recipients: { email: string }[],
): OperationalEmailMessage[] {
    const senderName = job.sentByName || job.sentByEmail;
    return recipients.map((recipient) => {
        const { subject, text, html } = buildReportEmailContent({
            senderName,
            reportTitle: job.reportTitle,
            summaryLine: job.summaryLine || undefined,
            pdfUrl: job.pdfUrl,
            filename: job.filename,
        });
        return { to: recipient.email, subject, text, html };
    });
}

export async function failReportEmailJob(jobId: string, error: string) {
    await ReportEmailJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        lastError: error,
        completedAt: new Date(),
    });
}

/** Mark job processing and return how many Inngest batch steps are needed. */
export async function prepareReportEmailJob(jobId: string) {
    if (!emailDeliveryConfigured()) {
        await failReportEmailJob(jobId, 'Email delivery is not configured (set RESEND_API_KEY or SMTP).');
        throw new Error('Email delivery is not configured.');
    }

    const job = await ReportEmailJob.findOneAndUpdate(
        { _id: jobId, status: { $in: ['queued', 'processing'] } },
        { status: 'processing', startedAt: new Date() },
        { new: true },
    );

    if (!job) throw new Error(`Report email job not found or already completed: ${jobId}`);

    const pendingCount = job.recipients.filter((r) => r.status === 'pending').length;
    const batchSize = resendBatchSize();
    const batchCount = pendingCount === 0 ? 0 : Math.ceil(pendingCount / batchSize);

    console.log('[report-email] Job started (Inngest)', {
        jobId: String(job._id),
        provider: job.provider,
        reportTitle: job.reportTitle,
        pendingCount,
        batchCount,
        batchSize,
    });

    return { batchCount, batchSize, pendingCount };
}

/** Process the next chunk of pending recipients (up to batchSize). */
export async function processReportEmailJobBatch(jobId: string, batchSize: number) {
    const job = await ReportEmailJob.findById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const jobIdStr = String(job._id);
    const pending = job.recipients.filter((r) => r.status === 'pending');
    const slice = pending.slice(0, batchSize);
    if (slice.length === 0) return { sent: 0, failed: 0 };

    const messages = buildMessagesForRecipients(job, slice);
    const results = await sendOperationalEmailBatch(messages);
    const resultByEmail = new Map(results.map((r) => [r.to.toLowerCase(), r]));

    let sent = 0;
    let failed = 0;

    for (const recipient of job.recipients) {
        if (recipient.status !== 'pending') continue;
        if (!slice.some((s) => s.email === recipient.email)) continue;

        const result = resultByEmail.get(recipient.email.toLowerCase());
        if (result?.sent) {
            recipient.status = 'sent';
            recipient.sentAt = new Date();
            recipient.messageId = result.messageId ?? '';
            recipient.error = '';
            sent += 1;
            logRecipientDelivery({
                jobId: jobIdStr,
                provider: job.provider,
                email: recipient.email,
                name: recipient.name,
                role: recipient.role,
                sent: true,
                messageId: recipient.messageId,
            });
        } else {
            recipient.status = 'failed';
            recipient.error = result?.error ?? 'Unknown delivery error';
            failed += 1;
            logRecipientDelivery({
                jobId: jobIdStr,
                provider: job.provider,
                email: recipient.email,
                name: recipient.name,
                role: recipient.role,
                sent: false,
                error: recipient.error,
            });
        }
    }

    job.markModified('recipients');
    await job.save();
    return { sent, failed };
}

export async function finalizeReportEmailJob(jobId: string) {
    const job = await ReportEmailJob.findById(jobId);
    if (!job) return null;

    const sentCount = job.recipients.filter((r) => r.status === 'sent').length;
    const failedCount = job.recipients.filter((r) => r.status === 'failed').length;

    let status: 'completed' | 'partial' | 'failed' = 'completed';
    if (sentCount === 0) status = 'failed';
    else if (failedCount > 0) status = 'partial';

    job.sentCount = sentCount;
    job.failedCount = failedCount;
    job.totalCount = job.recipients.length;
    job.status = status;
    job.completedAt = new Date();
    if (status === 'failed' && !job.lastError) {
        job.lastError = 'All recipient deliveries failed.';
    }
    await job.save();

    const sentAccounts = job.recipients
        .filter((r) => r.status === 'sent')
        .map((r) => ({ email: r.email, name: r.name, role: r.role }));
    const failedAccounts = job.recipients
        .filter((r) => r.status === 'failed')
        .map((r) => ({ email: r.email, name: r.name, role: r.role, error: r.error }));

    console.log('[report-email] Job finished', {
        jobId: String(job._id),
        provider: job.provider,
        status: job.status,
        sentCount,
        failedCount,
        sent: sentAccounts,
        failed: failedAccounts,
    });

    return job;
}
