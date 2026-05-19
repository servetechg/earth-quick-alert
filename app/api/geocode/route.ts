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

        // Photon geocoding - no API key required, more lenient usage policy
        const url = `https://photon.komoot.io/api?q=${encodeURIComponent(address)}&limit=1`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'EmergencyDashboard/1.0'
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

        if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            return NextResponse.json({
                lat: feature.geometry.coordinates[1],
                lng: feature.geometry.coordinates[0]
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
