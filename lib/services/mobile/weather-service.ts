import { weatherAPI } from '@/lib/services/weather-api';
import { geocodeLocation } from '@/lib/services/location-matching';
import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';
import UserProfile from '@/models/UserProfile';
import connectDB from '@/lib/mongodb';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type {
    MobileForecastDay,
    MobileWeatherPreference,
    MobileWeatherSnapshot,
} from '@/lib/types/mobile/weather';

const DEFAULT_WEATHER_PREFS: { id: string; label: string }[] = [
    { id: 'flood-watch', label: 'Flood Watch' },
    { id: 'flood-warning', label: 'Flood Warning' },
    { id: 'tornado-watch', label: 'Tornado Watch' },
    { id: 'tornado-warning', label: 'Tornado Warning' },
    { id: 'severe-thunderstorm', label: 'Severe Thunderstorm' },
    { id: 'winter-storm', label: 'Winter Storm' },
    { id: 'heat-advisory', label: 'Heat Advisory' },
    { id: 'air-quality', label: 'Air Quality' },
];

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
    const savedMap = new Map(saved.map((p) => [p.id, p.enabled]));
    return DEFAULT_WEATHER_PREFS.map((p) => ({
        id: p.id,
        label: p.label,
        enabled: savedMap.has(p.id) ? Boolean(savedMap.get(p.id)) : true,
    }));
}

export async function updateMobileWeatherPreferences(
    userId: string,
    preferences: { id: string; enabled: boolean }[],
): Promise<MobileWeatherPreference[]> {
    await connectDB();
    const allowed = new Set(DEFAULT_WEATHER_PREFS.map((p) => p.id));
    const normalized = preferences
        .filter((p) => allowed.has(p.id))
        .map((p) => ({ id: p.id, enabled: Boolean(p.enabled) }));

    await UserProfile.findOneAndUpdate(
        { userId },
        { $set: { weatherPreferences: normalized } },
        { upsert: false },
    );

    const labelMap = new Map(DEFAULT_WEATHER_PREFS.map((p) => [p.id, p.label]));
    return normalized.map((p) => ({
        id: p.id,
        label: labelMap.get(p.id) ?? p.id,
        enabled: p.enabled,
    }));
}
