import type { ApiUser } from '@/lib/types/mobile/auth';

type UserLike = {
    _id: { toString(): string } | string;
    email: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    emailVerified?: boolean;
    profileComplete?: boolean;
};

export function splitName(name: string): { firstName: string; lastName: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function toApiUser(doc: UserLike): ApiUser {
    const id = typeof doc._id === 'string' ? doc._id : doc._id.toString();
    let firstName = String(doc.firstName ?? '').trim();
    let lastName = String(doc.lastName ?? '').trim();
    if (!firstName && !lastName && doc.name) {
        const split = splitName(doc.name);
        firstName = split.firstName;
        lastName = split.lastName;
    }
    const profileComplete = Boolean(doc.profileComplete);
    return {
        id,
        email: doc.email,
        firstName,
        lastName,
        emailVerified: Boolean(doc.emailVerified),
        profileComplete,
    };
}
