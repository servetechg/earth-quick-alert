import type { OtpPurpose } from '@/lib/types/mobile/auth';
import { otpExpiryMinutes } from '@/lib/services/mobile/otp-service';
import { emailDeliveryConfigured } from '@/lib/email/config';
import { sendOperationalEmail } from '@/lib/email/operational-mail';

export async function sendOtpEmail(email: string, code: string, purpose: OtpPurpose): Promise<void> {
    const label =
        purpose === 'EMAIL_VERIFICATION'
            ? 'verify your Ready2Go email'
            : 'reset your Ready2Go password';
    const subject = 'Your Ready2Go verification code';
    const text = [
        `Your verification code to ${label} is: ${code}`,
        '',
        `This code expires in ${otpExpiryMinutes()} minutes.`,
        'If you did not request this, you can ignore this email.',
    ].join('\n');

    if (!emailDeliveryConfigured()) {
        if (process.env.NODE_ENV !== 'production') {
            console.info('[mobile-auth] OTP email (not configured):', { to: email, subject, text });
        }
        return;
    }

    await sendOperationalEmail({ to: email, subject, text });
}
