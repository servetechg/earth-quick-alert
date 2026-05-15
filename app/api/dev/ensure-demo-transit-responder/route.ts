import { NextResponse } from 'next/server';
import {
    DEV_DEMO_TRANSIT_RESPONDER_EMAIL,
    DEV_DEMO_TRANSIT_RESPONDER_PASSWORD,
    upsertDevDemoTransitResponder,
} from '@/lib/dev-demo-responder';

/**
 * Local dev only: creates/resets the transit responder demo user.
 * GET http://localhost:3000/api/dev/ensure-demo-transit-responder
 */
export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        await upsertDevDemoTransitResponder();
        return NextResponse.json({
            ok: true,
            message: 'Demo transit responder is ready. Use these credentials on /login',
            email: DEV_DEMO_TRANSIT_RESPONDER_EMAIL,
            password: DEV_DEMO_TRANSIT_RESPONDER_PASSWORD,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to create user';
        console.error('ensure-demo-transit-responder:', e);
        return NextResponse.json(
            {
                ok: false,
                error: message,
                hint: 'Check MONGODB_URI in .env and restart `npm run dev`',
            },
            { status: 500 },
        );
    }
}
