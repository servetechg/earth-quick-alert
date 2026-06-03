import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import EmailSuppression from '@/models/EmailSuppression';

type ResendWebhookEvent = {
    type?: string;
    data?: {
        to?: string | string[];
        email?: string;
        bounce?: { message?: string };
    };
};

function extractEmails(event: ResendWebhookEvent): string[] {
    const raw = event.data?.to ?? event.data?.email;
    if (!raw) return [];
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes('@'));
}

/** Resend webhook — suppress bounced/complained addresses from future report sends. */
export async function POST(req: Request) {
    try {
        await dbConnect();
        const event = (await req.json()) as ResendWebhookEvent;
        const type = String(event.type ?? '').toLowerCase();

        if (!type.includes('bounce') && !type.includes('complaint')) {
            return NextResponse.json({ ok: true, ignored: true });
        }

        const emails = extractEmails(event);
        for (const email of emails) {
            await EmailSuppression.findOneAndUpdate(
                { email },
                {
                    email,
                    reason: type.includes('complaint') ? 'complaint' : 'bounce',
                    source: 'resend',
                },
                { upsert: true },
            );
        }

        console.info('[webhooks/resend] suppressed emails', { type, emails });
        return NextResponse.json({ ok: true, suppressed: emails.length });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Webhook processing failed';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
