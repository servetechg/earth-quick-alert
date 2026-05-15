import { NextResponse } from 'next/server';
import {
    DEV_DEMO_RESPONDER_EMAIL,
    DEV_DEMO_RESPONDER_PASSWORD,
    upsertDevDemoResponder,
} from '@/lib/dev-demo-responder';

/**
 * Local dev only: same as logging in with demo credentials (see login route).
 * GET http://localhost:3000/api/dev/ensure-demo-responder
 */
export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        await upsertDevDemoResponder();
        return NextResponse.json({
            ok: true,
            message: 'Demo responder is ready. Use these credentials on /login',
            email: DEV_DEMO_RESPONDER_EMAIL,
            password: DEV_DEMO_RESPONDER_PASSWORD,
        });
    } catch (e: any) {
        console.error('ensure-demo-responder:', e);
        return NextResponse.json(
            {
                ok: false,
                error: e?.message || 'Failed to create user',
                hint: 'Check MONGODB_URI in .env and restart `npm run dev`',
            },
            { status: 500 },
        );
    }
}
