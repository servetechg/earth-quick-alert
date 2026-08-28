import { formatDistanceToNow } from 'date-fns';
import type { UnifiedEventInsert } from '@/lib/unified-event/types';
import { normalizeExternalId } from '@/lib/unified-event/legacy-source';

export interface UsgsEarthquakeFeature {
    id: string;
    properties: {
        mag: number | null;
        place: string;
        time: number;
        url: string;
        magType?: string;
        tsunami?: number;
        sig?: number;
        cdi?: number | null;
        mmi?: number | null;
        felt?: number | null;
        alert?: string | null;
        status?: string;
        nst?: number | null;
        gap?: number | null;
        dmin?: number | null;
        rms?: number | null;
        net?: string | null;
    };
    geometry?: {
        type: string;
        coordinates: [number, number, number];
    };
}

function formatIssued(epochMs: number): string {
    try {
        return formatDistanceToNow(new Date(epochMs), { addSuffix: true });
    } catch {
        return 'historically';
    }
}

function magnitudeSeverity(mag: number | null): UnifiedEventInsert['severity'] {
    if (mag == null || !Number.isFinite(mag)) return 'Moderate';
    if (mag >= 6) return 'Extreme';
    if (mag >= 4.5) return 'High';
    if (mag >= 3) return 'Moderate';
    return 'Low';
}

/** M3.0+ earthquakes are actionable for sub-admin dispatch; smaller events stay Monitor-only. */
function earthquakeUserStatus(
    mag: number | null,
    severity: UnifiedEventInsert['severity'],
): UnifiedEventInsert['status'] {
    if (severity === 'Low') return 'Monitor';
    if (mag != null && Number.isFinite(mag) && mag >= 3) return 'Take Action';
    if (severity === 'Moderate' || severity === 'High' || severity === 'Extreme') return 'Take Action';
    return 'Monitor';
}

export function buildUnifiedEventFromEarthquakeFeature(
    feature: UsgsEarthquakeFeature,
): UnifiedEventInsert | null {
    const id = feature.id;
    if (!id) return null;

    const p = feature.properties;
    const mag = p.mag;
    const coords = feature.geometry?.coordinates;
    const lng = coords?.[0] ?? null;
    const lat = coords?.[1] ?? null;
    const depth = coords?.[2] ?? null;
    const magType = p.magType ?? 'ml';
    const displayMag = mag != null && Number.isFinite(mag) ? `M${mag.toFixed(1)}` : 'M?';
    const externalId = normalizeExternalId('earthquake', id.startsWith('eq:') ? id : `eq:${id}`);

    const occurredAt = new Date(p.time).toISOString();
    const severity = magnitudeSeverity(mag);
    const status = earthquakeUserStatus(mag, severity);
    const instructions =
        status === 'Take Action'
            ? [
                  'Drop, cover, and hold on if shaking occurs.',
                  'After shaking stops, check for injuries and hazards.',
                  'Avoid damaged buildings until authorities clear the area.',
              ]
            : ['Stay informed.', 'Avoid unstable structures.'];

    return {
        externalId,
        source: 'earthquake',
        category: 'earthquake',
        name: `M ${mag != null && Number.isFinite(mag) ? mag.toFixed(1) : '?'} - ${(p.place ?? 'Unknown location').replace(/^\d+\s*km\s*[A-Z0-9]+\s+of\s+/i, '')}`,
        description: `USGS ${displayMag} — ${p.place ?? 'Unknown location'}`,
        severity,
        type: status === 'Take Action' ? 'Warning' : 'Statement',
        iconType: 'triangle',
        status,
        location: p.place ?? (lat != null && lng != null ? `${lat.toFixed(3)}, ${lng.toFixed(3)}` : 'Unknown'),
        lat,
        lng,
        geometry:
            coords && lat != null && lng != null
                ? { type: 'Point', coordinates: [lng, lat, depth ?? 0] }
                : null,
        issuedAt: formatIssued(p.time),
        expiresAt: 'See USGS event page',
        instructions,
        properties: {
            earthquake: {
                intensity:
                    mag != null
                        ? {
                              metric: 'magnitude',
                              value: mag,
                              unit: magType,
                              display: displayMag,
                          }
                        : null,
                magnitude: mag,
                magnitudeType: magType,
                depth,
                depthUnit: 'km',
                place: p.place ?? null,
                tsunami: p.tsunami ?? null,
                sig: p.sig ?? null,
                cdi: p.cdi ?? null,
                mmi: p.mmi ?? null,
                felt: p.felt ?? null,
                alert: p.alert ?? null,
                reviewStatus: p.status ?? null,
                nst: p.nst ?? null,
                gap: p.gap ?? null,
                dmin: p.dmin ?? null,
                rms: p.rms ?? null,
                net: p.net ?? null,
                usgsEventId: id,
                usgsEventUrl: p.url ?? null,
                occurredAt,
            },
        },
    };
}
