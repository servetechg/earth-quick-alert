import dbConnect from '@/lib/mongodb';
import { inngest, REPORT_EMAIL_JOB_CREATED } from '@/lib/inngest/client';
import {
    finalizeReportEmailJob,
    prepareReportEmailJob,
    processReportEmailJobBatch,
} from '@/lib/services/report-email/processor';

export const sendReportEmailJobFunction = inngest.createFunction(
    {
        id: 'send-report-email-job',
        retries: 3,
        concurrency: { limit: 5 },
        triggers: [{ event: REPORT_EMAIL_JOB_CREATED }],
    },
    async ({ event, step }) => {
        const { jobId } = event.data;

        const plan = await step.run('prepare-job', async () => {
            await dbConnect();
            return prepareReportEmailJob(jobId);
        });

        for (let i = 0; i < plan.batchCount; i += 1) {
            await step.run(`send-batch-${i}`, async () => {
                await dbConnect();
                return processReportEmailJobBatch(jobId, plan.batchSize);
            });
        }

        await step.run('finalize-job', async () => {
            await dbConnect();
            return finalizeReportEmailJob(jobId);
        });

        return { jobId, batchCount: plan.batchCount };
    },
);
