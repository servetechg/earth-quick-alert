import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import License from '@/models/License';
import User from '@/models/User';
import EOCSettings from '@/models/EOCSettings';
import { getSession } from '@/lib/auth';
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config';
import {
    clampLicenseRadiusMile,
    LICENSE_COVERAGE_MIN_MILE,
    resolveMaxRadiusForState,
} from '@/lib/geo/license-coverage-radius';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || session.user.role !== 'super-admin') {
            return NextResponse.json({ error: 'Unauthorized. Only Super Admin can view licenses.' }, { status: 401 });
        }

        const licenses = await License.find({})
            .populate('assignedSubAdminId', 'name email accountStatus')
            .sort({ createdAt: -1 });

        return NextResponse.json({ licenses });
    } catch (error) {
        console.error('Fetch licenses error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || session.user.role !== 'super-admin') {
            return NextResponse.json({ error: 'Unauthorized. Only Super Admin can create licenses.' }, { status: 401 });
        }

        const {
            organizationName,
            planType,
            endDate,
            userId,
            country,
            state,
            city,
            zipcode,
            billingContact,
            billingAddress,
            billingEmail,
            phoneNumber,
            radiusMile,
            stateCode,
            countryCode,
            isNewUser
        } = await req.json();

        if (!organizationName || (!userId && !isNewUser)) {
            return NextResponse.json({ error: 'Missing required fields (organizationName and user assignation)' }, { status: 400 });
        }

        const requestedRadius = Number(radiusMile) || LICENSE_COVERAGE_MIN_MILE;
        if (state || stateCode) {
            const maxRadiusMile = await resolveMaxRadiusForState(
                {
                    stateCode: stateCode || undefined,
                    countryCode: countryCode || undefined,
                    stateName: state || undefined,
                    countryName: country || undefined,
                },
                GOOGLE_MAPS_API_KEY
            );
            if (maxRadiusMile != null && requestedRadius > maxRadiusMile) {
                return NextResponse.json(
                    {
                        error: `Coverage radius cannot exceed ${maxRadiusMile} miles for ${state || stateCode}`,
                    },
                    { status: 400 }
                );
            }
        }

        let assignedSubAdmin;

        if (isNewUser) {
            // Check if user already exists
            const existingUser = await User.findOne({ email: billingEmail.toLowerCase() });
            if (existingUser) {
                assignedSubAdmin = existingUser;
            } else {
                // Create new user
                const hashedPassword = await bcrypt.hash('Ready2Go@2026', 12);
                assignedSubAdmin = await User.create({
                    name: billingContact,
                    email: billingEmail.toLowerCase(),
                    password: hashedPassword,
                    role: 'sub-admin',
                    accountStatus: 'approved',
                    country,
                    state,
                    city,
                    zipcode,
                    phoneNumber
                });
            }
        } else {
            // Fetch the existing user to be assigned
            assignedSubAdmin = await User.findById(userId);
        }

        if (!assignedSubAdmin) {
            return NextResponse.json({ error: 'Selected user not found' }, { status: 404 });
        }

        // Upgrade user to sub-admin status if they aren't already
        assignedSubAdmin.role = 'sub-admin';
        assignedSubAdmin.accountStatus = 'approved';
        assignedSubAdmin.requestedLicense = false;
        if (country) assignedSubAdmin.country = country;
        if (state) assignedSubAdmin.state = state;
        if (city) assignedSubAdmin.city = city;
        if (zipcode) assignedSubAdmin.zipcode = zipcode;
        if (phoneNumber) assignedSubAdmin.phoneNumber = phoneNumber;
        await assignedSubAdmin.save();

        // 2. Create the License
        const license = await License.create({
            organizationName,
            subscriptionDetails: {
                planType: planType || 'Enterprise',
                endDate: endDate ? new Date(endDate) : null
            },
            assignedSubAdminId: assignedSubAdmin._id,
            billingContact,
            billingAddress,
            billingEmail,
            phoneNumber,
            radiusMile: requestedRadius
        });

        // 3. Update the sub-admin to point to this new license
        assignedSubAdmin.licenseId = license._id;
        await assignedSubAdmin.save();

        // 4. Create default EOCSettings for this license
        await EOCSettings.create({
            licenseId: license._id,
        });

        return NextResponse.json({ success: true, license });
    } catch (error: any) {
        console.error('Create license error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || session.user.role !== 'super-admin') {
            return NextResponse.json({ error: 'Unauthorized. Only Super Admin can remove licenses.' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const licenseId = searchParams.get('licenseId');

        if (!licenseId) {
            return NextResponse.json({ error: 'License ID is required' }, { status: 400 });
        }

        // 1. Find the license to get the assigned user before deletion
        const license = await License.findById(licenseId);
        if (!license) {
            return NextResponse.json({ error: 'License not found' }, { status: 404 });
        }

        // 2. Clear the licenseId from the assigned user if it exists
        if (license.assignedSubAdminId) {
            await User.findByIdAndUpdate(license.assignedSubAdminId, {
                $unset: { licenseId: 1 }
            });
        }

        // 3. Delete associated EOC Settings
        await EOCSettings.deleteMany({ licenseId: license._id });

        // 4. Delete the license itself
        await License.findByIdAndDelete(licenseId);

        return NextResponse.json({ success: true, message: 'License removed successfully' });
    } catch (error: any) {
        console.error('Delete license error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
