import { sendMobileSmtpMail } from '@/lib/email/mobile-smtp';

export async function sendDisasterSurveyInviteEmail(
    email: string,
    firstName: string,
    campaignTitle: string,
): Promise<boolean> {
    const name = firstName.trim() || 'there';
    const subject = `Ready2Go disaster relief survey — action required`;
    const text = [
        `Hi ${name},`,
        '',
        `Our systems indicate you may be in an area affected by: ${campaignTitle}.`,
        '',
        'Open the Ready2Go app to complete your Disaster Status Survey. This helps coordinate',
        'emergency lodging, supplies, and relief funding for the first 72 hours after a disruption.',
        '',
        'The survey is only available to invited users in affected areas.',
        '',
        'If you already submitted your survey, you can ignore this email.',
    ].join('\n');

    return sendMobileSmtpMail(email, subject, text);
}
