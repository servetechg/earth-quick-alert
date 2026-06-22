'use client';

import { useQuery } from '@tanstack/react-query';
import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch';

export type MapBoundsPayload = {
    west: number;
    south: number;
    east: number;
    north: number;
};

async function fetchInfrastructurePlaces(input: {
    layers: string[];
    bounds: MapBoundsPayload;
    scopeState?: string;
}): Promise<InfrastructurePlaceResult[]> {
    const res = await fetch('/api/admin/infrastructure-places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`infrastructure-places ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
}

export function useInfrastructurePlaces(opts: {
    enabled: boolean;
    layers: string[];
    bounds: MapBoundsPayload | null;
    scopeState?: string;
}) {
    const layersKey = [...opts.layers].sort().join(',');
    const boundsKey = opts.bounds
        ? `${opts.bounds.west.toFixed(3)},${opts.bounds.south.toFixed(3)},${opts.bounds.east.toFixed(3)},${opts.bounds.north.toFixed(3)}`
        : 'none';

    return useQuery({
        queryKey: ['infrastructure-places', layersKey, boundsKey, opts.scopeState ?? ''],
        queryFn: () =>
            fetchInfrastructurePlaces({
                layers: opts.layers,
                bounds: opts.bounds!,
                scopeState: opts.scopeState,
            }),
        enabled: opts.enabled && opts.layers.length > 0 && Boolean(opts.bounds),
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
    });
}

export type SituationalMapData = {
    demo?: boolean;
    incidents?: unknown[];
    citizens?: unknown[];
    responders?: unknown[];
    leaders?: unknown[];
    coverage?: Record<string, unknown>;
    alignedEventCount?: number;
    incidentCount?: number;
    tornadoPath?: { coordinates?: unknown[] };
};

async function fetchSituationalMap(scopeState?: string): Promise<SituationalMapData> {
    const qs = scopeState?.trim() ? `?scopeState=${encodeURIComponent(scopeState.trim())}` : '';
    const res = await fetch(`/api/admin/situational-map${qs}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`situational-map ${res.status}`);
    return res.json();
}

export function useSituationalMap(opts: { enabled: boolean; scopeState?: string }) {
    return useQuery({
        queryKey: ['situational-map', opts.scopeState ?? ''],
        queryFn: () => fetchSituationalMap(opts.scopeState),
        enabled: opts.enabled,
        staleTime: 60_000,
        refetchInterval: 60_000,
    });
}

export type RoadClosurePayload = {
    id: string;
    status?: string;
    path?: Array<{ lat?: number; lng?: number }>;
    [key: string]: unknown;
};

export type DamMapMarkerPayload = {
    id: string;
    federalId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    county: string;
    hazardClass: string;
    condition: string;
    maxStorage: number | null;
    damHeight: number | null;
    location: string;
};

async function fetchDamLayerMarkers(input: {
    stateKey?: string;
    bounds?: MapBoundsPayload | null;
}): Promise<DamMapMarkerPayload[]> {
    const params = new URLSearchParams();
    if (input.stateKey) params.set('state', input.stateKey);
    if (input.bounds) {
        params.set('west', String(input.bounds.west));
        params.set('south', String(input.bounds.south));
        params.set('east', String(input.bounds.east));
        params.set('north', String(input.bounds.north));
    }
    const res = await fetch(`/api/map/layers/dams?${params.toString()}`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`map/layers/dams ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.markers) ? data.markers : [];
}

export function useMapLayerDams(opts: {
    enabled: boolean;
    stateKey?: string | null;
    bounds?: MapBoundsPayload | null;
}) {
    const stateKey = opts.stateKey?.trim().toUpperCase() ?? '';
    const boundsKey = opts.bounds
        ? `${opts.bounds.west.toFixed(3)},${opts.bounds.south.toFixed(3)},${opts.bounds.east.toFixed(3)},${opts.bounds.north.toFixed(3)}`
        : 'none';

    return useQuery({
        queryKey: ['map-layer', 'dams', stateKey || 'auto', boundsKey],
        queryFn: () =>
            fetchDamLayerMarkers({
                stateKey: stateKey || undefined,
                bounds: stateKey ? null : opts.bounds ?? null,
            }),
        enabled:
            opts.enabled &&
            Boolean(stateKey || opts.bounds),
        staleTime: 10 * 60_000,
        gcTime: 30 * 60_000,
    });
}

async function fetchRoadClosures(input: {
    bounds?: MapBoundsPayload;
    scopeState?: string;
}): Promise<RoadClosurePayload[]> {
    const res = await fetch('/api/admin/road-closures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`road-closures ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.closures) ? data.closures : [];
}

export function useRoadClosures(opts: {
    enabled: boolean;
    bounds: MapBoundsPayload | null;
    scopeState?: string;
}) {
    const boundsKey = opts.bounds
        ? `${opts.bounds.west.toFixed(3)},${opts.bounds.south.toFixed(3)},${opts.bounds.east.toFixed(3)},${opts.bounds.north.toFixed(3)}`
        : 'none';

    return useQuery({
        queryKey: ['road-closures', boundsKey, opts.scopeState ?? ''],
        queryFn: () =>
            fetchRoadClosures({
                bounds: opts.bounds ?? undefined,
                scopeState: opts.scopeState,
            }),
        enabled: opts.enabled,
        staleTime: 5 * 60_000,
        refetchInterval: 5 * 60_000,
    });
}
