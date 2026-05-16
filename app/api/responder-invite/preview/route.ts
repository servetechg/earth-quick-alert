import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ResponderInvite from '@/models/ResponderInvite';

export async function GET(req: NextRequest) {
    try {
        const token = new URL(req.url).searchParams.get('token')?.trim();
        if (!token) {
            return NextResponse.json({ error: 'token is required' }, { status: 400 });
        }

        await connectDB();
        const invite = await ResponderInvite.findOne({ token }).lean();
        if (!invite || invite.usedAt) {
            return NextResponse.json({ error: 'Invalid or used invite' }, { status: 404 });
        }
        if (invite.expiresAt.getTime() < Date.now()) {
            return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
        }

        return NextResponse.json({
            email: invite.email,
            responderFunction: invite.responderFunction,
            responderVertical: invite.responderVertical,
            expiresAt: invite.expiresAt.toISOString(),
        });
    } catch (e) {
        console.error('responder-invite preview', e);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
