import { sendMobileSmtpMail } from '@/lib/email/mobile-smtp';
import { profileIncompleteReminderDelayLabel } from '@/lib/config/profile-incomplete-reminder';

export async function sendProfileIncompleteReminderEmail(
    email: string,
    firstName: string,
): Promise<boolean> {
    const name = firstName.trim() || 'there';
    const subject = 'Complete your Ready2Go emergency profile';
    const text = [
        `Hi ${name},`,
        '',
        `You created a Ready2Go account but have not finished your emergency profile yet.`,
        `Completing onboarding helps responders assist you and your household during disruptions.`,
        '',
        'Open the Ready2Go app and finish the registration steps (address, household, and preferences).',
        '',
        `This reminder is sent about ${profileIncompleteReminderDelayLabel()} after signup when onboarding is still incomplete.`,
        '',
        'If you already completed your profile, you can ignore this email.',
    ].join('\n');

    return sendMobileSmtpMail(email, subject, text);
}
