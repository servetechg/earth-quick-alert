function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function buildReportEmailContent(params: {
    senderName: string;
    reportTitle: string;
    summaryLine?: string;
    pdfUrl: string;
    filename: string;
}) {
    const { senderName, reportTitle, summaryLine, pdfUrl, filename } = params;
    const safeTitle = escapeHtml(reportTitle);
    const safeSender = escapeHtml(senderName);
    const safeSummary = summaryLine ? escapeHtml(summaryLine) : '';
    const safeFilename = escapeHtml(filename);
    const subject = `Ready2Go — ${reportTitle}`;

    const text = [
        'Dear team member,',
        '',
        `${senderName} has shared a Ready2Go AI Risk Assessment report with you.`,
        '',
        reportTitle,
        summaryLine ? summaryLine : '',
        '',
        `Download the report (PDF): ${pdfUrl}`,
        '',
        'This message contains confidential operational information — please handle accordingly.',
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
    <p style="margin:0 0 16px;line-height:1.6;"><strong>${safeSender}</strong> has shared the following operational intelligence report with you.</p>
    <p style="margin:0 0 8px;font-weight:700;color:#233866;">${safeTitle}</p>
    ${safeSummary ? `<p style="margin:0 0 16px;line-height:1.6;color:#475569;">${safeSummary}</p>` : ''}
    <p style="margin:0 0 20px;line-height:1.6;">Use the secure link below to download the full PDF report.</p>
    <a href="${pdfUrl}" style="display:inline-block;background:#233866;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;">
      Download ${safeFilename}
    </a>
    <p style="margin:20px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Confidential — for authorized operational use only.</p>
  </div>
</div>`.trim();

    return { subject, text, html };
}
