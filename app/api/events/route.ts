import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import EmergencyEvent from '@/models/EmergencyEvent';
import { getSession } from '@/lib/auth';

export async function GET() {
    console.log('GET /api/events - Fetching active incidents');
    try {
        await dbConnect();
        const events = await EmergencyEvent.find({
            status: { $in: ['active', 'monitoring'] }
        }).sort({ createdAt: -1 }).lean();

        console.log(`Found ${events.length} active incidents`);
        return NextResponse.json(events || []);
    } catch (error: any) {
        console.error('Events GET error:', error);
        return NextResponse.json({ 
            error: 'Failed to fetch incident reports',
            message: error.message 
        }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await dbConnect();
        const session = await getSession();

        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
        }

        const body = await request.json();
        const { title, description, type, severity, location, status, affectedZones } = body;

        const newEvent = await EmergencyEvent.create({
            title,
            description,
            type,
            severity,
            location,
            status,
            affectedZones,
            createdBy: session.user.name || session.user.email,
            timeline: [{
                action: 'Event Created',
                description: `${type} event created: ${title}`,
                user: session.user.name || session.user.email,
            }]
        });

        return NextResponse.json(newEvent, { status: 201 });
    } catch (error) {
        console.error('Events POST error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        await dbConnect();
        const session = await getSession();

        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
        }

        await EmergencyEvent.findByIdAndDelete(id);

        return NextResponse.json({ message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Events DELETE error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
