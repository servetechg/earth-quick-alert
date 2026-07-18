import { weatherAPI } from '@/lib/services/weather-api';
import { geocodeLocation } from '@/lib/services/location-matching';
import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';
import { NWS_WEATHER_ALERT_TYPES } from '@/lib/constants/nws-weather-alert-types';
import UserProfile from '@/models/UserProfile';
import connectDB from '@/lib/mongodb';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type {
    MobileForecastDay,
    MobileWeatherPreference,
    MobileWeatherSnapshot,
} from '@/lib/types/mobile/weather';

/** Legacy kebab-case ids from the first mobile stub list → current snake_case catalog ids. */
const LEGACY_PREF_ID_MAP: Record<string, string> = {
    'flood-watch': 'flood_watch',
    'flood-warning': 'flood_warning',
    'tornado-watch': 'tornado_watch',
    'tornado-warning': 'tornado_warning',
    'severe-thunderstorm': 'severe_thunderstorm_warning',
    'winter-storm': 'winter_storm_warning',
    'winter-weather': 'winter_weather_advisory',
    'wind-advisory': 'wind_advisory',
    'heat-advisory': 'heat_advisory',
    'air-quality': 'air_quality_alert',
};

function normalizePrefId(id: string): string {
    const trimmed = id.trim();
    return LEGACY_PREF_ID_MAP[trimmed] ?? trimmed;
}

function locationLabelFromProfile(profile: UserProfilePayload | null): string {
    const addr = profile?.address;
    if (!addr) return 'Your location';
    const zip = addr.zipCode ? ` ${addr.zipCode}` : '';
    return `${addr.city}, ${addr.state}${zip}`.trim();
}

async function geocodePrimary(profile: UserProfilePayload | null) {
    const loc = formatProfileAddress(profile?.address);
    if (!loc) return null;
    return geocodeLocation(loc);
}

export async function getMobileWeatherCurrent(userId: string): Promise<MobileWeatherSnapshot | null> {
    const profile = (await loadUserProfile(userId)) as UserProfilePayload | null;
    const geo = await geocodePrimary(profile);
    if (!geo) return null;

    try {
        const data = await weatherAPI.fetchFullWeatherData(geo.lat, geo.lon);
        const c = data.current;
        const today = data.forecast[0];
        return {
            temperatureF: Math.round(c.temp),
            condition: c.condition,
            highF: today ? Math.round(today.high) : Math.round(c.temp),
            lowF: today ? Math.round(today.low) : Math.round(c.temp),
            humidity: Math.round(c.humidity ?? 0),
            windMph: Math.round(c.windSpeed ?? 0),
            locationLabel: locationLabelFromProfile(profile),
        };
    } catch (e) {
        console.error('getMobileWeatherCurrent:', e);
        return null;
    }
}

export async function getMobileWeatherForecast(
    userId: string,
    days = 7,
): Promise<{ days: MobileForecastDay[] } | null> {
    const profile = (await loadUserProfile(userId)) as UserProfilePayload | null;
    const geo = await geocodePrimary(profile);
    if (!geo) return null;

    try {
        const data = await weatherAPI.fetchFullWeatherData(geo.lat, geo.lon);
        const slice = data.forecast.slice(0, Math.min(days, 7));
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return {
            days: slice.map((d) => {
                const date = d.date instanceof Date ? d.date : new Date(d.date);
                return {
                    date: date.toISOString().slice(0, 10),
                    label: dayNames[date.getUTCDay()] ?? 'Day',
                    condition: d.condition,
                    highF: Math.round(d.high),
                    lowF: Math.round(d.low),
                };
            }),
        };
    } catch (e) {
        console.error('getMobileWeatherForecast:', e);
        return null;
    }
}

export async function getMobileWeatherPreferences(
    userId: string,
): Promise<MobileWeatherPreference[]> {
    await connectDB();
    const doc = await UserProfile.findOne({ userId }).select('weatherPreferences').lean();
    const saved = doc?.weatherPreferences ?? [];
    const savedMap = new Map<string, boolean>();
    for (const p of saved) {
        savedMap.set(normalizePrefId(p.id), Boolean(p.enabled));
    }

    return NWS_WEATHER_ALERT_TYPES.map((p) => ({
        id: p.id,
        label: p.name,
        description: p.description,
        category: p.category,
        severity: p.severity,
        enabled: savedMap.has(p.id) ? Boolean(savedMap.get(p.id)) : true,
    }));
}

export async function updateMobileWeatherPreferences(
    userId: string,
    preferences: { id: string; enabled: boolean }[],
): Promise<MobileWeatherPreference[]> {
    await connectDB();
    const allowed = new Set(NWS_WEATHER_ALERT_TYPES.map((p) => p.id));
    const byId = new Map<string, boolean>();
    for (const p of preferences) {
        const id = normalizePrefId(p.id);
        if (!allowed.has(id)) continue;
        byId.set(id, Boolean(p.enabled));
    }

    // Persist full catalog so new types stay present with previous/default enabled state.
    const existing = await getMobileWeatherPreferences(userId);
    const normalized = existing.map((p) => ({
        id: p.id,
        enabled: byId.has(p.id) ? Boolean(byId.get(p.id)) : p.enabled,
    }));

    await UserProfile.findOneAndUpdate(
        { userId },
        { $set: { weatherPreferences: normalized } },
        { upsert: false },
    );

    return getMobileWeatherPreferences(userId);
}
