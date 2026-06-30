'use client';

import { useQuery } from '@tanstack/react-query';
import { layerBoundsCacheKey } from '@/lib/gis/layers/map-layer-bounds-utils';
import type { FinancialSiteMapMarker } from '@/lib/gis/layers/financial-sites-types';
import type { HifldSiteMapMarker } from '@/lib/gis/hifld-next/types';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';
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
    const boundsKey = opts.bounds ? layerBoundsCacheKey(opts.bounds) : 'none';

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
        staleTime: 15 * 60_000,
        gcTime: 60 * 60_000,
        placeholderData: (prev) => prev,
    });
}

export type ShelterMapMarkerPayload = {
    id: string;
    shelterId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    county: string;
    address: string;
    city: string;
    zip: string;
    status: string;
    evacuationCapacity: number | null;
    postImpactCapacity: number | null;
    facilityUsage: string;
    wheelchairAccessible: string;
    organization: string;
    organizationPhone: string;
    location: string;
};

async function fetchShelterLayerMarkers(input: {
    stateKey?: string;
    bounds?: MapBoundsPayload | null;
}): Promise<ShelterMapMarkerPayload[]> {
    const params = new URLSearchParams();
    if (input.stateKey) params.set('state', input.stateKey);
    if (input.bounds) {
        params.set('west', String(input.bounds.west));
        params.set('south', String(input.bounds.south));
        params.set('east', String(input.bounds.east));
        params.set('north', String(input.bounds.north));
    }
    const res = await fetch(`/api/map/layers/shelters?${params.toString()}`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`map/layers/shelters ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.markers) ? data.markers : [];
}

export function useMapLayerShelters(opts: {
    enabled: boolean;
    stateKey?: string | null;
    bounds?: MapBoundsPayload | null;
}) {
    const stateKey = opts.stateKey?.trim().toUpperCase() ?? '';
    const boundsKey = opts.bounds ? layerBoundsCacheKey(opts.bounds) : 'none';

    return useQuery({
        queryKey: ['map-layer', 'shelters', stateKey || 'auto', boundsKey],
        queryFn: () =>
            fetchShelterLayerMarkers({
                stateKey: stateKey || undefined,
                bounds: stateKey ? null : opts.bounds ?? null,
            }),
        enabled:
            opts.enabled &&
            Boolean(stateKey || opts.bounds),
        staleTime: 15 * 60_000,
        gcTime: 60 * 60_000,
        placeholderData: (prev) => prev,
    });
}

export type FuelSiteMapMarkerPayload = {
    id: string;
    stationRecordId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    city: string;
    address: string;
    zip: string;
    fuelType: string;
    access: string;
    status: string;
    facilityType: string;
    phone: string;
    accessHours: string;
    location: string;
};

async function fetchFuelSiteLayerMarkers(input: {
    stateKey?: string;
    bounds?: MapBoundsPayload | null;
}): Promise<FuelSiteMapMarkerPayload[]> {
    const params = new URLSearchParams();
    if (input.stateKey) params.set('state', input.stateKey);
    if (input.bounds) {
        params.set('west', String(input.bounds.west));
        params.set('south', String(input.bounds.south));
        params.set('east', String(input.bounds.east));
        params.set('north', String(input.bounds.north));
    }
    const res = await fetch(`/api/map/layers/fuel-sites?${params.toString()}`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`map/layers/fuel-sites ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.markers) ? data.markers : [];
}

export function useMapLayerFuelSites(opts: {
    enabled: boolean;
    stateKey?: string | null;
    bounds?: MapBoundsPayload | null;
}) {
    const stateKey = opts.stateKey?.trim().toUpperCase() ?? '';
    const boundsKey = opts.bounds ? layerBoundsCacheKey(opts.bounds) : 'none';

    return useQuery({
        queryKey: ['map-layer', 'fuel-sites', stateKey || 'auto', boundsKey],
        queryFn: () =>
            fetchFuelSiteLayerMarkers({
                stateKey: stateKey || undefined,
                bounds: stateKey ? null : opts.bounds ?? null,
            }),
        enabled:
            opts.enabled &&
            Boolean(stateKey || opts.bounds),
        staleTime: 15 * 60_000,
        gcTime: 60 * 60_000,
        placeholderData: (prev) => prev,
    });
}

