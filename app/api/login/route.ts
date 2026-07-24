import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { encrypt } from '@/lib/auth';
import { cookies } from 'next/headers';
import SystemStatus from '@/models/SystemStatus';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';
import { DEMO_PRESENTATION_EMAIL, DEMO_PRESENTATION_PASSWORD } from '@/lib/demo/constants';
import { ensureArkansasPresentationLicense } from '@/lib/demo/ensure-presentation-license';
import { clearDemoSimulationCookieOptions } from '@/lib/demo/cookie';
import { isDemoEligibleEmail } from '@/lib/demo/eligibility';

export async function POST(req: NextRequest) {
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

        const normalizedEmail = String(email).toLowerCase().trim();

        // Auto-provision public demo user
        if (normalizedEmail === 'public_demo@yopmail.com' && password === 'public_demo_pass') {
            const existingUser = await User.findOne({ email: normalizedEmail });
            if (!existingUser) {
                const hashedPassword = await bcrypt.hash(password, 10);
                await User.create({
                    name: 'Demo Public Official',
                    email: normalizedEmail,
                    password: hashedPassword,
                    role: 'public_official',
                    responderVertical: 'public-official',
                    responderFunction: 'Public Official (demo)',
                    accountStatus: 'approved',
                    licenseId: null,
                });
            }
        }

        // Auto-provision non-profit responder demo user
        if (normalizedEmail === 'nonprofit_demo@yopmail.com' && password === 'nonprofit_demo_pass') {
            const existingUser = await User.findOne({ email: normalizedEmail });
            if (!existingUser) {
                const hashedPassword = await bcrypt.hash(password, 10);
                await User.create({
                    name: 'Demo Non-Profit Partner',
                    email: normalizedEmail,
                    password: hashedPassword,
                    role: 'responder',
                    responderVertical: 'nonprofit',
                    responderFunction: 'Non-Profits (demo)',
                    accountStatus: 'approved',
                    licenseId: null,
                });
            }
        }

        // Auto-provision Arkansas presentation sub-admin (demo simulation eligible)
        if (normalizedEmail === DEMO_PRESENTATION_EMAIL && password === DEMO_PRESENTATION_PASSWORD) {
            let existingUser = await User.findOne({ email: normalizedEmail });
            if (!existingUser) {
                const hashedPassword = await bcrypt.hash(password, 10);
                existingUser = await User.create({
                    name: 'Arkansas Sub-Admin',
                    email: normalizedEmail,
                    password: hashedPassword,
                    role: 'sub-admin',
                    state: 'Arkansas',
                    city: 'Little Rock',
                    country: 'USA',
                    accountStatus: 'approved',
                    requestedLicenseType: 'state',
                    licenseId: null,
                });
            } else if (!String(existingUser.state ?? '').trim()) {
                existingUser.state = 'Arkansas';
                existingUser.requestedLicenseType = existingUser.requestedLicenseType || 'state';
                await existingUser.save();
            }
            await ensureArkansasPresentationLicense(existingUser._id.toString());
        }

        // Find user and include password field
        const user = await User.findOne({ email: normalizedEmail }).select('+password');

        if (!user) {
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
                responderVertical: user.responderVertical || '',
                responderFunction: user.responderFunction || '',
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
                state: user.state || '',
                country: user.country || '',
                responderVertical: user.responderVertical || '',
                responderFunction: user.responderFunction || '',
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

        // Never leave presentation-demo cookie active for county / non-demo accounts.
        if (!isDemoEligibleEmail(normalizedEmail)) {
            (await cookies()).set(clearDemoSimulationCookieOptions());
        }

        void recordActivity({
            userId: user._id.toString(),
            action: ACTIVITY_ACTIONS.LOGIN,
            label: `Signed in as ${user.role || 'user'}`,
            meta: { email: user.email },
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
