import { sendMobileSmtpMail } from '@/lib/email/mobile-smtp';
import type { DisasterSurveyMissingField } from '@/lib/types/disaster-survey';

const FIELD_LABELS: Record<DisasterSurveyMissingField, string> = {
    comments: 'comments about the incident',
    incident_pictures: 'incident picture(s)',
    incident_videos: 'incident video(s)',
};

export async function sendDisasterSurveyMissingInfoEmail(
    email: string,
    firstName: string,
    campaignTitle: string,
    missingFields: DisasterSurveyMissingField[],
): Promise<boolean> {
    const name = firstName.trim() || 'there';
    const labels = missingFields.map((f) => FIELD_LABELS[f]);
    const list =
        labels.length === 1
            ? labels[0]
            : labels.length === 2
              ? `${labels[0]} and ${labels[1]}`
              : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;

    const subject = `Ready2Go — additional disaster survey details needed`;
    const text = [
        `Hi ${name},`,
        '',
        `Thank you for submitting your disaster relief survey for: ${campaignTitle}.`,
        '',
        `Our team still needs the following optional details to complete your review: ${list}.`,
        '',
        'Please open the Ready2Go app and tap the Disaster Survey item (or your notification)',
        'to add the missing comments, pictures, and/or videos.',
        '',
        'These details help responders verify damage and prioritize relief funding.',
        '',
    ].join('\n');

    return sendMobileSmtpMail(email, subject, text);
}
