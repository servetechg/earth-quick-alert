import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import { createSafeCheckInActivity } from '@/lib/services/citizen-activity-service';

// GET: Fetch current user's safety status and family list
export async function GET() {
    try {
        await dbConnect();
        const session = await getSession();

        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await User.findById(session.user.id).select('isSafe familyMembers');
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({
            isSafe: user.isSafe ?? true,
            familyMembers: user.familyMembers || []
        });
    } catch (error: any) {
        console.error('Fetch safety error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH: Update self safety status
export async function PATCH(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();

        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { isSafe } = await req.json();

        const user = await User.findByIdAndUpdate(
            session.user.id,
            { isSafe },
            { new: true }
        );

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        try {
            await createSafeCheckInActivity(session.user.id as string, { isSafe: Boolean(isSafe) });
        } catch (activityErr) {
            console.warn('Safe check-in activity log failed:', activityErr);
        }

        return NextResponse.json({ success: true, isSafe: user.isSafe });
    } catch (error: any) {
        console.error('Update safety error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Add a family member
export async function POST(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();

        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { name, relationship, location } = await req.json();

        if (!name || !relationship) {
            return NextResponse.json({ error: 'Name and relationship are required' }, { status: 400 });
        }

        const user = await User.findById(session.user.id);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        user.familyMembers.push({
            name,
            relationship,
            location: location || '',
            status: 'true',
            statusReason: '',
            lastUpdated: new Date()
        });

        await user.save();

        return NextResponse.json({
            success: true,
            familyMembers: user.familyMembers
        });
    } catch (error: any) {
        console.error('Add family member error:', error);
        return NextResponse.json({
            error: error.message || 'Internal server error',
            details: error.errors
        }, { status: 500 });
    }
}

// PUT: Update a family member's details
export async function PUT(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();

        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { id, name, relationship, location, status, statusReason } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
        }

        const user = await User.findById(session.user.id);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const memberIndex = user.familyMembers.findIndex(
            (m: any) => m._id.toString() === id
        );

        if (memberIndex === -1) {
            return NextResponse.json({ error: 'Family member not found' }, { status: 404 });
        }

        // Update fields if provided
        if (name) user.familyMembers[memberIndex].name = name;
        if (relationship) user.familyMembers[memberIndex].relationship = relationship;
        if (location !== undefined) user.familyMembers[memberIndex].location = location;
        if (status) user.familyMembers[memberIndex].status = status;
        if (statusReason !== undefined) user.familyMembers[memberIndex].statusReason = statusReason;
        user.familyMembers[memberIndex].lastUpdated = new Date();

        await user.save();

        return NextResponse.json({
            success: true,
            familyMembers: user.familyMembers
        });
    } catch (error: any) {
        console.error('Update family member error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE: Remove a family member
export async function DELETE(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();

        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const memberId = searchParams.get('id');

        if (!memberId) {
            return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
        }

        const user = await User.findById(session.user.id);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        user.familyMembers = user.familyMembers.filter(
            (member: any) => member._id.toString() !== memberId
        );

        await user.save();

        return NextResponse.json({
            success: true,
            familyMembers: user.familyMembers
        });
    } catch (error: any) {
        console.error('Remove family member error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
