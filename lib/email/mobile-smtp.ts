import nodemailer from 'nodemailer';

export function smtpConfigured(): boolean {
    if (process.env.RESPONDER_INVITE_SMTP_URL?.trim()) return true;
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    return Boolean(host && user && pass != null && String(pass).length > 0);
}

export function smtpFrom(): string | undefined {
    return (
        process.env.RESPONDER_INVITE_SMTP_FROM?.trim() ||
        process.env.SMTP_FROM?.trim() ||
        undefined
    );
}

export async function sendMobileSmtpMail(
    to: string,
    subject: string,
    text: string,
): Promise<boolean> {
    const from = smtpFrom();
    if (!from || !smtpConfigured()) {
        if (process.env.NODE_ENV !== 'production') {
            console.info('[mobile-email] SMTP not configured:', { to, subject, text });
        }
        return false;
    }

    const url = process.env.RESPONDER_INVITE_SMTP_URL?.trim();
    const transporter = url
        ? nodemailer.createTransport(url)
        : nodemailer.createTransport({
              host: process.env.SMTP_HOST!.trim(),
              port: Number(process.env.SMTP_PORT || '587'),
              secure:
                  process.env.SMTP_SECURE === 'true' ||
                  Number(process.env.SMTP_PORT || '0') === 465,
              auth: {
                  user: process.env.SMTP_USER!.trim(),
                  pass: String(process.env.SMTP_PASS ?? ''),
              },
          });

    await transporter.sendMail({ from, to, subject, text });
    return true;
}
