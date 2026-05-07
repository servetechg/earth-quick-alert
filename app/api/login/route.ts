import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { encrypt } from '@/lib/auth';
import { cookies } from 'next/headers';
import SystemStatus from '@/models/SystemStatus';

export async function POST(req: NextRequest) {
    console.log('Login API request received at', new Date().toISOString());
    try {
        await connectDB();

        let body;
        try {
            body = await req.json();
        } catch (e) {
            console.error('Failed to parse request body:', e);
            return NextResponse.json({ error: 'Invalid JSON message' }, { status: 400 });
        }

        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        // Find user and include password field
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            console.log('User not found:', email);
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        // Verify password
        let isMatch = false;
        try {
            isMatch = await bcrypt.compare(password, user.password);
        } catch (bcryptError) {
            console.error('Bcrypt comparison error:', bcryptError);
            throw new Error('Authentication processing failed');
        }

        if (!isMatch) {
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        // Check account status
        // We allow pending and rejected users to get a session, but middleware/frontend will restrict them.
        // This ensures they are authenticated and redirected to the appropriate "Waiting" or "Rejected" screen.

        // Fetch current system mode
        let systemStatus = await SystemStatus.findOne();
        if (!systemStatus) {
            systemStatus = await SystemStatus.create({ emergencyMode: 'safe' });
        }

        // Create session
        const expires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
        const session = await encrypt({
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                role: user.role,
                accountStatus: user.accountStatus,
                licenseId: user.licenseId?.toString() || null,
            },
            expires
        });

        const response = NextResponse.json({
            success: true,
            user: {
                email: user.email,
                name: user.name,
                role: user.role,
                accountStatus: user.accountStatus,
                isSafe: user.isSafe ?? true,
                location: user.location || '',
                city: user.city || '',
                country: user.country || '',
            },
            systemMode: systemStatus.emergencyMode
        });

        (await cookies()).set('session', session, {
            expires,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });

        (await cookies()).set('userRole', user.role, {
            expires,
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });

        (await cookies()).set('accountStatus', user.accountStatus || 'approved', {
            expires,
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });

        return response;
    } catch (error: any) {
        console.error('Login error detailed:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause
        });
        return NextResponse.json({
            error: 'Internal server error',
            message: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
