import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { requireBearerUser } from '@/lib/auth/mobile/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireBearerUser(req);
        if ('error' in auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const { currentPassword, newPassword } = body;

        if (typeof currentPassword !== 'string' || !currentPassword) {
            return NextResponse.json({ error: 'currentPassword is required' }, { status: 400 });
        }
        if (typeof newPassword !== 'string' || newPassword.length < 8) {
            return NextResponse.json({ error: 'newPassword must be at least 8 characters' }, { status: 400 });
        }

        await connectDB();
        const user = await User.findById(auth.userId).select('+password');
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) {
            return NextResponse.json({ error: 'Incorrect current password' }, { status: 401 });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 });
    } catch (e) {
        console.error('v1/users/update-password error:', e);
        return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }
}
