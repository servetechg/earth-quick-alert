import connectDB from '@/lib/mongodb';
import MapLayerHifldSite from '@/models/MapLayerHifldSite';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';
import {
    fetchLiveHifldSupplementMarkers,
    resolveLiveHifldSupplements,
} from '@/lib/gis/layers/hifld-next-live-query';

export async function getHifldMongoCountsBySector(
    sectors: CriticalInfraSectorId[],
): Promise<Map<CriticalInfraSectorId, number>> {
    await connectDB();
    const counts = new Map<CriticalInfraSectorId, number>();

    await Promise.all(
        sectors.map(async (sectorId) => {
            const count = await MapLayerHifldSite.countDocuments({ sectorId });
            counts.set(sectorId, count);
        }),
    );

    return counts;
}

export async function hasIntermodalTransportationInMongo(): Promise<boolean> {
    await connectDB();
    const count = await MapLayerHifldSite.countDocuments({
        sectorId: 'ci_transportation',
        datasetSlug: 'intermodal-passenger-connectivity-database-ipcd',
    });
    return count > 0;
}

export async function loadHifldLiveSupplementMarkers(
    sectors: CriticalInfraSectorId[],
    opts?: { force?: boolean },
) {
    const mongoCounts = await getHifldMongoCountsBySector(sectors);
    const intermodalInMongo = sectors.includes('ci_transportation')
        ? await hasIntermodalTransportationInMongo()
        : true;

    const supplements = await resolveLiveHifldSupplements(
        sectors,
        mongoCounts,
        intermodalInMongo,
    );

    if (supplements.length === 0) {
        return { markers: [], mongoCounts, supplements: [] as typeof supplements };
    }

    const markers = await fetchLiveHifldSupplementMarkers(supplements, opts);
    return { markers, mongoCounts, supplements };
}
