import { Flame, PlusSquare, type LucideIcon } from 'lucide-react';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';

/** Situational map layers backed by HIFLD Next Mongo ingest (not Google Places). */
export interface HifldOperationalLayerDef {
    id: string;
    label: string;
    Icon: LucideIcon;
    color: string;
    markerIcon: string;
    sectorId: CriticalInfraSectorId;
    datasetSlugs: string[];
}

export const HIFLD_OPERATIONAL_MAP_LAYERS: HifldOperationalLayerDef[] = [
    {
        id: 'hospitals',
        label: 'Hospitals',
        Icon: PlusSquare,
        color: '#22A9A1',
        markerIcon: 'hospital',
        sectorId: 'ci_healthcare',
        datasetSlugs: ['hospitals-3'],
    },
    {
        id: 'fire_station',
        label: 'Emergency Service Providers / Fire Stations',
        Icon: Flame,
        color: '#EF4444',
        markerIcon: 'fire',
        sectorId: 'ci_emergency_services',
        datasetSlugs: ['fire-and-emergency-medical-service-ems-stations'],
    },
];

const layerById = new Map(HIFLD_OPERATIONAL_MAP_LAYERS.map((l) => [l.id, l]));

export function hifldOperationalLayerById(id: string): HifldOperationalLayerDef | undefined {
    return layerById.get(id);
}

export function enabledHifldOperationalLayers(
    mapLayers: Record<string, boolean>,
): HifldOperationalLayerDef[] {
    return HIFLD_OPERATIONAL_MAP_LAYERS.filter((layer) => mapLayers[layer.id]);
}

export function hifldSectorsForOperationalLayers(
    mapLayers: Record<string, boolean>,
): CriticalInfraSectorId[] {
    const sectors = new Set<CriticalInfraSectorId>();
    for (const layer of enabledHifldOperationalLayers(mapLayers)) {
        sectors.add(layer.sectorId);
    }
    return [...sectors];
}
