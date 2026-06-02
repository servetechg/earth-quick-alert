import ReportEmailJob from '@/models/ReportEmailJob';
import { buildReportEmailContent } from '@/lib/email/report-email-content';
import { sendViaSmtp, smtpConfigured } from '@/lib/email/smtp-client';

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_BATCH_DELAY_MS = 300;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recoverStaleProcessingJobs() {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    await ReportEmailJob.updateMany(
        { status: 'processing', startedAt: { $lt: staleBefore } },
        { status: 'queued', lastError: 'Recovered stale processing job.' },
    );
}

function reportEmailConcurrency(): number {
    const n = Number(process.env.REPORT_EMAIL_CONCURRENCY ?? DEFAULT_CONCURRENCY);
    return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : DEFAULT_CONCURRENCY;
}

function reportEmailBatchDelayMs(): number {
    const n = Number(process.env.REPORT_EMAIL_BATCH_DELAY_MS ?? DEFAULT_BATCH_DELAY_MS);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_BATCH_DELAY_MS;
}

async function sendRecipientEmail(params: {
    to: string;
    senderName: string;
    reportTitle: string;
    summaryLine: string;
    pdfUrl: string;
    filename: string;
}) {
    const { subject, text, html } = buildReportEmailContent({
        senderName: params.senderName,
        reportTitle: params.reportTitle,
        summaryLine: params.summaryLine || undefined,
        pdfUrl: params.pdfUrl,
        filename: params.filename,
    });

    return sendViaSmtp({ to: params.to, subject, text, html });
}

async function finalizeJob(jobId: string) {
    const job = await ReportEmailJob.findById(jobId);
    if (!job) return null;

    const sentCount = job.recipients.filter((r) => r.status === 'sent').length;
    const failedCount = job.recipients.filter((r) => r.status === 'failed').length;
    const totalCount = job.recipients.length;

    let status: 'completed' | 'partial' | 'failed' = 'completed';
    if (sentCount === 0) status = 'failed';
    else if (failedCount > 0) status = 'partial';

    job.sentCount = sentCount;
    job.failedCount = failedCount;
    job.totalCount = totalCount;
    job.status = status;
    job.completedAt = new Date();
    if (status === 'failed' && !job.lastError) {
        job.lastError = 'All recipient deliveries failed.';
    }
    await job.save();

    const sentAccounts = job.recipients
        .filter((r) => r.status === 'sent')
        .map((r) => ({ email: r.email, name: r.name, role: r.role }));

    console.log('[report-email-worker] Job finished', {
        jobId: String(job._id),
        status: job.status,
        sentCount,
        failedCount,
        accounts: sentAccounts,
    });

    return job;
}

export async function processReportEmailJobById(jobId: string) {
    if (!smtpConfigured()) {
        await ReportEmailJob.findByIdAndUpdate(jobId, {
            status: 'failed',
            lastError: 'SMTP is not configured.',
            completedAt: new Date(),
        });
        return null;
    }

    const job = await ReportEmailJob.findOneAndUpdate(
        { _id: jobId, status: { $in: ['queued', 'processing'] } },
        { status: 'processing', startedAt: new Date() },
        { new: true },
    );

    if (!job) return null;

    const pendingIndexes = job.recipients
        .map((r, index) => (r.status === 'pending' ? index : -1))
        .filter((index) => index >= 0);

    const concurrency = reportEmailConcurrency();
    const batchDelayMs = reportEmailBatchDelayMs();

    for (let offset = 0; offset < pendingIndexes.length; offset += concurrency) {
        const batchIndexes = pendingIndexes.slice(offset, offset + concurrency);

        await Promise.all(
            batchIndexes.map(async (recipientIndex) => {
                const recipient = job.recipients[recipientIndex];
                const result = await sendRecipientEmail({
                    to: recipient.email,
                    senderName: job.sentByName || job.sentByEmail,
                    reportTitle: job.reportTitle,
                    summaryLine: job.summaryLine,
                    pdfUrl: job.pdfUrl,
                    filename: job.filename,
                });

                if (result.sent) {
                    recipient.status = 'sent';
                    recipient.sentAt = new Date();
                    recipient.error = '';
                } else {
                    recipient.status = 'failed';
                    recipient.error = result.error ?? 'Unknown SMTP error';
                }
            }),
        );

        job.markModified('recipients');
        await job.save();

        if (offset + concurrency < pendingIndexes.length && batchDelayMs > 0) {
            await sleep(batchDelayMs);
        }
    }

    return finalizeJob(String(job._id));
}

/** Atomically claim the oldest queued job (safe for multiple workers). */
export async function claimNextReportEmailJob() {
    return ReportEmailJob.findOneAndUpdate(
        { status: 'queued' },
        { status: 'processing', startedAt: new Date() },
        { sort: { createdAt: 1 }, new: true },
    );
}

export async function processNextReportEmailJob() {
    const claimed = await claimNextReportEmailJob();
    if (!claimed) return null;
    return processReportEmailJobById(String(claimed._id));
}

export async function drainReportEmailQueue(maxJobs = 10) {
    await recoverStaleProcessingJobs();
    let processed = 0;
    for (let i = 0; i < maxJobs; i += 1) {
        const job = await processNextReportEmailJob();
        if (!job) break;
        processed += 1;
    }
    return processed;
}
