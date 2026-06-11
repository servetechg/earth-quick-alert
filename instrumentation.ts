export async function register() {
    if (process.env.NODE_ENV !== 'development') return;
    if (process.env.DISABLE_DEV_REMINDER_CRON === 'true') return;

    const { startDevProfileIncompleteReminderCron } = await import(
        '@/lib/services/mobile/profile-incomplete-reminder-dev-cron'
    );
    startDevProfileIncompleteReminderCron();
}
