import { Resend } from 'resend';
import type { EmailBatchItemResult, EmailSendResult, OperationalEmailMessage } from '@/lib/email/types';
import {
    emailFromAddress,
    resendBatchSize,
    resendConfigured,
    SMTP_CONFIG_HINT,
} from '@/lib/email/config';

let cachedClient: Resend | null = null;

function getResendClient(): Resend {
    if (!cachedClient) {
        cachedClient = new Resend(process.env.RESEND_API_KEY!.trim());
    }
    return cachedClient;
}

function formatFromAddress(from: string): string {
    const name = process.env.EMAIL_FROM_NAME?.trim();
    return name ? `${name} <${from}>` : from;
}

function normalizeToAddress(to: string): string[] {
    const trimmed = to.trim();
    return trimmed ? [trimmed] : [];
}

type ResendBatchItemError = {
    index: number;
    message: string;
};

type ResendBatchSuccessBody = {
    data?: { id: string }[];
    errors?: ResendBatchItemError[];
};

async function sendChunkIndividually(
    messages: OperationalEmailMessage[],
): Promise<EmailBatchItemResult[]> {
    const results: EmailBatchItemResult[] = [];
    for (const message of messages) {
        const result = await sendViaResend(message);
        results.push({ to: message.to, ...result });
    }
    return results;
}

function mapPermissiveBatchResults(
    chunk: OperationalEmailMessage[],
    body: ResendBatchSuccessBody,
): EmailBatchItemResult[] {
    const errorsByIndex = new Map<number, string>();
    for (const item of body.errors ?? []) {
        errorsByIndex.set(item.index, item.message);
    }

    return chunk.map((message, index) => {
        const batchError = errorsByIndex.get(index);
        if (batchError) {
            return { to: message.to, sent: false, error: batchError };
        }

        const messageId = body.data?.[index]?.id;
        if (messageId) {
            return { to: message.to, sent: true, messageId };
        }

        return { to: message.to, sent: false, error: 'Unknown batch delivery error' };
    });
}

export async function sendViaResend(message: OperationalEmailMessage): Promise<EmailSendResult> {
    const from = emailFromAddress();
    if (!from) {
        return { sent: false, error: 'No From address configured. Set EMAIL_FROM or RESEND_FROM.' };
    }
    if (!resendConfigured()) {
        return { sent: false, error: `Resend is not configured. ${SMTP_CONFIG_HINT}` };
    }

    try {
        const resend = getResendClient();
        const payload: Parameters<Resend['emails']['send']>[0] = {
            from: formatFromAddress(from),
            to: normalizeToAddress(message.to),
            subject: message.subject,
            text: message.text,
            html: message.html,
        };

        if (message.attachments?.length) {
            payload.attachments = message.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
            }));
        }

        const { data, error } = await resend.emails.send(payload);
        if (error) return { sent: false, error: error.message };
        return { sent: true, messageId: data?.id };
    } catch (e) {
        return { sent: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/** Resend batch API — up to 100 messages per request. */
export async function sendBatchViaResend(
    messages: OperationalEmailMessage[],
): Promise<EmailBatchItemResult[]> {
    const from = emailFromAddress();
    if (!from) {
        return messages.map((m) => ({
            to: m.to,
            sent: false,
            error: 'No From address configured.',
        }));
    }
    if (!resendConfigured()) {
        return messages.map((m) => ({
            to: m.to,
            sent: false,
            error: 'Resend is not configured.',
        }));
    }

    const formattedFrom = formatFromAddress(from);
    const resend = getResendClient();
    const results: EmailBatchItemResult[] = [];

    for (let i = 0; i < messages.length; i += resendBatchSize()) {
        const chunk = messages.slice(i, i + resendBatchSize());
        const payloads = chunk.map((m) => ({
            from: formattedFrom,
            to: normalizeToAddress(m.to),
            subject: m.subject,
            text: m.text,
            html: m.html,
        }));

        try {
            const { data, error } = await resend.batch.send(payloads, {
                batchValidation: 'permissive',
            });

            if (error || !data) {
                const fallback = await sendChunkIndividually(chunk);
                results.push(...fallback);
                continue;
            }

            results.push(...mapPermissiveBatchResults(chunk, data as ResendBatchSuccessBody));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            for (const m of chunk) {
                results.push({ to: m.to, sent: false, error: msg });
            }
        }
    }

    return results;
}
