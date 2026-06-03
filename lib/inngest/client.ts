import { Inngest } from 'inngest';

export const inngest = new Inngest({
    id: 'ready2go',
    name: 'Ready2Go',
    // Dev mode: local Next.js dev server, or INNGEST_DEV=1. Do not set INNGEST_DEV on Vercel production.
    isDev:
        process.env.INNGEST_DEV === '1' ||
        (process.env.NODE_ENV === 'development' && process.env.INNGEST_DEV !== '0'),
});

export const REPORT_EMAIL_JOB_CREATED = 'report-email/job.created' as const;

export type ReportEmailJobCreatedEvent = {
    name: typeof REPORT_EMAIL_JOB_CREATED;
    data: {
        jobId: string;
    };
};
