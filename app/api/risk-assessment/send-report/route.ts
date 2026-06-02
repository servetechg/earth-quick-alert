import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { createReportEmailJob } from '@/lib/services/report-email/job-service';
import { processReportEmailJobById } from '@/lib/services/report-email/processor';

export async function POST(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        const senderEmail = session?.user?.email as string | undefined;
        const senderUserId = session?.user?.id as string | undefined;

        if (!senderEmail || !senderUserId || !role) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (role !== 'super-admin' && role !== 'sub-admin') {
            return NextResponse.json(
                { error: 'Only super-admins and sub-admins can email risk reports.' },
                { status: 403 },
            );
        }

        let body: {
            pdfBase64?: string;
            filename?: string;
            reportTitle?: string;
            summaryLine?: string;
            audience?: string;
        } = {};
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const result = await createReportEmailJob({
            pdfBase64: typeof body.pdfBase64 === 'string' ? body.pdfBase64 : '',
            filename: typeof body.filename === 'string' ? body.filename : 'Ready2Go-Risk-Report.pdf',
            reportTitle:
                typeof body.reportTitle === 'string' && body.reportTitle.trim()
                    ? body.reportTitle
                    : 'Situational Risk Assessment Report',
            summaryLine: typeof body.summaryLine === 'string' ? body.summaryLine : undefined,
            audience: typeof body.audience === 'string' ? body.audience : undefined,
            senderUserId,
            senderEmail,
            senderName: (session.user.name as string | undefined)?.trim() || senderEmail,
            senderRole: role,
        });

        if (process.env.REPORT_EMAIL_INLINE === 'true') {
            void processReportEmailJobById(result.jobId).catch((error) => {
                console.error('[risk-assessment/send-report] inline worker failed:', error);
            });
        }

        return NextResponse.json(
            {
                ok: true,
                jobId: result.jobId,
                status: result.status,
                recipientCount: result.recipientCount,
                message: 'Report email job queued. Delivery runs in the background worker.',
            },
            { status: 202 },
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to queue report email';
        const status = msg.includes('No approved') ? 404 : msg.includes('pdfBase64') || msg.includes('PDF') ? 400 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
