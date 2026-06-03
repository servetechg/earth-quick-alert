import { resolveEmailProvider } from '@/lib/email/config';
import { sendViaResend, sendBatchViaResend } from '@/lib/email/resend-client';
import { sendViaSmtp } from '@/lib/email/smtp-client';
import type {
    EmailBatchItemResult,
    EmailSendResult,
    OperationalEmailMessage,
} from '@/lib/email/types';

/** Single operational email — Resend when configured, otherwise SMTP. */
export async function sendOperationalEmail(
    message: OperationalEmailMessage,
): Promise<EmailSendResult> {
    if (resolveEmailProvider() === 'resend') {
        return sendViaResend(message);
    }
    return sendViaSmtp(message);
}

/** Batch send for large campaigns — Resend batch API or SMTP with limited concurrency. */
export async function sendOperationalEmailBatch(
    messages: OperationalEmailMessage[],
): Promise<EmailBatchItemResult[]> {
    if (messages.length === 0) return [];

    if (resolveEmailProvider() === 'resend') {
        return sendBatchViaResend(messages);
    }

    const concurrency = Number(process.env.REPORT_EMAIL_CONCURRENCY ?? 5);
    const limit = Number.isFinite(concurrency) && concurrency > 0 ? Math.min(20, concurrency) : 5;
    const results: EmailBatchItemResult[] = [];

    for (let i = 0; i < messages.length; i += limit) {
        const chunk = messages.slice(i, i + limit);
        const chunkResults = await Promise.all(
            chunk.map(async (message) => {
                const result = await sendViaSmtp(message);
                return { to: message.to, ...result };
            }),
        );
        results.push(...chunkResults);

        const delay = Number(process.env.REPORT_EMAIL_BATCH_DELAY_MS ?? 300);
        if (i + limit < messages.length && delay > 0) {
            await new Promise((r) => setTimeout(r, delay));
        }
    }

    return results;
}
