import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import { getSubAdminUserFilter } from '@/lib/admin-filters';
import { isResponderVertical } from '@/lib/responder-verticals';
import ResponderHospitalCapacity from '@/models/ResponderHospitalCapacity';
import ResponderPoliceDeployment from '@/models/ResponderPoliceDeployment';
import ResponderPharmacyDeployment from '@/models/ResponderPharmacyDeployment';
import ResponderTransitDeployment from '@/models/ResponderTransitDeployment';

export async function GET(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();
        const { searchParams } = new URL(req.url);
        const roleFilter = searchParams.get('role');
        const requestedLicenseFilter = searchParams.get('requestedLicense');
        const licenseIdFilter = searchParams.get('licenseId');
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.max(1, parseInt(searchParams.get('limit') || '50', 10));
        const skip = (page - 1) * limit;

        if (!session || (session.user.role !== 'super-admin' && session.user.role !== 'sub-admin' && session.user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        /** GIS / org map: sub-admins may list peer sub-admins on the same license (not full directory). */
        if (session.user.role === 'sub-admin' && roleFilter === 'sub-admin') {
            const me = await User.findById(session.user.id).select('licenseId role').lean();
            if (!me || me.role !== 'sub-admin') {
                return NextResponse.json({ users: [], currentUser: null, userStats: await buildUserStats() });
            }
            const leaderQuery: Record<string, unknown> = { role: 'sub-admin' };
            if (me.licenseId) {
                leaderQuery.licenseId = me.licenseId;
            } else {
                leaderQuery._id = session.user.id;
            }
            const total = await User.countDocuments(leaderQuery);
            const users = await User.find(leaderQuery)
                .select('_id name email responderFunction responderVertical accountStatus city state role requestedLicense licenseId createdBy createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
            const userStats = {
                totalUsers: await User.countDocuments({}),
                pendingSubAdmins: await User.countDocuments({ role: 'sub-admin', accountStatus: 'pending' }),
                approvedSubAdmins: await User.countDocuments({ role: 'sub-admin', accountStatus: 'approved' }),
                superAdmins: await User.countDocuments({ role: 'super-admin' }),
            };
            let currentUser: any = null;
            const user = await User.findById(session.user.id);
            if (user) {
                currentUser = {
                    hasLicense: !!user.licenseId,
                    requestedLicense: !!user.requestedLicense,
                };
            }
            return NextResponse.json({ users, total, currentUser, userStats });
        }

        let baseQuery: any = {};
        if (session.user.role === 'sub-admin') {
            const filter = await getSubAdminUserFilter(session.user.id);
            baseQuery = filter || { createdBy: session.user.id };
            // Exclude self from the list for sub-admins
            if (baseQuery.$or) {
                baseQuery = { $and: [baseQuery, { _id: { $ne: session.user.id } }] };
            } else {
                baseQuery._id = { $ne: session.user.id };
            }
        }

        let query: any = { ...baseQuery };

        // 1. If explicit role filter is provided
        if (roleFilter && roleFilter !== 'all') {
            // Security: Sub-admins can't filter for roles they are not allowed to manage
            if (session.user.role === 'sub-admin') {
                const roles = roleFilter.includes(',')
                    ? roleFilter.split(',').map((r) => r.trim())
                    : [roleFilter.trim()];
                const allowed = roles.every((r) => r === 'user' || r === 'responder');
                if (!allowed) {
                    return NextResponse.json({ error: 'Unauthorized role access' }, { status: 403 });
                }
            }

            if (roleFilter.includes(',')) {
                query.role = { $in: roleFilter.split(',').map(r => r.trim()) };
            } else {
                query.role = roleFilter;
            }
        }

        // 2. requestedLicense filter (can be combined with other filters)
        if (requestedLicenseFilter === 'true') {
            query.requestedLicense = true;
        }

        // 3. licenseId filter (for Super-Admins viewing specific organizations)
        if (licenseIdFilter) {
            query.licenseId = licenseIdFilter;
        }

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .select('_id name email responderFunction responderVertical accountStatus city state role requestedLicense licenseId createdBy createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Calculate stats for the dashboard cards (Requested by User)
        const userStats = {
            totalUsers: await User.countDocuments({}),
            pendingSubAdmins: await User.countDocuments({ role: 'sub-admin', accountStatus: 'pending' }),
            approvedSubAdmins: await User.countDocuments({ role: 'sub-admin', accountStatus: 'approved' }),
            superAdmins: await User.countDocuments({ role: 'super-admin' })
        };

        // Include current user license status for sub-admins
        let currentUser: any = null;
        if (session.user.role !== 'super-admin') {
            const user = await User.findById(session.user.id);
            if (user) {
                currentUser = {
                    hasLicense: !!user.licenseId,
                    requestedLicense: !!user.requestedLicense
                };
            }
        }

        return NextResponse.json({ users, total, currentUser, userStats });
    } catch (error) {
        console.error('Fetch users error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || (session.user.role !== 'super-admin' && session.user.role !== 'sub-admin' && session.user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { userId, accountStatus, role, requestedLicense, responderVertical, name, responderFunction } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Find the user first to check their role if the requester is a sub-admin
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Sub-admin restriction: can only modify regular users
        if (session.user.role === 'sub-admin' && targetUser.role !== 'user') {
            return NextResponse.json({ error: 'Sub-Admins can only manage regular users' }, { status: 403 });
        }

        const updateData: any = {};
        if (name) updateData.name = name;
        if (responderFunction !== undefined) updateData.responderFunction = responderFunction;
        if (accountStatus) updateData.accountStatus = accountStatus;
        if (typeof requestedLicense === 'boolean') updateData.requestedLicense = requestedLicense;
        if (role) {
            // Sub-admins cannot promote users to sub-admin or super-admin
            if (session.user.role === 'sub-admin' && (role === 'sub-admin' || role === 'super-admin' || role === 'admin')) {
                return NextResponse.json({ error: 'Unauthorized role promotion' }, { status: 403 });
            }
            updateData.role = role;
            if (role !== 'responder') {
                updateData.responderVertical = '';
            } else if (responderVertical === undefined) {
                updateData.responderVertical =
                    targetUser.responderVertical || 'general-responder';
            }
        }
        if (responderVertical !== undefined && session.user.role !== 'sub-admin') {
            const raw = responderVertical === null || responderVertical === '' ? '' : String(responderVertical).trim();
            if (raw && !isResponderVertical(raw)) {
                return NextResponse.json({ error: 'Invalid responder vertical' }, { status: 400 });
            }
            if (targetUser.role === 'responder' || updateData.role === 'responder') {
                updateData.responderVertical = raw || 'general-responder';
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        );

        if (!updatedUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error('Update user error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || (session.user.role !== 'super-admin' && session.user.role !== 'sub-admin' && session.user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const isBulk = Array.isArray(body);
        const usersToCreate = isBulk ? body : [body];

        // Fetch current user and check license count
        const creator = await User.findById(session.user.id);
        if (!creator) {
            return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
        }

        // Only enforce limit for sub-admins
        if (session.user.role === 'sub-admin' && creator.licenseId) {
            const userCount = await User.countDocuments({ licenseId: creator.licenseId });
            // Total limit (including sub-admin) should be 501 (sub-admin + 500 EOC users)
            if (userCount + usersToCreate.length > 501) {
                return NextResponse.json({ error: 'Creation would exceed organization user limit (500).' }, { status: 403 });
            }
        }

        const bcrypt = require('bcryptjs');
        const results = [];

        for (const userData of usersToCreate) {
            const { name, email, password, role, responderFunction, responderVertical } = userData;

            if (!name || !email || !password || !role) {
                if (!isBulk) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
                results.push({ email, error: 'Missing required fields', success: false });
                continue;
            }

            let verticalField = '';
            if (role === 'responder') {
                const raw =
                    responderVertical !== undefined && responderVertical !== null
                        ? String(responderVertical).trim()
                        : '';
                if (raw && !isResponderVertical(raw)) {
                    if (!isBulk) return NextResponse.json({ error: 'Invalid responder vertical' }, { status: 400 });
                    results.push({ email, error: 'Invalid responder vertical', success: false });
                    continue;
                }
                verticalField = raw || 'general-responder';
            }

            const userExists = await User.findOne({ email });
            if (userExists) {
                if (!isBulk) return NextResponse.json({ error: 'User already exists' }, { status: 400 });
                results.push({ email, error: 'User already exists', success: false });
                continue;
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const newUser = await User.create({
                name,
                email,
                password: hashedPassword,
                role,
                responderFunction: responderFunction || '',
                responderVertical: verticalField,
                licenseId: creator.licenseId || null,
                city: creator.city || '',
                country: creator.country || '',
                accountStatus: 'approved',
                createdBy: session.user.id
            });

            results.push({
                email: newUser.email,
                id: newUser._id,
                success: true
            });
        }

        if (isBulk) {
            const successCount = results.filter(r => r.success).length;
            return NextResponse.json({
                success: true,
                message: `Processed ${usersToCreate.length} users. ${successCount} successfully created.`,
                results
            });
        }

        return NextResponse.json({
            success: true,
            message: 'User created successfully',
            user: results[0]
        });
    } catch (error: any) {
        console.error('Create user error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || (session.user.role !== 'super-admin' && session.user.role !== 'sub-admin' && session.user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (session.user.role === 'sub-admin' && targetUser.role !== 'user' && targetUser.role !== 'responder') {
            return NextResponse.json({ error: 'Sub-Admins can only delete regular users or responders' }, { status: 403 });
        }

        await Promise.all([
            ResponderHospitalCapacity.deleteMany({ ownerUserId: userId }),
            ResponderPoliceDeployment.deleteMany({ ownerUserId: userId }),
            ResponderPharmacyDeployment.deleteMany({ ownerUserId: userId }),
            ResponderTransitDeployment.deleteMany({ ownerUserId: userId }),
        ]);

        await User.findByIdAndDelete(userId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

