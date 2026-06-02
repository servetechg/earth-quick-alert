import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export const SMTP_CONFIG_HINT =
    'Set RESPONDER_INVITE_SMTP_URL (or SMTP_HOST, SMTP_USER, SMTP_PASS) and RESPONDER_INVITE_SMTP_FROM (or SMTP_FROM).';

export type OperationalEmailAttachment = {
    filename: string;
    content: Buffer;
    contentType?: string;
};

let cachedTransporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

/** True when `RESPONDER_INVITE_SMTP_URL` or host-based SMTP credentials are set. */
export function smtpConfigured(): boolean {
    if (process.env.RESPONDER_INVITE_SMTP_URL?.trim()) return true;
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    return Boolean(host && user && pass != null && String(pass).length > 0);
}

export function smtpFromAddress(): string | undefined {
    return (
        process.env.RESPONDER_INVITE_SMTP_FROM?.trim() ||
        process.env.SMTP_FROM?.trim() ||
        undefined
    );
}

export function getSmtpTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
    if (cachedTransporter) return cachedTransporter;

    const url = process.env.RESPONDER_INVITE_SMTP_URL?.trim();
    cachedTransporter = url
        ? nodemailer.createTransport(url)
        : nodemailer.createTransport({
              host: process.env.SMTP_HOST!.trim(),
              port: Number(process.env.SMTP_PORT || '587'),
              secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT || '0') === 465,
              auth: {
                  user: process.env.SMTP_USER!.trim(),
                  pass: String(process.env.SMTP_PASS ?? ''),
              },
          });

    return cachedTransporter;
}

/** Shared SMTP delivery for operational messages (invites, reports, etc.). */
export async function sendViaSmtp(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: OperationalEmailAttachment[];
}): Promise<{ sent: boolean; error?: string }> {
    const from = smtpFromAddress();
    if (!from) {
        return {
            sent: false,
            error:
                'No From address configured. Set RESPONDER_INVITE_SMTP_FROM (recommended) or SMTP_FROM.',
        };
    }

    if (!smtpConfigured()) {
        if (process.env.NODE_ENV === 'development') {
            console.info('[smtp] not configured:', { to: params.to, subject: params.subject });
        }
        return { sent: false, error: `SMTP is not configured. ${SMTP_CONFIG_HINT}` };
    }

    try {
        await getSmtpTransporter().sendMail({
            from,
            to: params.to,
            subject: params.subject,
            text: params.text,
            html: params.html,
            attachments: params.attachments,
        });
        return { sent: true };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { sent: false, error: msg };
    }
}
