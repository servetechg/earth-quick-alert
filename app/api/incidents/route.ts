import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import IncidentReport from '@/models/IncidentReport';

export async function GET(req: NextRequest) {
    try {
        await connectDB();

        // Fetch incidents sorted by newest first
        const incidents = await IncidentReport.find()
            .sort({ createdAt: -1 })
            .limit(100) // reasonable limit for live feed
            .lean();

        // Transform slightly to match the UI expectations
        const formattedIncidents = (incidents as any[]).map(inc => ({
            id: inc._id.toString(),
            type: inc.type,
            title: `${inc.type}${inc.description ? ' - ' + inc.description : ''}`,
            location: inc.location,
            lat: inc.lat,
            lng: inc.lng,
            reportedBy: inc.reportedBy,
            time: inc.createdAt,
            status: inc.status,
            source: inc.source
        }));

        return NextResponse.json({
            success: true,
            data: formattedIncidents,
        });
    } catch (error) {
        console.error('Error fetching incidents:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch incidents' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        await connectDB();

        const body = await req.json();
        const { type, location, description, reportedBy, source } = body;

        // Basic validation
        if (!type || !location || !reportedBy) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Auto-geocode the location to get coordinates for the map
        let lat: number | undefined;
        let lng: number | undefined;

        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json', 'User-Agent': 'EmergencyDashboard/1.0 (info@servetechglobal.com)' }
            });

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    lng = Number(data[0].lon);
                    lat = Number(data[0].lat);
                }
            }
        } catch (err) {
            console.error(`Failed to geocode incident location: ${location}`, err);
        }

        const newIncident = await IncidentReport.create({
            type,
            location,
            lat,
            lng,
            description: description || '',
            reportedBy,
            source: source || 'End User',
            status: 'Submitted'
        });

        return NextResponse.json({
            success: true,
            data: {
                id: newIncident._id.toString(),
                type: newIncident.type,
                title: `${newIncident.type}${newIncident.description ? ' - ' + newIncident.description : ''}`,
                location: newIncident.location,
                lat: newIncident.lat,
                lng: newIncident.lng,
                reportedBy: newIncident.reportedBy,
                time: newIncident.createdAt,
                status: newIncident.status,
                source: newIncident.source
            }
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating incident:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create incident' },
            { status: 500 }
        );
    }
}
