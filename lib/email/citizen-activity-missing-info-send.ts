import { sendMobileSmtpMail } from '@/lib/email/mobile-smtp';
import type { CitizenActivityMissingField } from '@/lib/citizen-activity/types';

const FIELD_LABELS: Record<CitizenActivityMissingField, string> = {
    details: 'additional details',
    pictures: 'picture(s)',
    videos: 'video(s)',
};

export async function sendCitizenActivityMissingInfoEmail(
    email: string,
    firstName: string,
    reportTitle: string,
    missingFields: CitizenActivityMissingField[],
): Promise<boolean> {
    const name = firstName.trim() || 'there';
    const labels = missingFields.map((f) => FIELD_LABELS[f]);
    const list =
        labels.length === 1
            ? labels[0]
            : labels.length === 2
              ? `${labels[0]} and ${labels[1]}`
              : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;

    const subject = 'Ready2Go — additional report details needed';
    const text = [
        `Hi ${name},`,
        '',
        `Thank you for your ${reportTitle} report on Ready2Go.`,
        '',
        `Our emergency coordinators still need the following optional details: ${list}.`,
        '',
        'Please open the Ready2Go app and tap Citizen Assistant (or your notification)',
        'to add the missing details, pictures, and/or videos.',
        '',
        'These details help responders verify your request and dispatch assistance faster.',
        '',
    ].join('\n');

    return sendMobileSmtpMail(email, subject, text);
}
