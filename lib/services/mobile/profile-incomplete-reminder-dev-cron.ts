const DEFAULT_INTERVAL_MS = 30_000;

let started = false;

export function startDevProfileIncompleteReminderCron(): void {
    if (started) return;
    started = true;

    const intervalMs = Number(process.env.DEV_REMINDER_CRON_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
    const port = process.env.PORT?.trim() || '3000';
    const secret = process.env.CRON_SECRET?.trim() || '';
    const url = `http://127.0.0.1:${port}/api/v1/cron/profile-incomplete-reminders`;

    const run = async () => {
        try {
            const headers: Record<string, string> = {};
            if (secret) headers.Authorization = `Bearer ${secret}`;

            const res = await fetch(url, { headers });
            if (!res.ok) {
                console.error('[dev-cron] profile-incomplete-reminders HTTP', res.status);
                return;
            }

            const body = (await res.json()) as {
                scanned?: number;
                emailed?: number;
                pushed?: number;
                skipped?: number;
                errors?: number;
            };

            if (
                (body.scanned ?? 0) > 0 ||
                (body.emailed ?? 0) > 0 ||
                (body.pushed ?? 0) > 0 ||
                (body.errors ?? 0) > 0
            ) {
                console.info('[dev-cron] profile-incomplete-reminders', body);
            }
        } catch (e) {
            console.error('[dev-cron] profile-incomplete-reminders failed:', e);
        }
    };

    setTimeout(() => {
        void run();
    }, 5_000);

    setInterval(() => {
        void run();
    }, intervalMs);

    console.info(
        `[dev-cron] profile-incomplete-reminders scheduler started (every ${intervalMs / 1000}s)`,
    );
}
