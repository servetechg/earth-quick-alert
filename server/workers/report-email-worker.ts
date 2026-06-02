import 'dotenv/config';
import dbConnect from '@/lib/mongodb';
import { drainReportEmailQueue } from '@/lib/services/report-email/processor';

const POLL_MS = Number(process.env.REPORT_EMAIL_POLL_MS ?? 5000);
const MAX_JOBS_PER_TICK = Number(process.env.REPORT_EMAIL_MAX_JOBS_PER_TICK ?? 5);

async function tick() {
    try {
        const processed = await drainReportEmailQueue(MAX_JOBS_PER_TICK);
        if (processed > 0) {
            console.info(`[report-email-worker] processed ${processed} job(s)`);
        }
    } catch (error) {
        console.error('[report-email-worker] tick failed:', error);
    }
}

async function main() {
    await dbConnect();
    console.info(
        `[report-email-worker] started (poll=${POLL_MS}ms, maxJobsPerTick=${MAX_JOBS_PER_TICK})`,
    );
    await tick();
    setInterval(tick, POLL_MS);
}

main().catch((error) => {
    console.error('[report-email-worker] fatal:', error);
    process.exit(1);
});
