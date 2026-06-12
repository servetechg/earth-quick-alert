import type { OtpPurpose } from '@/lib/types/mobile/auth';
import { otpExpiryMinutes } from '@/lib/services/mobile/otp-service';
import { sendMobileSmtpMail } from '@/lib/email/mobile-smtp';

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
    await sendMobileSmtpMail(email, subject, text);
}
