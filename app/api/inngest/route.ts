import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { sendReportEmailJobFunction } from '@/lib/inngest/functions/send-report-email';

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [sendReportEmailJobFunction],
});
