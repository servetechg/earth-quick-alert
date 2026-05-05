import type { UnifiedEvent } from './types';
import type { USGSTimeSeries } from '@/lib/services/flood-service';
import type { FIRMSRecord, InciWebIncident } from '@/lib/services/wildfire-service';
import { normalizeUSGS } from './sources/normalize-usgs';
import { normalizeFIRMS } from './sources/normalize-firms';
import { normalizeInciWeb } from './sources/normalize-inciweb';

export interface RawSources {
    usgs?: USGSTimeSeries[];
    firms?: FIRMSRecord[];
    inciweb?: InciWebIncident[];
}

export function normalizeAll(sources: RawSources): UnifiedEvent[] {
    const events: UnifiedEvent[] = [];

    if (sources.usgs?.length) {
        events.push(...sources.usgs.flatMap(normalizeUSGS));
    }
    if (sources.firms?.length) {
        events.push(...sources.firms.flatMap(normalizeFIRMS));
    }
    if (sources.inciweb?.length) {
        events.push(...sources.inciweb.flatMap(normalizeInciWeb));
    }

    return events;
}
