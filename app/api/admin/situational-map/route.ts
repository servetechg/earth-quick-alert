import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import License from '@/models/License';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import { fetchAlignedUnifiedEventFeed } from '@/lib/services/alert-communication-aligned-feed';
import { geocodeLocation } from '@/lib/services/location-matching';
import { severityToHeatWeight, type UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap';
import { getUsStateBbox } from '@/lib/constants/us-state-bounding-boxes';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config';
import { resolveMaxRadiusForState } from '@/lib/geo/license-coverage-radius';
import {
    fetchScopedCitizenMarkers,
    fetchScopedResponderMarkers,
} from '@/lib/services/situational-map-markers';

const MAX_GEOCODE_WITHOUT_COORDS = 12;

async function resolveHeatPoints(rows: Record<string, unknown>[]): Promise<UnifiedEventHeatPoint[]> {
    const points: UnifiedEventHeatPoint[] = [];
    let geocodeBudget = MAX_GEOCODE_WITHOUT_COORDS;

    for (const row of rows) {
        const id = String(row.id ?? row._id ?? '');
        let lat = typeof row.lat === 'number' ? row.lat : null;
        let lng = typeof row.lng === 'number' ? row.lng : null;

        if ((lat == null || lng == null) && geocodeBudget > 0) {
            const loc =
                typeof row.locationSummary === 'string'
                    ? row.locationSummary
                    : typeof row.location === 'string'
                      ? row.location
                      : '';
            if (loc.trim()) {
                const geo = await geocodeLocation(loc);
                if (geo) {
                    lat = geo.lat;
                    lng = geo.lon;
                    geocodeBudget -= 1;
                }
            }
        }

        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            continue;
        }

        points.push({
            id,
            lat,
            lng,
            weight: severityToHeatWeight(
                typeof row.severity === 'string' ? row.severity : undefined,
                typeof row.type === 'string' ? row.type : undefined
            ),
            severity: String(row.severity ?? 'Moderate'),
            name: String(row.name ?? 'Event'),
            category: typeof row.category === 'string' ? row.category : undefined,
            source: typeof row.source === 'string' ? row.source : undefined,
        });
    }

    return points;
}

function bboxCenter(stateRaw: string): { lat: number; lng: number } | null {
    const usps = normalizeStateToUsps(stateRaw);
    if (!usps) return null;
    const bbox = getUsStateBbox(usps);
    if (!bbox) return null;
    const [west, south, east, north] = bbox;
    return { lat: (south + north) / 2, lng: (west + east) / 2 };
}

export async function GET() {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        const userId = session.user.id as string;

        const rows = await fetchAlignedUnifiedEventFeed({ userId, role });
        const incidents = await resolveHeatPoints(rows as Record<string, unknown>[]);

        let citizens: Awaited<ReturnType<typeof fetchScopedCitizenMarkers>> = [];
        let responders: Awaited<ReturnType<typeof fetchScopedResponderMarkers>> = [];

        if (role === 'sub-admin') {
            [citizens, responders] = await Promise.all([
                fetchScopedCitizenMarkers(userId),
                fetchScopedResponderMarkers(userId),
            ]);
        }

        let coverage: {
            center: { lat: number; lng: number };
            radiusMile: number;
            radiusMeters: number;
            state?: string;
            stateCode?: string;
        } | null = null;

        if (role === 'sub-admin') {
            const user = await User.findById(userId).select('state country city licenseId').lean();
            const license = user?.licenseId
                ? await License.findById(user.licenseId)
                      .select('radiusMile billingAddress state country')
                      .lean()
                : null;

            const stateName = typeof user?.state === 'string' ? user.state.trim() : '';

            let center: { lat: number; lng: number } | null = null;
            const billingAddress =
                typeof license?.billingAddress === 'string' ? license.billingAddress.trim() : '';

            if (billingAddress) {
                const geo = await geocodeLocation(billingAddress);
                if (geo) center = { lat: geo.lat, lng: geo.lon };
            }

            if (!center && stateName) {
                const geo = await geocodeLocation(
                    [user?.city, stateName, user?.country || 'USA'].filter(Boolean).join(', ')
                );
                if (geo) center = { lat: geo.lat, lng: geo.lon };
            }

            if (!center && stateName) {
                center = bboxCenter(stateName);
            }

            const stateCode = normalizeStateToUsps(stateName) ?? undefined;
            const countryCode = 'US';

            let radiusMile =
                typeof license?.radiusMile === 'number' ? Math.max(5, license.radiusMile) : 5;

            if (stateCode && GOOGLE_MAPS_API_KEY) {
                const stateMax = await resolveMaxRadiusForState(
                    { stateCode, countryCode, stateName },
                    GOOGLE_MAPS_API_KEY
                );
                if (stateMax != null) {
                    radiusMile = Math.min(radiusMile, stateMax);
                }
            }

            if (center) {
                coverage = {
                    center,
                    radiusMile,
                    radiusMeters: radiusMile * 1609.34,
                    state: stateName || undefined,
                    stateCode,
                };
            }
        }

        return NextResponse.json({
            incidents,
            incidentCount: incidents.length,
            citizens,
            responders,
            coverage,
        });
    } catch (error) {
        console.error('situational-map error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
