import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { unifiedEventToLegacyAlertCard } from '@/lib/unified-event/legacy-card';
import { hydrateAlertCommunicationRows } from '@/lib/utils/alert-communication-hydrate';
import {
    DEMO_SUPPORTING_EVENTS,
    LITTLE_ROCK_TORNADO_2023,
} from '@/lib/demo/data/little-rock-tornado-2023';
import { DEMO_SCENARIO_ID } from '@/lib/demo/constants';

const DEMO_NOW = '2026-06-02T12:00:00.000Z';

type DemoEventInput = {
    id: string;
    externalId: string;
    name: string;
    category: string;
    source: string;
    severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
    type: string;
    status: string;
    iconType: string;
    issuedAt: string;
    expiresAt: string;
    location: string;
    lat: number;
    lng: number;
    description: string;
    instructions: readonly string[];
    properties: Record<string, unknown>;
};

function toUnifiedEventDoc(row: DemoEventInput): UnifiedEventDoc {
    return {
        _id: row.id,
        externalId: row.externalId,
        source: row.source,
        category: row.category,
        name: row.name,
        description: row.description,
        severity: row.severity,
        type: row.type,
        status: row.status,
        location: row.location,
        lat: row.lat,
        lng: row.lng,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
        instructions: [...row.instructions],
        properties: row.properties,
        dataStatus: 'current',
        createdAt: DEMO_NOW,
        updatedAt: DEMO_NOW,
    };
}

function primaryTornadoDoc(): UnifiedEventDoc {
    const t = LITTLE_ROCK_TORNADO_2023;
    return toUnifiedEventDoc({
        id: t.id,
        externalId: t.externalId,
        name: t.name,
        category: t.category,
        source: t.source,
        severity: t.severity,
        type: t.type,
        status: t.status,
        iconType: t.iconType,
        issuedAt: t.issuedAt,
        expiresAt: t.expiresAt,
        location: t.location,
        lat: t.lat,
        lng: t.lng,
        description: t.description,
        instructions: t.instructions,
        properties: {
            ...t.properties,
            demo: {
                scenarioId: DEMO_SCENARIO_ID,
                pathCoordinates: t.pathCoordinates,
                geometry: {
                    type: 'LineString',
                    coordinates: t.pathCoordinates.map(([lat, lng]) => [lng, lat]),
                },
                rating: t.rating,
                impacts: t.impacts,
                meteorology: t.meteorology,
                affectedAreas: t.affectedAreas,
            },
        },
    });
}

function supportingDocs(): UnifiedEventDoc[] {
    return DEMO_SUPPORTING_EVENTS.map((row) =>
        toUnifiedEventDoc({
            id: row.id,
            externalId: row.externalId,
            name: row.name,
            category: row.category,
            source: row.source,
            severity: row.severity,
            type: row.type,
            status: row.status,
            iconType: row.iconType,
            issuedAt: row.issuedAt,
            expiresAt: row.expiresAt,
            location: row.location,
            lat: row.lat,
            lng: row.lng,
            description: row.description,
            instructions: row.instructions,
            properties: { ...row.properties, demo: { scenarioId: DEMO_SCENARIO_ID } },
        }),
    );
}

export function buildDemoUnifiedEventDocs(): UnifiedEventDoc[] {
    return [primaryTornadoDoc(), ...supportingDocs()];
}

export function buildDemoLegacyAlertCards(): Record<string, unknown>[] {
    const docs = buildDemoUnifiedEventDocs();
    const cards = docs.map((doc) =>
        unifiedEventToLegacyAlertCard(doc as unknown as Record<string, unknown>),
    );
    return hydrateAlertCommunicationRows(cards);
}

export function getDemoTornadoPathForMap(): {
    type: 'LineString';
    coordinates: [number, number][];
} {
    return {
        type: 'LineString',
        coordinates: LITTLE_ROCK_TORNADO_2023.pathCoordinates.map(([lat, lng]) => [lng, lat]),
    };
}
