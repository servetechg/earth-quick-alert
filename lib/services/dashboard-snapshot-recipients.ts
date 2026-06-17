import mongoose from 'mongoose';
import User from '@/models/User';

export type SnapshotResponderRecipient = {
    id: string;
    name: string;
    email: string;
    unitType: string;
};

function stateRegex(stateRaw: string): RegExp {
    return new RegExp(stateRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/** Approved responders with email — scoped to a sub-admin license / state. */
export async function fetchSubAdminResponderRecipients(
    subAdminUserId: string,
): Promise<SnapshotResponderRecipient[]> {
    const subAdmin = await User.findById(subAdminUserId).select('state licenseId').lean();
    if (!subAdmin) return [];

    const stateRaw = typeof subAdmin.state === 'string' ? subAdmin.state.trim() : '';
    const licenseId = subAdmin.licenseId;

    const andParts: Record<string, unknown>[] = [
        { role: 'responder' },
        { accountStatus: 'approved' },
        { email: { $exists: true, $ne: '' } },
    ];

    const scopeOr: Record<string, unknown>[] = [
        { createdBy: new mongoose.Types.ObjectId(subAdminUserId) },
    ];
    if (licenseId) scopeOr.push({ licenseId });
    if (stateRaw) scopeOr.push({ state: stateRegex(stateRaw) });
    andParts.push({ $or: scopeOr });

    const users = await User.find({ $and: andParts })
        .select('name email responderVertical responderFunction')
        .sort({ name: 1 })
        .lean();

    const seen = new Set<string>();
    const out: SnapshotResponderRecipient[] = [];

    for (const u of users) {
        const email = String(u.email ?? '')
            .trim()
            .toLowerCase();
        if (!email.includes('@') || seen.has(email)) continue;
        seen.add(email);
        const unitType = String(u.responderVertical || u.responderFunction || 'Responder').replace(
            /_/g,
            ' ',
        );
        out.push({
            id: String(u._id),
            name: String(u.name || email),
            email,
            unitType,
        });
    }

    return out;
}

/** All approved responders with email (super-admin). */
export async function fetchAllApprovedResponderRecipients(): Promise<SnapshotResponderRecipient[]> {
    const users = await User.find({
        role: 'responder',
        accountStatus: 'approved',
        email: { $exists: true, $ne: '' },
    })
        .select('name email responderVertical responderFunction')
        .sort({ name: 1 })
        .lean();

    const seen = new Set<string>();
    const out: SnapshotResponderRecipient[] = [];

    for (const u of users) {
        const email = String(u.email ?? '')
            .trim()
            .toLowerCase();
        if (!email.includes('@') || seen.has(email)) continue;
        seen.add(email);
        out.push({
            id: String(u._id),
            name: String(u.name || email),
            email,
            unitType: String(u.responderVertical || u.responderFunction || 'Responder').replace(
                /_/g,
                ' ',
            ),
        });
    }

    return out;
}

export function parseExtraEmails(raw: unknown): string[] {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    const parts = raw
        .split(/[\n,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const email of parts) {
        if (!email.includes('@') || seen.has(email)) continue;
        seen.add(email);
        out.push(email);
    }
    return out;
}

export async function resolveSnapshotRecipientEmails(params: {
    role: string;
    senderEmail: string;
    senderUserId?: string;
    sendToAllResponders?: boolean;
    responderIds?: string[];
    extraEmails?: unknown;
}): Promise<{ emails: string[]; scopedResponders: SnapshotResponderRecipient[] }> {
    const senderLower = params.senderEmail.toLowerCase();
    const scopedResponders =
        params.role === 'sub-admin' && params.senderUserId
            ? await fetchSubAdminResponderRecipients(params.senderUserId)
            : await fetchAllApprovedResponderRecipients();

    const allowedIds = new Set(scopedResponders.map((r) => r.id));
    const emailById = new Map(scopedResponders.map((r) => [r.id, r.email]));

    let responderEmails: string[] = [];
    const sendToAll = params.sendToAllResponders !== false;

    if (sendToAll) {
        responderEmails = scopedResponders.map((r) => r.email);
    } else {
        const ids = Array.isArray(params.responderIds)
            ? params.responderIds.map((id) => String(id).trim()).filter(Boolean)
            : [];
        for (const id of ids) {
            if (!allowedIds.has(id)) continue;
            const email = emailById.get(id);
            if (email) responderEmails.push(email);
        }
    }

    const seen = new Set<string>();
    const emails: string[] = [];

    for (const email of responderEmails) {
        if (seen.has(email) || email === senderLower) continue;
        seen.add(email);
        emails.push(email);
    }

    for (const email of parseExtraEmails(params.extraEmails)) {
        if (seen.has(email) || email === senderLower) continue;
        seen.add(email);
        emails.push(email);
    }

    return { emails, scopedResponders };
}
