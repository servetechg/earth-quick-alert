import type { NotificationPreferencesDTO } from './types';

const KEYS: ReadonlyArray<keyof NotificationPreferencesDTO> = [
    'push',
    'sms',
    'email',
    'majorAlerts',
    'minorAlerts',
    'aiReports',
    'pushAlerts',
    'smsAlerts',
    'emailDigest',
];

/** Values used when DB has no prefs or legacy docs with only push/sms/email. */
export const NOTIFICATION_PREFERENCES_DEFAULTS: NotificationPreferencesDTO = {
    push: true,
    sms: true,
    email: true,
    majorAlerts: true,
    minorAlerts: true,
    aiReports: true,
    pushAlerts: true,
    smsAlerts: true,
    emailDigest: false,
};

function isDefinedBoolean(v: unknown): v is boolean {
    return typeof v === 'boolean';
}

/** Merge stored subdocument with sane defaults for missing keys. */
export function normalizeNotificationPreferences(raw: Record<string, unknown> | null | undefined): NotificationPreferencesDTO {
    const base = { ...NOTIFICATION_PREFERENCES_DEFAULTS };
    if (!raw || typeof raw !== 'object') return base;

    for (const key of KEYS) {
        if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
        const v = (raw as Record<string, unknown>)[key];
        if (isDefinedBoolean(v)) {
            base[key] = v;
        }
    }
    return base;
}

/** Apply a partial PATCH from API body over current normalized prefs. */
export function mergeNotificationPreferencesPatch(
    current: NotificationPreferencesDTO,
    patch: Record<string, unknown>
): NotificationPreferencesDTO {
    const next = { ...current };
    for (const key of KEYS) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        const v = patch[key];
        if (typeof v === 'boolean') next[key] = v;
        // accept string "true"/"false" from loose clients
        if (typeof v === 'string') {
            if (v.toLowerCase() === 'true') next[key] = true;
            else if (v.toLowerCase() === 'false') next[key] = false;
        }
    }
    return next;
}

export function prefsKeys(): ReadonlyArray<keyof NotificationPreferencesDTO> {
    return KEYS;
}
