import { NextResponse } from 'next/server';
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);

    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const type = searchParams.get('type') || 'hospital';
    const radius = searchParams.get('radius') || '2000';

    // Support legacy text-search mode (used by address autocomplete)
    const query = searchParams.get('q') || searchParams.get('address');
    if (query) {
        return handleTextSearch(query);
    }

    if (!lat || !lng) {
        return NextResponse.json({ error: 'Coordinates are required' }, { status: 400 });
    }

    try {
        // Construct Google Maps Nearby Search URL
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Google Places API returned status ${response.status}`);
            return NextResponse.json({ results: [] });
        }

        const data = await response.json();

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            console.warn(`Google Places API status: ${data.status}`, data.error_message);
            return NextResponse.json({ results: [] });
        }

        const results = (data.results || []).map((place: any) => {
            return {
                place_id: place.place_id,
                name: place.name,
                type: type, 
                geometry: {
                    location: place.geometry.location,
                },
                vicinity: place.vicinity || 'Address not available',
                rating: place.rating,
                user_ratings_total: place.user_ratings_total,
            };
        });

        return NextResponse.json({ results });
    } catch (error: any) {
        console.error('Places search error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function handleTextSearch(query: string) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&accept-language=en&q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'EmergencyDashboard/1.0 (info@servetechglobal.com)' },
            next: { revalidate: 60 },
        });

        if (!response.ok) throw new Error(`Nominatim API returned ${response.status}`);

        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            const results = data.map((item: any) => {
                const a = item.address || {};
                return {
                    place_id: `${item.lon}_${item.lat}`,
                    display_name: item.display_name,
                    lat: item.lat.toString(),
                    lon: item.lon.toString(),
                    address: {
                        name: a.name || a.amenity || a.building || a.road,
                        city: a.city || a.town || a.village || a.county,
                        state: a.state,
                        country: a.country,
                    },
                };
            });
            return NextResponse.json(results);
        }

        return NextResponse.json([]);
    } catch (error: any) {
        console.error('Places text search error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
