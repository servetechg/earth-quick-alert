import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ResponderInvite from '@/models/ResponderInvite';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import crypto from 'crypto';
import { getResponderInviteOptionById, RESPONDER_INVITE_OPTIONS } from '@/lib/responder-invite-options';
import { buildResponderSignupUrl, sendResponderInviteEmail } from '@/lib/email/responder-invite-send';
import { isResponderVertical } from '@/lib/responder-verticals';

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function canInvite(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin' || role === 'admin';
}

export async function GET() {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id || !canInvite(session.user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const me = await User.findById(session.user.id).select('licenseId role').lean();
        const licenseId = me?.licenseId?.toString() || null;

        const query: Record<string, unknown> = { usedAt: null, expiresAt: { $gt: new Date() } };
        if (session.user.role === 'sub-admin') {
            if (!licenseId) {
                return NextResponse.json({ invites: [], options: RESPONDER_INVITE_OPTIONS });
            }
            query.licenseId = me!.licenseId;
        }

        const invites = await ResponderInvite.find(query).sort({ createdAt: -1 }).limit(50).lean();

        return NextResponse.json({
            invites: invites.map((i) => ({
                id: i._id.toString(),
                email: i.email,
                responderFunction: i.responderFunction,
                responderVertical: i.responderVertical,
                expiresAt: i.expiresAt,
                createdAt: i.createdAt,
            })),
            options: RESPONDER_INVITE_OPTIONS,
        });
    } catch (e) {
        console.error('responder-invites GET', e);
        return NextResponse.json({ error: 'Failed to list invites' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id || !canInvite(session.user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const email = String(body.email || '')
            .toLowerCase()
            .trim();
        const inviteOptionId = String(body.inviteOptionId || '').trim();
        const optionalLicenseId = body.licenseId ? String(body.licenseId).trim() : '';

        if (!email || !inviteOptionId) {
            return NextResponse.json({ error: 'email and inviteOptionId are required' }, { status: 400 });
        }

        const option = getResponderInviteOptionById(inviteOptionId);
        if (!option || !isResponderVertical(option.responderVertical)) {
            return NextResponse.json({ error: 'Invalid invite option' }, { status: 400 });
        }

        const inviter = await User.findById(session.user.id).select('licenseId role').lean();
        if (!inviter) {
            return NextResponse.json({ error: 'Inviter not found' }, { status: 400 });
        }

        let licenseId: string | null = inviter.licenseId ? inviter.licenseId.toString() : null;
        if (session.user.role === 'super-admin' && optionalLicenseId) {
            licenseId = optionalLicenseId;
        }

        if (session.user.role === 'sub-admin' && !licenseId) {
            return NextResponse.json(
                { error: 'Your account must be linked to a license before inviting responders.' },
                { status: 400 },
            );
        }

        const existingUser = await User.findOne({ email }).lean();
        if (existingUser) {
            return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
        }

        await ResponderInvite.deleteMany({
            email,
            licenseId: licenseId ? new mongoose.Types.ObjectId(licenseId) : null,
            usedAt: null,
        });

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

        await ResponderInvite.create({
            email,
            token,
            responderVertical: option.responderVertical,
            responderFunction: option.responderFunction,
            licenseId: licenseId || null,
            invitedBy: session.user.id,
            expiresAt,
        });

        const signupUrl = buildResponderSignupUrl(token);
        const emailResult = await sendResponderInviteEmail({
            to: email,
            signupUrl,
            roleLabel: option.label,
        });

        return NextResponse.json({
            success: true,
            inviteLink: signupUrl,
            emailSent: emailResult.sent,
            emailError: emailResult.error,
        });
    } catch (e) {
        console.error('responder-invites POST', e);
        return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }
}
