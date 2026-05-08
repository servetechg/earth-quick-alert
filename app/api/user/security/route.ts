import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';

export async function GET() {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await User.findById(session.user.id).select('twoFactorEnabled sessionTimeoutEnabled').lean();
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const u = user as { twoFactorEnabled?: boolean; sessionTimeoutEnabled?: boolean };
        return NextResponse.json({
            success: true,
            data: {
                twoFactorEnabled: Boolean(u.twoFactorEnabled),
                sessionTimeoutEnabled: u.sessionTimeoutEnabled !== false,
            },
        });
    } catch (e: any) {
        console.error('GET /api/user/security:', e);
        return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const twoFactorEnabled =
            typeof body.twoFactorEnabled === 'boolean' ? body.twoFactorEnabled : undefined;
        const sessionTimeoutEnabled =
            typeof body.sessionTimeoutEnabled === 'boolean' ? body.sessionTimeoutEnabled : undefined;

        const update: Record<string, boolean> = {};
        if (twoFactorEnabled !== undefined) update.twoFactorEnabled = twoFactorEnabled;
        if (sessionTimeoutEnabled !== undefined) update.sessionTimeoutEnabled = sessionTimeoutEnabled;

        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
        }

        const user = await User.findByIdAndUpdate(session.user.id, { $set: update }, {
            new: true,
            runValidators: true,
        })
            .select('twoFactorEnabled sessionTimeoutEnabled')
            .lean();

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const u = user as { twoFactorEnabled?: boolean; sessionTimeoutEnabled?: boolean };
        const data = {
            twoFactorEnabled: Boolean(u.twoFactorEnabled),
            sessionTimeoutEnabled: u.sessionTimeoutEnabled !== false,
        };

        void recordActivity({
            userId: session.user.id,
            action: ACTIVITY_ACTIONS.SECURITY_SETTINGS_UPDATE,
            label: 'Security preferences updated',
            meta: {
                twoFactorEnabled: data.twoFactorEnabled,
                sessionTimeoutEnabled: data.sessionTimeoutEnabled,
            },
        });

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (e: any) {
        console.error('PATCH /api/user/security:', e);
        return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
    }
}
