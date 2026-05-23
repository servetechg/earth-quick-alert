import type { UnifiedEventCategory } from '@/lib/unified-event/types';
import { UNIFIED_EVENT_CATEGORIES } from '@/lib/unified-event/types';
import {
    classifyNwsIncidentDistributionBucket,
    isFloodRelatedEvent,
} from '@/lib/services/risk-ingest-service';

/** Retired category — merged into `storm` for display and storage. */
const DEPRECATED_CATEGORY_ALIASES: Record<string, UnifiedEventCategory> = {
    hurricane_typhoon: 'storm',
};

export function normalizeUnifiedEventCategory(
    category: string | null | undefined,
): UnifiedEventCategory {
    const raw = String(category ?? '').trim().toLowerCase();
    if (DEPRECATED_CATEGORY_ALIASES[raw]) return DEPRECATED_CATEGORY_ALIASES[raw];
    if ((UNIFIED_EVENT_CATEGORIES as readonly string[]).includes(raw)) {
        return raw as UnifiedEventCategory;
    }
    return 'hazardous';
}

/** Mongo filter for category — includes retired `hurricane_typhoon` rows under `storm`. */
export function mongoUnifiedEventCategoryFilter(
    category: string | null | undefined,
): { category: string | { $in: string[] } } {
    const normalized = normalizeUnifiedEventCategory(category);
    if (normalized === 'storm') {
        return { category: { $in: ['storm', 'hurricane_typhoon'] } };
    }
    return { category: normalized };
}

export function inferCategoryFromLegacyRow(input: {
    source?: string;
    name?: string;
    description?: string;
    externalId?: string;
}): UnifiedEventCategory {
    const src = String(input.source ?? '').toLowerCase();
    const name = String(input.name ?? '');
    const desc = String(input.description ?? '');
    const ext = String(input.externalId ?? '').toLowerCase();

    if (src === 'noaa_ncei' || ext.startsWith('ncei:')) {
        const blob = `${name} ${desc}`.toLowerCase();
        if (/flood|flash flood|coastal/.test(blob)) return 'flood';
        if (/blizzard|winter|snow|ice/.test(blob)) return 'winter_weather';
        if (/tornado|thunderstorm|hail/.test(blob)) return 'storm';
        if (/marine/.test(blob)) return 'marine';
        if (/wildfire/.test(blob)) return 'wildfire';
        return 'hazardous';
    }

    if (src === 'earthquake' || ext.startsWith('eq:')) return 'earthquake';
    if (src === 'nasa_firms' || src === 'firms' || src === 'inciweb') return 'wildfire';
    if (src === 'usgs' || src === 'nwps' || src === 'noaa_nwis') return 'flood';

    if (src === 'fema') {
        const blob = `${name} ${desc}`.toLowerCase();
        if (/hurricane|typhoon|tropical/.test(blob)) return 'storm';
        if (/fire|wildfire/.test(blob)) return 'wildfire';
        if (/flood|storm|wind|landslide/.test(blob)) return 'fema_declaration';
        return 'fema_declaration';
    }

    if (src === 'nws') {
        if (isFloodRelatedEvent(name) || isFloodRelatedEvent(desc)) return 'flood';
        const bucket = classifyNwsIncidentDistributionBucket(name) ?? classifyNwsIncidentDistributionBucket(desc);
        if (bucket === 'tornado' || bucket === 'storm') return 'storm';
        if (bucket === 'marine') return 'marine';
        if (bucket === 'coastal_surf') return 'coastal_surf';
        if (/winter|blizzard|ice storm|snow/.test(name.toLowerCase())) return 'winter_weather';
        if (/air quality|smoke/.test(name.toLowerCase())) return 'air_quality';
        if (/heat|excessive heat/.test(name.toLowerCase())) return 'extreme_heat';
        if (/tsunami/.test(name.toLowerCase())) return 'tsunami';
        if (/hurricane|typhoon|tropical/.test(name.toLowerCase())) return 'storm';
        return 'hazardous';
    }

    return 'hazardous';
}

/** Map unified category to AI risk bar-chart bucket (legacy distribution). */
export function unifiedCategoryToDistroBucket(
    category: string,
): 'flood' | 'tornado' | 'storm' | 'hazardous' | 'coastal_surf' | 'marine' | 'wildfire' | 'earthquake' {
    switch (normalizeUnifiedEventCategory(category)) {
        case 'flood':
        case 'landslide':
            return 'flood';
        case 'earthquake':
        case 'tsunami':
        case 'volcanic':
            return 'earthquake';
        case 'wildfire':
            return 'wildfire';
        case 'storm':
            return 'storm';
        case 'marine':
            return 'marine';
        case 'coastal_surf':
            return 'coastal_surf';
        case 'winter_weather':
        case 'air_quality':
        case 'extreme_heat':
        case 'fema_declaration':
        case 'hazardous':
        default:
            return 'hazardous';
    }
}
