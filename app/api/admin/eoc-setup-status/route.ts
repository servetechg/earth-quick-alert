import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import License from '@/models/License';
import User from '@/models/User';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Load License model before User queries that need it (avoids populate MissingSchemaError in some bundles / hot-reload orders).
        void License;

        const user = await User.findById(session.user.id).lean();

        if (!user || user.role !== 'sub-admin') {
            return NextResponse.json({ requiresSetup: false, userRole: user?.role });
        }

        if (!user.licenseId) {
            // Sub-Admin without a license assigned yet (orphan)
            return NextResponse.json({
                requiresSetup: true,
                orphan: true,
                message: 'No license assigned yet. Waiting for Super Admin.'
            });
        }

        const license = await License.findById(user.licenseId).lean();
        if (!license) {
            return NextResponse.json({
                requiresSetup: true,
                orphan: true,
                message: 'License record missing. Waiting for Super Admin.',
            });
        }

        // Check if geographic boundaries have been configured. 
        // Our updated schema means if it hasn't been configured, geographicBoundaries is undefined or type is not exactly Polygon
        const hasBoundaries =
            license.geographicBoundaries &&
            license.geographicBoundaries.coordinates &&
            license.geographicBoundaries.coordinates.length > 0;

        if (!hasBoundaries) {
            return NextResponse.json({
                requiresSetup: true,
                licenseId: license._id,
                organizationName: license.organizationName,
            });
        }

        return NextResponse.json({ requiresSetup: false, licenseId: license._id });

    } catch (error) {
        console.error('Fetch setup status error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
