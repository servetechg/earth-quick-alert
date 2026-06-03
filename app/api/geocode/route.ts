import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
        return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        // Nominatim (OpenStreetMap) geocoding - free, no API key required
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'EmergencyDashboard/1.0 (info@servetechglobal.com)'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Geocoding service returned ${response.status}` },
                { status: response.status === 404 ? 404 : 502 }
            );
        }

        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            return NextResponse.json({
                lat: Number(data[0].lat),
                lng: Number(data[0].lon)
            });
        }

        return NextResponse.json({ error: 'No results found for this address' }, { status: 404 });
    } catch (error: any) {
        if (error.name === 'AbortError') {
            return NextResponse.json({ error: 'Geocoding request timed out' }, { status: 504 });
        }
        console.warn('Geocoding proxy warning:', error.message);
        return NextResponse.json({ error: 'Failed to process geocoding request' }, { status: 500 });
    }
}
