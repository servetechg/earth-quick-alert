import User from '@/models/User';
import EmailSuppression from '@/models/EmailSuppression';
import { isResendBlockedRecipientEmail } from '@/lib/email/config';

export type ReportEmailAudience = 'sub-admin' | 'responder' | 'both';

export type ReportEmailRecipient = {
    email: string;
    name: string;
    role: string;
};

export function resolveRecipientAudience(
    role: string,
    audience?: string,
): ReportEmailAudience | 'responder-only' {
    if (role === 'sub-admin') return 'responder-only';
    if (audience === 'sub-admin' || audience === 'responder' || audience === 'both') return audience;
    return 'both';
}

export function rolesForAudience(audience: ReportEmailAudience | 'responder-only'): string[] {
    if (audience === 'responder-only' || audience === 'responder') return ['responder'];
    if (audience === 'sub-admin') return ['sub-admin'];
    return ['sub-admin', 'responder'];
}

export function noRecipientsMessage(audience: ReportEmailAudience | 'responder-only'): string {
    if (audience === 'responder-only' || audience === 'responder') {
        return 'No approved responders with email addresses were found.';
    }
    if (audience === 'sub-admin') {
        return 'No approved sub-admins with email addresses were found.';
    }
    return 'No approved sub-admins or responders with email addresses were found.';
}

export async function resolveReportEmailRecipients(params: {
    senderEmail: string;
    audience: ReportEmailAudience | 'responder-only';
}): Promise<ReportEmailRecipient[]> {
    const recipientRoles = rolesForAudience(params.audience);
    const users = await User.find({
        role: { $in: recipientRoles },
        accountStatus: 'approved',
        email: { $exists: true, $ne: '' },
    })
        .select('email name role')
        .lean();

    const suppressed = new Set(
        (await EmailSuppression.find({}).select('email').lean()).map((s) =>
            String(s.email).trim().toLowerCase(),
        ),
    );

    const seen = new Set<string>();
    const recipients: ReportEmailRecipient[] = [];
    const sender = params.senderEmail.trim().toLowerCase();

    for (const u of users) {
        const email = String(u.email ?? '').trim().toLowerCase();
        if (
            !email.includes('@') ||
            seen.has(email) ||
            email === sender ||
            suppressed.has(email) ||
            isResendBlockedRecipientEmail(email)
        ) {
            continue;
        }
        seen.add(email);
        recipients.push({
            email,
            name: String(u.name ?? '').trim() || email,
            role: String(u.role ?? ''),
        });
    }

    return recipients;
}
