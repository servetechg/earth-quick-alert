import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { EmailSendResult, OperationalEmailMessage } from '@/lib/email/types';
import { emailFromAddress, smtpConfigured, SMTP_CONFIG_HINT } from '@/lib/email/config';

let cachedTransporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

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

export async function sendViaSmtp(message: OperationalEmailMessage): Promise<EmailSendResult> {
    const from = emailFromAddress();
    if (!from) {
        return {
            sent: false,
            error: 'No From address configured. Set EMAIL_FROM, RESEND_FROM, or SMTP_FROM.',
        };
    }

    if (!smtpConfigured()) {
        return { sent: false, error: `SMTP is not configured. ${SMTP_CONFIG_HINT}` };
    }

    try {
        const info = await getSmtpTransporter().sendMail({
            from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
            attachments: message.attachments,
        });
        return { sent: true, messageId: info.messageId };
    } catch (e) {
        return { sent: false, error: e instanceof Error ? e.message : String(e) };
    }
}
