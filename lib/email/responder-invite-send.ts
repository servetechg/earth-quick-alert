import { getAppOrigin, buildResponderSignupUrl } from '@/lib/email/app-origin';
import { sendViaSmtp, smtpConfigured, SMTP_CONFIG_HINT } from '@/lib/email/smtp-client';

export { getAppOrigin, buildResponderSignupUrl };

function buildInviteSubjectAndText(roleLabel: string, signupUrl: string) {
    const subject = 'You are invited to Ready2Go — complete your responder account';
    const text = [
        'You have been invited to join the Ready2Go emergency portal as an external responder.',
        '',
        `Role / function: ${roleLabel}`,
        '',
        `Complete signup: ${signupUrl}`,
        '',
        'This link expires in 14 days. If you did not expect this message, you can ignore it.',
    ].join('\n');
    return { subject, text };
}

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

    if (!smtpConfigured()) {
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

    return sendViaSmtp({ to, subject, text });
}

/** @deprecated Use sendViaSmtp from @/lib/email/smtp-client */
export async function sendOperationalEmail(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
    return sendViaSmtp(params);
}

export type { OperationalEmailAttachment } from '@/lib/email/smtp-client';
