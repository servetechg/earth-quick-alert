import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { sendOperationalEmail } from '@/lib/email/responder-invite-send';

const MAX_PDF_BYTES = 12 * 1024 * 1024;

type ReportEmailAudience = 'sub-admin' | 'responder' | 'both';

function resolveRecipientRoles(role: string, audience?: string): ReportEmailAudience | 'responder-only' {
    if (role === 'sub-admin') return 'responder-only';
    if (audience === 'sub-admin' || audience === 'responder' || audience === 'both') return audience;
    return 'both';
}

function rolesForAudience(audience: ReportEmailAudience | 'responder-only'): string[] {
    if (audience === 'responder-only' || audience === 'responder') return ['responder'];
    if (audience === 'sub-admin') return ['sub-admin'];
    return ['sub-admin', 'responder'];
}

function noRecipientsMessage(audience: ReportEmailAudience | 'responder-only'): string {
    if (audience === 'responder-only' || audience === 'responder') {
        return 'No approved responders with email addresses were found.';
    }
    if (audience === 'sub-admin') {
        return 'No approved sub-admins with email addresses were found.';
    }
    return 'No approved sub-admins or responders with email addresses were found.';
}

function buildReportEmail(params: {
    senderName: string;
    reportTitle: string;
    summaryLine?: string;
}) {
    const { senderName, reportTitle, summaryLine } = params;
    const subject = `Ready2Go — ${reportTitle}`;
    const text = [
        'Dear team member,',
        '',
        `${senderName} has shared a Ready2Go AI Risk Assessment report with you.`,
        '',
        reportTitle,
        summaryLine ? summaryLine : '',
        '',
        'The full report is attached as a PDF. This message contains confidential operational information — please handle accordingly.',
        '',
        '— Ready2Go Emergency Operations',
    ].filter(Boolean).join('\n');

    const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
  <div style="background:#233866;color:#fff;padding:28px 32px;border-radius:12px 12px 0 0;">
    <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">Ready2Go</p>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">AI Risk Assessment Report</h1>
  </div>
  <div style="padding:28px 32px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 16px;line-height:1.6;">Dear team member,</p>
    <p style="margin:0 0 16px;line-height:1.6;"><strong>${senderName}</strong> has shared the following operational intelligence report with you.</p>
    <p style="margin:0 0 8px;font-weight:700;color:#233866;">${reportTitle}</p>
    ${summaryLine ? `<p style="margin:0 0 16px;line-height:1.6;color:#475569;">${summaryLine}</p>` : ''}
    <p style="margin:0 0 16px;line-height:1.6;">The complete report is attached as a PDF. Please review and coordinate with your team as needed.</p>
    <p style="margin:24px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Confidential — for authorized operational use only.</p>
  </div>
</div>`.trim();

    return { subject, text, html };
}

export async function POST(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        const senderEmail = session?.user?.email as string | undefined;
        if (!senderEmail || !role) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (role !== 'super-admin' && role !== 'sub-admin') {
            return NextResponse.json({ error: 'Only super-admins and sub-admins can email risk reports.' }, { status: 403 });
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

        const pdfBase64 = typeof body.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
        const filename = typeof body.filename === 'string' && body.filename.trim()
            ? body.filename.trim().replace(/[^\w.\- ]+/g, '_')
            : 'Ready2Go-Risk-Report.pdf';
        const reportTitle = typeof body.reportTitle === 'string' && body.reportTitle.trim()
            ? body.reportTitle.trim().slice(0, 200)
            : 'Situational Risk Assessment Report';
        const summaryLine = typeof body.summaryLine === 'string' ? body.summaryLine.trim().slice(0, 500) : undefined;

        if (!pdfBase64) {
            return NextResponse.json({ error: 'pdfBase64 is required' }, { status: 400 });
        }

        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        if (!pdfBuffer.length || pdfBuffer.length > MAX_PDF_BYTES) {
            return NextResponse.json({ error: 'Invalid or oversized PDF attachment' }, { status: 400 });
        }

        const audience = resolveRecipientRoles(role, body.audience);
        const recipientRoles = rolesForAudience(audience);
        const users = await User.find({
            role: { $in: recipientRoles },
            accountStatus: 'approved',
            email: { $exists: true, $ne: '' },
        }).select('email name').lean();

        const seen = new Set<string>();
        const recipients: string[] = [];
        for (const u of users) {
            const email = String(u.email ?? '').trim().toLowerCase();
            if (!email.includes('@') || seen.has(email) || email === senderEmail.toLowerCase()) continue;
            seen.add(email);
            recipients.push(email);
        }

        if (recipients.length === 0) {
            return NextResponse.json({
                error: noRecipientsMessage(audience),
            }, { status: 404 });
        }

        const senderName = (session.user.name as string | undefined)?.trim() || senderEmail;
        const { subject, text, html } = buildReportEmail({ senderName, reportTitle, summaryLine });

        let sentCount = 0;
        const failures: string[] = [];
        for (const to of recipients) {
            const result = await sendOperationalEmail({
                to,
                subject,
                text,
                html,
                attachments: [{
                    filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                }],
            });
            if (result.sent) sentCount += 1;
            else if (result.error) failures.push(`${to}: ${result.error}`);
        }

        if (sentCount === 0) {
            return NextResponse.json({
                error: failures[0] ?? 'Failed to send report emails.',
                recipientCount: recipients.length,
            }, { status: 502 });
        }

        return NextResponse.json({
            ok: true,
            sentCount,
            recipientCount: recipients.length,
            partial: failures.length > 0,
            failures: failures.length ? failures.slice(0, 5) : undefined,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to send report';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
