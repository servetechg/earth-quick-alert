import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { getReportEmailJobForUser } from '@/lib/services/report-email/job-service';

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ jobId: string }> },
) {
    try {
        await dbConnect();
        const session = await getSession();
        const userId = session?.user?.id as string | undefined;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = await params;
        const job = await getReportEmailJobForUser(jobId, userId);
        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json(job);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load job status';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
