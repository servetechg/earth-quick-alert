/** Delay before reminding users who signed up but never finished onboarding. */

const DEFAULT_MINUTES = 30;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw?.trim()) return fallback;
    const n = Number(raw.trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Reminder delay in milliseconds.
 * `PROFILE_INCOMPLETE_REMINDER_SECONDS` overrides minutes when set (useful for local testing).
 */
export function profileIncompleteReminderDelayMs(): number {
    const secondsOverride = process.env.PROFILE_INCOMPLETE_REMINDER_SECONDS?.trim();
    if (secondsOverride) {
        const seconds = parsePositiveInt(secondsOverride, DEFAULT_MINUTES * 60);
        return seconds * 1000;
    }
    const minutes = parsePositiveInt(
        process.env.PROFILE_INCOMPLETE_REMINDER_MINUTES,
        DEFAULT_MINUTES,
    );
    return minutes * 60 * 1000;
}

export function profileIncompleteReminderDelayLabel(): string {
    const secondsOverride = process.env.PROFILE_INCOMPLETE_REMINDER_SECONDS?.trim();
    if (secondsOverride) {
        const seconds = parsePositiveInt(secondsOverride, DEFAULT_MINUTES * 60);
        return seconds < 60 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minutes`;
    }
    const minutes = parsePositiveInt(
        process.env.PROFILE_INCOMPLETE_REMINDER_MINUTES,
        DEFAULT_MINUTES,
    );
    return `${minutes} minutes`;
}