export type PharmacyMapMarkerPayload = {
    id: string;
    placeId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    address: string;
    location: string;
};

async function fetchPharmacyLayerMarkers(input: {
    stateKey?: string;
    bounds?: MapBoundsPayload | null;
}): Promise<PharmacyMapMarkerPayload[]> {
    const params = new URLSearchParams();
    if (input.stateKey) params.set('state', input.stateKey);
    if (input.bounds) {
        params.set('west', String(input.bounds.west));
        params.set('south', String(input.bounds.south));
        params.set('east', String(input.bounds.east));
        params.set('north', String(input.bounds.north));
    }
    const res = await fetch(`/api/map/layers/pharmacies?${params.toString()}`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`map/layers/pharmacies ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.markers) ? data.markers : [];
}

export function useMapLayerPharmacies(opts: {
    enabled: boolean;
    stateKey?: string | null;
    bounds?: MapBoundsPayload | null;
}) {
    const stateKey = opts.stateKey?.trim().toUpperCase() ?? '';
    const boundsKey = opts.bounds ? layerBoundsCacheKey(opts.bounds) : 'none';

    return useQuery({
        queryKey: ['map-layer', 'pharmacies', stateKey || 'auto', boundsKey],
        queryFn: () =>
            fetchPharmacyLayerMarkers({
                stateKey: stateKey || undefined,
                bounds: stateKey ? null : opts.bounds ?? null,
            }),
        enabled:
            opts.enabled &&
            Boolean(stateKey || opts.bounds),
        staleTime: 15 * 60_000,
        gcTime: 60 * 60_000,
        placeholderData: (prev) => prev,
    });
}

export type PoliceStationMapMarkerPayload = {
    id: string;
    placeId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    address: string;
    location: string;
};

async function fetchPoliceStationLayerMarkers(input: {
    stateKey?: string;
    bounds?: MapBoundsPayload | null;
}): Promise<PoliceStationMapMarkerPayload[]> {
    const params = new URLSearchParams();
    if (input.stateKey) params.set('state', input.stateKey);
    if (input.bounds) {
        params.set('west', String(input.bounds.west));
        params.set('south', String(input.bounds.south));
        params.set('east', String(input.bounds.east));
        params.set('north', String(input.bounds.north));
    }
    const res = await fetch(`/api/map/layers/police-stations?${params.toString()}`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`map/layers/police-stations ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.markers) ? data.markers : [];
}

export function useMapLayerPoliceStations(opts: {
    enabled: boolean;
    stateKey?: string | null;
    bounds?: MapBoundsPayload | null;
}) {
    const stateKey = opts.stateKey?.trim().toUpperCase() ?? '';
    const boundsKey = opts.bounds ? layerBoundsCacheKey(opts.bounds) : 'none';

    return useQuery({
        queryKey: ['map-layer', 'police-stations', stateKey || 'auto', boundsKey],
        queryFn: () =>
            fetchPoliceStationLayerMarkers({
                stateKey: stateKey || undefined,
                bounds: stateKey ? null : opts.bounds ?? null,
            }),
        enabled:
            opts.enabled &&
            Boolean(stateKey || opts.bounds),
        staleTime: 15 * 60_000,
        gcTime: 60 * 60_000,
        placeholderData: (prev) => prev,
    });
}

export type FinancialSiteMapMarkerPayload = FinancialSiteMapMarker;

