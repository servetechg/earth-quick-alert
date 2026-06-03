export type EmailProvider = 'resend' | 'smtp';

export const SMTP_CONFIG_HINT =
    'Set RESEND_API_KEY + EMAIL_FROM, or SMTP_HOST/SMTP_USER/SMTP_PASS + SMTP_FROM.';

export function resendConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function smtpConfigured(): boolean {
    if (process.env.RESPONDER_INVITE_SMTP_URL?.trim()) return true;
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    return Boolean(host && user && pass != null && String(pass).length > 0);
}

export function emailDeliveryConfigured(): boolean {
    return resendConfigured() || smtpConfigured();
}

export function resolveEmailProvider(): EmailProvider {
    const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
    if (explicit === 'resend') return 'resend';
    if (explicit === 'smtp') return 'smtp';
    if (resendConfigured()) return 'resend';
    return 'smtp';
}

export function emailFromAddress(): string | undefined {
    return (
        process.env.EMAIL_FROM?.trim() ||
        process.env.RESEND_FROM?.trim() ||
        process.env.RESPONDER_INVITE_SMTP_FROM?.trim() ||
        process.env.SMTP_FROM?.trim() ||
        undefined
    );
}

export function resendBatchSize(): number {
    const n = Number(process.env.RESEND_BATCH_SIZE ?? 100);
    return Number.isFinite(n) && n > 0 ? Math.min(100, Math.floor(n)) : 100;
}

/** Domains Resend rejects in API calls (bounces hurt sender reputation). */
const RESEND_BLOCKED_RECIPIENT_DOMAINS = ['example.com', 'example.org', 'example.net', 'test.com'];

export function isResendBlockedRecipientEmail(email: string): boolean {
    const domain = email.trim().toLowerCase().split('@')[1];
    if (!domain) return true;
    return RESEND_BLOCKED_RECIPIENT_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}
