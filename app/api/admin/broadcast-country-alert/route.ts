import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import { notificationService } from '@/lib/services/notification-service';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        // Security check: Only Super Admin can broadcast
        if (!session || session.user.role !== 'super-admin') {
            return NextResponse.json({ error: 'Unauthorized. Super-Admin access only.' }, { status: 403 });
        }

        const { country, message, title } = await req.json();

        if (!country || !message) {
            return NextResponse.json({ error: 'Country and message are required.' }, { status: 400 });
        }

        // 1. Find all users in the specific country
        // We target both users and responders in that country
        const usersInCountry = await User.find({ 
            country: { $regex: new RegExp(`^${country}$`, 'i') } 
        }).select('_id name email').lean();

        if (usersInCountry.length === 0) {
            void recordActivity({
                userId: session.user.id,
                action: ACTIVITY_ACTIONS.ALERT_COUNTRY_BROADCAST,
                label: `Country alert attempted (${country}) — no recipients`,
                meta: { country, recipients: 0 },
            });
            return NextResponse.json({
                success: true,
                message: `No users found in ${country}.`,
                count: 0,
            });
        }

        const broadcastTitle = title || `Emergency Alert: ${country}`;
        const broadcastMessage = message;

        // 2. Dispatch notifications
        // In a real production environment, this would be a background job
        const notificationPromises = usersInCountry.map(user => 
            notificationService.sendUserNotification(
                (user as any)._id.toString(),
                broadcastTitle,
                broadcastMessage,
                ['push', 'email'], // Defaulting to critical channels
                { country, broadcastType: 'country_wide' }
            )
        );

        await Promise.all(notificationPromises);

        void recordActivity({
            userId: session.user.id,
            action: ACTIVITY_ACTIONS.ALERT_COUNTRY_BROADCAST,
            label: `Country alert broadcast: ${country}`,
            meta: {
                country,
                recipients: usersInCountry.length,
                title: broadcastTitle,
            },
        });

        return NextResponse.json({ 
            success: true, 
            message: `Successfully broadcasted to ${usersInCountry.length} users in ${country}.`,
            count: usersInCountry.length 
        });
    } catch (error: any) {
        console.error('Broadcast country alert error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
