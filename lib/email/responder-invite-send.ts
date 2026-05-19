import nodemailer from 'nodemailer';

export function getAppOrigin(): string {
    if (process.env.NODE_ENV === 'production') {
        return 'https://earthquickalert.vercel.app';
    }
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (base) return base.replace(/\/$/, '');
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
    return 'http://localhost:3000';
}

export function buildResponderSignupUrl(token: string): string {
    return `${getAppOrigin()}/signup?responderInvite=${encodeURIComponent(token)}`;
}

function buildInviteSubjectAndText(roleLabel: string, signupUrl: string) {
    const subject = 'You are invited to Ready2Go — complete your responder account';
    const text = [
        'You have been invited to join the Ready2Go emergency portal as an external responder.',
        '',
        `Role: ${roleLabel}`,
        '',
        `Complete signup: ${signupUrl}`,
        '',
        'This link expires in 14 days. If you did not expect this message, you can ignore it.',
    ].join('\n');
    return { subject, text };
}

/** True when `RESPONDER_INVITE_SMTP_URL` or host-based SMTP credentials are set. */
function smtpInviteConfigured(): boolean {
    if (process.env.RESPONDER_INVITE_SMTP_URL?.trim()) return true;
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    return Boolean(host && user && pass != null && String(pass).length > 0);
}

function smtpInviteFromAddress(): string | undefined {
    const f = process.env.RESPONDER_INVITE_SMTP_FROM?.trim() || process.env.SMTP_FROM?.trim();
    return f || undefined;
}

async function sendResponderInviteViaSmtp(params: {
    to: string;
    subject: string;
    text: string;
}): Promise<{ sent: boolean; error?: string }> {
    const from = smtpInviteFromAddress();
    if (!from) {
        return {
            sent: false,
            error:
                'No From address for invite email. Set RESPONDER_INVITE_SMTP_FROM (recommended) or SMTP_FROM to an address your SMTP server allows.',
        };
    }

    try {
        const url = process.env.RESPONDER_INVITE_SMTP_URL?.trim();
        const transporter = url
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

        await transporter.sendMail({
            from,
            to: params.to,
            subject: params.subject,
            text: params.text,
        });
        return { sent: true };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { sent: false, error: msg };
    }
}

const SMTP_CONFIG_HINT =
    'Set RESPONDER_INVITE_SMTP_URL (or SMTP_HOST, SMTP_USER, SMTP_PASS) and RESPONDER_INVITE_SMTP_FROM (or SMTP_FROM).';

/** Deliver responder invite email via SMTP (Nodemailer) only. */
export async function sendResponderInviteEmail(params: {
    to: string;
    signupUrl: string;
    roleLabel: string;
}): Promise<{ sent: boolean; error?: string }> {
    const to = params.to.trim().toLowerCase();
    if (!to.includes('@')) {
        return { sent: false, error: 'Invalid invitee email address.' };
    }

    const { subject, text } = buildInviteSubjectAndText(params.roleLabel, params.signupUrl);

    if (!smtpInviteConfigured()) {
        if (process.env.NODE_ENV === 'development') {
            console.info(
                `[responder-invite] SMTP not configured (${SMTP_CONFIG_HINT}). Signup link:`,
                params.signupUrl,
            );
        }
        return {
            sent: false,
            error: `SMTP is not configured for responder invites. ${SMTP_CONFIG_HINT}`,
        };
    }

    return sendResponderInviteViaSmtp({ to, subject, text });
}
