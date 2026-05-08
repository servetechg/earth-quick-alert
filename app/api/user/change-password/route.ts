import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';

const MIN_LEN = 6;

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const currentPassword = String(body.currentPassword ?? '');
        const newPassword = String(body.newPassword ?? '');

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: 'Current password and new password are required' },
                { status: 400 },
            );
        }
        if (newPassword.length < MIN_LEN) {
            return NextResponse.json(
                { error: `New password must be at least ${MIN_LEN} characters` },
                { status: 400 },
            );
        }
        if (currentPassword === newPassword) {
            return NextResponse.json({ error: 'New password must be different from current' }, { status: 400 });
        }

        const user = await User.findById(session.user.id).select('+password');
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const ok = await bcrypt.compare(currentPassword, user.password as string);
        if (!ok) {
            return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        void recordActivity({
            userId: session.user.id,
            action: ACTIVITY_ACTIONS.SECURITY_PASSWORD_CHANGE,
            label: 'Password changed',
        });

        return NextResponse.json({ success: true, message: 'Password updated' });
    } catch (e: any) {
        console.error('POST /api/user/change-password:', e);
        return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
    }
}
