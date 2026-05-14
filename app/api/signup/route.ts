import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { encrypt } from '@/lib/auth';
import { cookies } from 'next/headers';
import SystemStatus from '@/models/SystemStatus';

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const { name, email, password, isSafe, role, country, state, city, zipcode } = await req.json();

        // Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        // Validation for Location Fields for all users
        if (!country || !state || !city || !zipcode) {
            return NextResponse.json({ error: 'Country, State, City, and Zipcode are required' }, { status: 400 });
        }

        // --- NEW VALIDATION: UNIQUE SUB-ADMIN PER CITY ---
        if (role === 'sub-admin' && city && country && state) {
            const subAdminInCity = await User.findOne({
                role: 'sub-admin',
                city: city,
                state: state,
                country: country
            });

            if (subAdminInCity) {
                return NextResponse.json({
                    error: `already sub-admin on this city`
                }, { status: 400 });
            }
        }
        // ------------------------------------------------

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Fetch current system mode
        let systemStatus = await SystemStatus.findOne();
        if (!systemStatus) {
            systemStatus = await SystemStatus.create({ emergencyMode: 'safe' });
        }

        const isDefaultAdmin = email.toLowerCase() === 'admin@gmail.com';
        const finalRole = isDefaultAdmin ? 'super-admin' : (role || 'user');

        // --- NEW APPROVAL LOGIC: Sub-admins start as pending ---
        const accountStatus = (finalRole === 'sub-admin') ? 'pending' : 'approved';
        const requestedLicense = (finalRole === 'sub-admin');
        // ----------------------------------------------------

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: finalRole,
            accountStatus,
            requestedLicense,
            isSafe: isSafe !== undefined ? isSafe : true,
            country: country || '',
            state: state || '',
            city: city || '',
            zipcode: zipcode || '',
        });

        // Create session
        const expires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
        const session = await encrypt({
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                role: user.role,
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
                state: user.state || '',
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

        (await cookies()).set('accountStatus', user.accountStatus || 'pending', {
            expires,
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });

        return response;
    } catch (error) {
        console.error('Signup error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
