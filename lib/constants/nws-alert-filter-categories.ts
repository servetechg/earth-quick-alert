import { NWS_WEATHER_ALERT_TYPES } from '@/lib/constants/nws-weather-alert-types';

/** Official NWS color chips used in Alerts & Communication filter legend. */
const ALERT_FILTER_COLORS: Record<string, string> = {
    'Tornado Warning': '#FF0000',
    'Tornado Watch': '#FFFF00',
    'Severe Thunderstorm Warning': '#FFA500',
    'Severe Thunderstorm Watch': '#DB7093',
    'Flash Flood Warning': '#8B0000',
    'Flash Flood Watch': '#2E8B57',
    'Flood Warning': '#00FF00',
    'Flood Watch': '#2E8B57',
    'Flood Advisory': '#00FA9A',
    'Special Marine Warning': '#FFA500',
    'Winter Storm Warning': '#FF69B4',
    'Winter Storm Watch': '#4682B4',
    'Winter Weather Advisory': '#7B68EE',
    'Blizzard Warning': '#FF4500',
    'Ice Storm Warning': '#8B008B',
    'Extreme Cold Warning': '#0000CD',
    'Freeze Watch': '#00FFFF',
    'High Wind Warning': '#DAA520',
    'High Wind Watch': '#B8860B',
    'Wind Advisory': '#D2B48C',
    'Lake Wind Advisory': '#D2B48C',
    'Gale Warning': '#DDA0DD',
    'Red Flag Warning': '#FF1493',
    'Fire Weather Watch': '#FFE4B5',
    'Excessive Heat Warning': '#C71585',
    'Heat Advisory': '#FF7F50',
    'Hurricane Warning': '#DC143C',
    'Hurricane Watch': '#FF6347',
    'Tropical Storm Warning': '#B22222',
    'Tropical Storm Watch': '#F08080',
    'Tsunami Warning': '#FD6347',
    'Coastal Flood Warning': '#228B22',
    'Coastal Flood Advisory': '#ADFF2F',
    'High Surf Advisory': '#BA55D3',
    'Small Craft Advisory': '#D8BFD8',
    'Brisk Wind Advisory': '#D8BFD8',
    'Hazardous Seas Warning': '#D8BFD8',
    'Rip Current Statement': '#40E0D0',
    'Dust Storm Warning': '#FFE4C4',
    'Air Quality Alert': '#696969',
    'Air Stagnation Advisory': '#808080',
    'Special Weather Statement': '#FFE4B5',
    'Marine Weather Statement': '#FFE4B5',
};

const FALLBACK_COLOR = '#64748B';

export type NwsAlertFilterCategory = {
    name: string;
    color: string;
    id: string;
};

/** Extra NWS chips common in the feed but not citizen-subscription toggles. */
const EXTRA_FILTER_CATEGORIES: NwsAlertFilterCategory[] = [
    { id: 'gale_warning', name: 'Gale Warning', color: '#DDA0DD' },
    { id: 'high_surf_advisory', name: 'High Surf Advisory', color: '#BA55D3' },
    { id: 'brisk_wind_advisory', name: 'Brisk Wind Advisory', color: '#D8BFD8' },
    { id: 'hazardous_seas_warning', name: 'Hazardous Seas Warning', color: '#D8BFD8' },
    { id: 'marine_weather_statement', name: 'Marine Weather Statement', color: '#FFE4B5' },
];

/** Full filterable NWS alert-type list for Alerts & Communication. */
export const ALL_NWS_ALERT_FILTER_CATEGORIES: NwsAlertFilterCategory[] = (() => {
    const byName = new Map<string, NwsAlertFilterCategory>();
    for (const t of NWS_WEATHER_ALERT_TYPES) {
        byName.set(t.name, {
            id: t.id,
            name: t.name,
            color: ALERT_FILTER_COLORS[t.name] ?? FALLBACK_COLOR,
        });
    }
    for (const cat of EXTRA_FILTER_CATEGORIES) {
        byName.set(cat.name, cat);
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
})();