async function fetchFinancialSiteLayerMarkers(input: {
    stateKey?: string;
    bounds?: MapBoundsPayload | null;
}): Promise<FinancialSiteMapMarkerPayload[]> {
    const params = new URLSearchParams();
    if (input.stateKey) params.set('state', input.stateKey);
    if (input.bounds) {
        params.set('west', String(input.bounds.west));
        params.set('south', String(input.bounds.south));
        params.set('east', String(input.bounds.east));
        params.set('north', String(input.bounds.north));
    }
    const res = await fetch(`/api/map/layers/financial-sites?${params.toString()}`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`map/layers/financial-sites ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.markers) ? data.markers : [];
}

export function useMapLayerFinancialSites(opts: {
    enabled: boolean;
    stateKey?: string | null;
    bounds?: MapBoundsPayload | null;
}) {
    const stateKey = opts.stateKey?.trim().toUpperCase() ?? '';
    const boundsKey = opts.bounds ? layerBoundsCacheKey(opts.bounds) : 'none';

    return useQuery({
        queryKey: ['map-layer', 'financial-sites', stateKey || 'auto', boundsKey],
        queryFn: () =>
            fetchFinancialSiteLayerMarkers({
                stateKey: stateKey || undefined,
                bounds: stateKey ? null : opts.bounds ?? null,
            }),
        enabled:
            opts.enabled &&
            Boolean(stateKey || opts.bounds),
        staleTime: 15 * 60_000,
        gcTime: 60 * 60_000,
        placeholderData: (prev) => prev,
    });
}

export type HifldSiteMapMarkerPayload = HifldSiteMapMarker;

async function fetchHifldSiteLayerMarkers(input: {
    sectors: CriticalInfraSectorId[];
    stateKey?: string;
    bounds?: MapBoundsPayload | null;
    datasetSlugs?: string[];
}): Promise<HifldSiteMapMarkerPayload[]> {
    const params = new URLSearchParams();
    if (input.sectors.length > 0) {
        params.set('sectors', input.sectors.join(','));
    }
    if (input.datasetSlugs?.length) {
        params.set('datasets', input.datasetSlugs.join(','));
    }
    if (input.stateKey) params.set('state', input.stateKey);
    if (input.bounds) {
        params.set('west', String(input.bounds.west));
        params.set('south', String(input.bounds.south));
        params.set('east', String(input.bounds.east));
        params.set('north', String(input.bounds.north));
    }
    const res = await fetch(`/api/map/layers/hifld-sites?${params.toString()}`, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`map/layers/hifld-sites ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.markers) ? data.markers : [];
}

export function useMapLayerHifldSites(opts: {
    enabled: boolean;
    sectors: CriticalInfraSectorId[];
    stateKey?: string | null;
    bounds?: MapBoundsPayload | null;
    datasetSlugs?: string[];
}) {
    const stateKey = opts.stateKey?.trim().toUpperCase() ?? '';
    const boundsKey = opts.bounds ? layerBoundsCacheKey(opts.bounds) : 'none';
    const sectorsKey = [...opts.sectors].sort().join(',');
    const datasetsKey = opts.datasetSlugs?.length ? [...opts.datasetSlugs].sort().join(',') : 'all';

    return useQuery({
        queryKey: ['map-layer', 'hifld-sites', sectorsKey, datasetsKey, stateKey || 'auto', boundsKey],
        queryFn: () =>
            fetchHifldSiteLayerMarkers({
                sectors: opts.sectors,
                stateKey: stateKey || undefined,
                bounds: stateKey ? null : opts.bounds ?? null,
                datasetSlugs: opts.datasetSlugs,
            }),
        enabled:
            opts.enabled &&
            opts.sectors.length > 0 &&
            Boolean(stateKey || opts.bounds),
        staleTime: 15 * 60_000,
        gcTime: 60 * 60_000,
        placeholderData: (prev) => prev,
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
    const scopeKey = opts.scopeState?.trim().toUpperCase() || 'none';

    return useQuery({
        queryKey: ['road-closures', boundsKey, scopeKey],
        queryFn: () =>
            fetchRoadClosures({
                bounds: opts.bounds ?? undefined,
                scopeState: opts.scopeState,
            }),
        enabled: opts.enabled && Boolean(opts.bounds || opts.scopeState?.trim()),
        staleTime: 10 * 60_000,
        gcTime: 60 * 60_000,
        refetchInterval: 10 * 60_000,
        placeholderData: (prev) => prev,
    });
}
