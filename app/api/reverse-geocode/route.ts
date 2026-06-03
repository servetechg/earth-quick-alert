import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!lat || !lng) {
        return NextResponse.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        // Nominatim (OpenStreetMap) — free, no API key required
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&limit=1`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'EmergencyDashboard/1.0 (info@servetechglobal.com)'
            },
            signal: controller.signal,
            next: { revalidate: 3600 } // Cache for 1 hour to reduce outgoing requests
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Geocoding service returned ${response.status}` },
                { status: response.status === 404 ? 404 : 502 }
            );
        }

        const data = await response.json();

        if (data && data.display_name) {
            const a = data.address || {};
            const parts = [
                a.amenity || a.building || a.road,
                a.suburb || a.neighbourhood,
                a.city || a.town || a.village || a.county,
                a.state,
                a.country,
            ].filter(Boolean);
            const name = [...new Set(parts)].join(', ') || data.display_name;
            return NextResponse.json({ name, address: a });
        }

        return NextResponse.json({ error: 'No results found for these coordinates' }, { status: 404 });
    } catch (error: any) {
        if (error.name === 'AbortError') {
            return NextResponse.json({ error: 'Reverse geocoding request timed out' }, { status: 504 });
        }
        console.warn('Reverse geocoding proxy warning:', error.message);
        return NextResponse.json({ error: 'Failed to process reverse geocoding request' }, { status: 500 });
    }
}
