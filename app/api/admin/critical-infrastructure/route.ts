import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { resolveDemoSessionContext } from '@/lib/demo/provider';
import {
    DEMO_CRITICAL_INFRA_MARKERS,
    type CriticalInfraMapMarker,
} from '@/lib/demo/critical-infrastructure-markers';
import {
    CRITICAL_INFRASTRUCTURE_SECTORS,
    type CriticalInfraSectorId,
} from '@/lib/gis/critical-infrastructure-sectors';
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config';

/** Dashboard A (super-admin) and Dashboard B (sub-admin) — critical infrastructure layers. */
const CI_ALLOWED_ROLES = new Set(['super-admin', 'sub-admin', 'admin']);

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!CI_ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const url = new URL(req.url);
        const sectorsParam = url.searchParams.get('sectors')?.trim() || '';
        const lat = Number(url.searchParams.get('lat'));
        const lng = Number(url.searchParams.get('lng'));
        const radius = Number(url.searchParams.get('radius')) || 25000;

        const requestedSectors = sectorsParam
            ? (sectorsParam.split(',').filter(Boolean) as CriticalInfraSectorId[])
            : CRITICAL_INFRASTRUCTURE_SECTORS.map((s) => s.id);

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );

        if (demoCtx) {
            const markers = DEMO_CRITICAL_INFRA_MARKERS.filter((m) =>
                requestedSectors.includes(m.sectorId),
            );
            return NextResponse.json({ markers, demo: true });
        }

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return NextResponse.json(
                { error: 'lat and lng required for live critical infrastructure search' },
                { status: 400 },
            );
        }

        const markers: CriticalInfraMapMarker[] = [];
        const seen = new Set<string>();

        for (const sector of CRITICAL_INFRASTRUCTURE_SECTORS) {
            if (!requestedSectors.includes(sector.id)) continue;

            const placeTypes = sector.googlePlaceTypes?.length
                ? sector.googlePlaceTypes
                : sector.googlePlaceType
                  ? [sector.googlePlaceType]
                  : [];

            for (const type of placeTypes) {
                try {
                    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${GOOGLE_MAPS_API_KEY}`;
                    const res = await fetch(placesUrl);
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') continue;

                    for (const place of data.results ?? []) {
                        const pid = place.place_id as string;
                        if (!pid || seen.has(pid)) continue;
                        seen.add(pid);
                        markers.push({
                            id: pid,
                            sectorId: sector.id,
                            lat: place.geometry.location.lat,
                            lng: place.geometry.location.lng,
                            title: place.name,
                            status: 'unknown',
                            location: place.vicinity || 'Unknown',
                            description: `${sector.label} · Google Places`,
                            riskLevel: 'MODERATE',
                        });
                    }
                } catch {
                    /* skip failed type */
                }
            }
        }

        return NextResponse.json({ markers, demo: false });
    } catch (error) {
        console.error('critical-infrastructure error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
