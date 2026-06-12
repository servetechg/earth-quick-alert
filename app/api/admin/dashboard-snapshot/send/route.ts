import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { sendOperationalEmail } from '@/lib/email/responder-invite-send'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function parseExtraEmails(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const parts = raw.split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const email of parts) {
    if (!email.includes('@') || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

function buildSnapshotEmail(params: {
  senderName: string
  snapshotTitle: string
  summaryLine?: string
}) {
  const { senderName, snapshotTitle, summaryLine } = params
  const subject = `Ready2Go — ${snapshotTitle}`
  const text = [
    'Dear team member,',
    '',
    `${senderName} has shared a Ready2Go dashboard situational snapshot with you.`,
    '',
    snapshotTitle,
    summaryLine ? summaryLine : '',
    '',
    'The dashboard snapshot is attached as a PNG image. This message contains confidential operational information — please handle accordingly.',
    '',
    '— Ready2Go Emergency Operations',
  ]
    .filter(Boolean)
    .join('\n')

  const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
  <div style="background:#233866;color:#fff;padding:28px 32px;border-radius:12px 12px 0 0;">
    <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">Ready2Go</p>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">Dashboard Snapshot</h1>
  </div>
  <div style="padding:28px 32px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 16px;line-height:1.6;">Dear team member,</p>
    <p style="margin:0 0 16px;line-height:1.6;"><strong>${senderName}</strong> has shared the following operational dashboard snapshot with you.</p>
    <p style="margin:0 0 8px;font-weight:700;color:#233866;">${snapshotTitle}</p>
    ${summaryLine ? `<p style="margin:0 0 16px;line-height:1.6;color:#475569;">${summaryLine}</p>` : ''}
    <p style="margin:0 0 16px;line-height:1.6;">The complete dashboard view is attached as a PNG image. Please review and coordinate with your team as needed.</p>
    <p style="margin:24px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Confidential — for authorized operational use only.</p>
  </div>
</div>`.trim()

  return { subject, text, html }
}

export async function POST(req: Request) {
  try {
    await dbConnect()
    const session = await getSession()
    const role = session?.user?.role as string | undefined
    const senderEmail = session?.user?.email as string | undefined
    if (!senderEmail || !role) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (role !== 'super-admin' && role !== 'sub-admin') {
      return NextResponse.json(
        { error: 'Only super-admins and sub-admins can email dashboard snapshots.' },
        { status: 403 },
      )
    }

    let body: {
      imageBase64?: string
      filename?: string
      snapshotTitle?: string
      summaryLine?: string
      extraEmails?: string
    } = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : ''
    const filename =
      typeof body.filename === 'string' && body.filename.trim()
        ? body.filename.trim().replace(/[^\w.\- ]+/g, '_')
        : 'Ready2Go-Dashboard-Snapshot.png'
    const snapshotTitle =
      typeof body.snapshotTitle === 'string' && body.snapshotTitle.trim()
        ? body.snapshotTitle.trim().slice(0, 200)
        : 'Situational Dashboard Snapshot'
    const summaryLine =
      typeof body.summaryLine === 'string' ? body.summaryLine.trim().slice(0, 500) : undefined

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64')
    if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Invalid or oversized image attachment' }, { status: 400 })
    }

    const users = await User.find({
      role: 'responder',
      accountStatus: 'approved',
      email: { $exists: true, $ne: '' },
    })
      .select('email name')
      .lean()

    const seen = new Set<string>()
    const recipients: string[] = []
    const senderLower = senderEmail.toLowerCase()

    for (const u of users) {
      const email = String(u.email ?? '')
        .trim()
        .toLowerCase()
      if (!email.includes('@') || seen.has(email) || email === senderLower) continue
      seen.add(email)
      recipients.push(email)
    }

    for (const email of parseExtraEmails(body.extraEmails)) {
      if (seen.has(email) || email === senderLower) continue
      seen.add(email)
      recipients.push(email)
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No approved responders or valid extra email addresses were found.' },
        { status: 404 },
      )
    }

    const senderName = (session.user.name as string | undefined)?.trim() || senderEmail
    const { subject, text, html } = buildSnapshotEmail({ senderName, snapshotTitle, summaryLine })

    let sentCount = 0
    const failures: string[] = []
    for (const to of recipients) {
      const result = await sendOperationalEmail({
        to,
        subject,
        text,
        html,
        attachments: [
          {
            filename: filename.endsWith('.png') ? filename : `${filename}.png`,
            content: imageBuffer,
            contentType: 'image/png',
          },
        ],
      })
      if (result.sent) sentCount += 1
      else if (result.error) failures.push(`${to}: ${result.error}`)
    }

    if (sentCount === 0) {
      return NextResponse.json(
        {
          error: failures[0] ?? 'Failed to send dashboard snapshot emails.',
          recipientCount: recipients.length,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      sentCount,
      recipientCount: recipients.length,
      partial: failures.length > 0,
      failures: failures.length ? failures.slice(0, 5) : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to send dashboard snapshot'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
