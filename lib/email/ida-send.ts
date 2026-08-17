import { sendMobileSmtpMail } from '@/lib/email/mobile-smtp';

export async function sendIdaInviteEmail(
    email: string,
    firstName: string,
    campaignTitle: string,
): Promise<boolean> {
    const name = firstName.trim() || 'there';
    const subject = `Initial Disaster Assistance Application — action required`;
    const text = [
        `Hi ${name},`,
        '',
        `If your property or possessions have been damaged, complete the Ready2Go® Initial Disaster Assistance Application to get the reimbursement process started.`,
        '',
        `Campaign: ${campaignTitle}`,
        '',
        'Responses will be provided to all eligible programs. This is only the initiation of the process — please allow a minimum of 3 days post disaster for Federal, State, insurance, and other entities to respond.',
        '',
        'Open the Ready2Go app to complete your application. A copy of your responses with a claim number will be emailed to your registered address after you submit.',
        '',
        'If you already submitted this application, you can ignore this email.',
    ].join('\n');

    return sendMobileSmtpMail(email, subject, text);
}

export async function sendIdaClaimReceiptEmail(
    email: string,
    firstName: string,
    claimNumber: string,
    summaryLines: string[],
): Promise<boolean> {
    const name = firstName.trim() || 'there';
    const subject = `Ready2Go claim ${claimNumber} — Initial Disaster Assistance Application received`;
    const text = [
        `Hi ${name},`,
        '',
        `We received your Initial Disaster Assistance Application.`,
        `Claim number: ${claimNumber}`,
        '',
        'Summary of your responses:',
        ...summaryLines.map((line) => `• ${line}`),
        '',
        'Please allow a minimum of 3 days post disaster for eligible programs to follow up.',
        'Keep this claim number for your records.',
        '',
        '— Ready2Go',
    ].join('\n');

    return sendMobileSmtpMail(email, subject, text);
}

export async function sendIdaMissingInfoEmail(
    email: string,
    firstName: string,
    campaignTitle: string,
    missingLabels: string[],
): Promise<boolean> {
    const name = firstName.trim() || 'there';
    const subject = `Ready2Go — additional information needed for your disaster assistance application`;
    const text = [
        `Hi ${name},`,
        '',
        `Coordinators need a few more details for: ${campaignTitle}.`,
        '',
        'Please open the Ready2Go app and provide:',
        ...missingLabels.map((l) => `• ${l}`),
        '',
        'Thank you for helping us process your application.',
    ].join('\n');

    return sendMobileSmtpMail(email, subject, text);
}
