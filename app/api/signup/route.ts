import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { encrypt } from '@/lib/auth';
import { cookies } from 'next/headers';
import SystemStatus from '@/models/SystemStatus';
import ResponderInvite from '@/models/ResponderInvite';
import mongoose from 'mongoose';

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        let body: Record<string, unknown>;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        const name = String(body.name || '').trim();
        const email = String(body.email || '')
            .toLowerCase()
            .trim();
        const password = String(body.password || '');
        const isSafe = body.isSafe !== undefined ? Boolean(body.isSafe) : true;
        const role = String(body.role || 'user');
        const country = String(body.country || '').trim();
        const state = String(body.state || '').trim();
        const city = String(body.city || '').trim();
        const zipcode = String(body.zipcode || '').trim();
        const responderInviteToken =
            typeof body.responderInviteToken === 'string' ? body.responderInviteToken.trim() : '';

        if (!name || !email || !password) {
            return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        if (!country || !state || !city || !zipcode) {
            return NextResponse.json({ error: 'Country, State, City, and Zipcode are required' }, { status: 400 });
        }

        let invite = responderInviteToken
            ? await ResponderInvite.findOne({
                  token: responderInviteToken,
                  usedAt: null,
                  expiresAt: { $gt: new Date() },
              })
            : null;
        if (responderInviteToken && !invite) {
            return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 400 });
        }
        if (invite && invite.email !== email) {
            return NextResponse.json(
                { error: 'Email must match the address this invite was sent to' },
                { status: 400 },
            );
        }

        if (!invite && role === 'sub-admin' && city && country && state) {
            const subAdminInCity = await User.findOne({
                role: 'sub-admin',
                city: city,
                state: state,
                country: country,
            });

            if (subAdminInCity) {
                return NextResponse.json({
                    error: `already sub-admin on this city`,
                }, { status: 400 });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        let systemStatus = await SystemStatus.findOne();
        if (!systemStatus) {
            systemStatus = await SystemStatus.create({ emergencyMode: 'safe' });
        }

        const isDefaultAdmin = email === 'admin@gmail.com';
        let finalRole = isDefaultAdmin ? 'super-admin' : role || 'user';
        let accountStatus = finalRole === 'sub-admin' ? 'pending' : 'approved';
        let requestedLicense = finalRole === 'sub-admin';
        let licenseId: mongoose.Types.ObjectId | null | undefined = undefined;
        let responderVertical = '';
        let responderFunction = '';
        let createdBy: mongoose.Types.ObjectId | null | undefined = undefined;

        if (invite) {
            finalRole = 'responder';
            accountStatus = 'approved';
            requestedLicense = false;
            licenseId = invite.licenseId || null;
            responderVertical = invite.responderVertical;
            responderFunction = invite.responderFunction;
            createdBy = invite.invitedBy;
        }

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: finalRole,
            accountStatus,
            requestedLicense,
            isSafe,
            country: country || '',
            state: state || '',
            city: city || '',
            zipcode: zipcode || '',
            ...(licenseId !== undefined ? { licenseId } : {}),
            ...(invite
                ? {
                      responderVertical,
                      responderFunction,
                      createdBy,
                  }
                : {}),
        });

        if (invite) {
            await ResponderInvite.updateOne({ _id: invite._id }, { $set: { usedAt: new Date() } });
        }

        const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);
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
            expires,
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
            systemMode: systemStatus.emergencyMode,
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
