import { getAppOrigin, buildResponderSignupUrl } from '@/lib/email/app-origin';
import { emailDeliveryConfigured, SMTP_CONFIG_HINT } from '@/lib/email/config';
import { sendOperationalEmail } from '@/lib/email/operational-mail';

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

/** Deliver responder invite email via Resend or SMTP. */
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

    if (!emailDeliveryConfigured()) {
        if (process.env.NODE_ENV === 'development') {
            console.info(
                `[responder-invite] Email not configured (${SMTP_CONFIG_HINT}). Signup link:`,
                params.signupUrl,
            );
        }
        return {
            sent: false,
            error: `Email is not configured for responder invites. ${SMTP_CONFIG_HINT}`,
        };
    }

    return sendOperationalEmail({ to, subject, text });
}

/** @deprecated Use sendOperationalEmail from @/lib/email/operational-mail */
export { sendOperationalEmail } from '@/lib/email/operational-mail';
export type { OperationalEmailAttachment } from '@/lib/email/types';
