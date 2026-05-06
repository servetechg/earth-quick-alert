// Weather API Service - OpenWeatherMap Integration

import { WeatherAlert as APIWeatherAlert, AlertSeverity as APIAlertSeverity, AlertSource } from '@/lib/types/api-alerts';
import { WeatherData, DayForecast, WeatherAlert } from '@/lib/types/emergency';

interface OpenWeatherAlert {
    sender_name: string;
    event: string;
    start: number;
    end: number;
    description: string;
    tags: string[];
}

interface OpenWeatherResponse {
    lat: number;
    lon: number;
    timezone: string;
    timezone_offset: number;
    current?: {
        dt: number;
        temp: number;
        feels_like: number;
        pressure: number;
        humidity: number;
        wind_speed: number;
        wind_deg: number;
        weather: Array<{
            id: number;
            main: string;
            description: string;
            icon: string;
        }>;
    };
    alerts?: OpenWeatherAlert[];
}

export class WeatherAPIService {
    private baseURL = 'https://api.open-meteo.com/v1/forecast';
    private nwsBaseURL = 'https://api.weather.gov';

    /**
     * Fetch full weather data (current + forecast)
     */
    async fetchFullWeatherData(lat: number, lon: number): Promise<WeatherData> {
        try {
            const url = `${this.baseURL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
            const data = await response.json();

            const current = data.current;
            const daily = data.daily;

            const weatherData: WeatherData = {
                location: 'Current Location', // This will be updated by the caller using reverse geocode
                current: {
                    temp: Math.round(current.temperature_2m),
                    feelsLike: Math.round(current.apparent_temperature),
                    condition: this.getWeatherTitleFromCode(current.weather_code),
                    humidity: current.relative_humidity_2m,
                    windSpeed: Math.round(current.wind_speed_10m),
                    visibility: Math.round(current.visibility / 1000), // Convert meters to km or miles
                    icon: this.getWeatherIcon(current.weather_code)
                },
                forecast: daily.time.map((time: string, i: number) => ({
                    date: new Date(time),
                    high: Math.round(daily.temperature_2m_max[i]),
                    low: Math.round(daily.temperature_2m_min[i]),
                    condition: this.getWeatherTitleFromCode(daily.weather_code[i]),
                    precipitation: daily.precipitation_probability_max[i],
                    icon: this.getWeatherIcon(daily.weather_code[i])
                })),
                alerts: this.synthesizeAlerts(current.weather_code, current.temperature_2m)
            };

            return weatherData;
        } catch (error) {
            console.error('Error fetching full weather data:', error);
            throw error;
        }
    }

    /**
     * Fetch weather alerts for a location.
     *
     * Primary source: National Weather Service (NWS) alerts feed.
     * Fallback: synthetic alert based on Open-Meteo current conditions.
     * @param lat - Latitude
     * @param lon - Longitude
     */
    async fetchWeatherAlerts(lat: number, lon: number): Promise<APIWeatherAlert[]> {
        try {
            const alerts = await this.fetchNWSAlerts(lat, lon);
            if (alerts.length > 0) {
                return alerts;
            }

            // If NWS returned no alerts, fall back to synthesized condition-based alert
            const fallback = await this.fetchSyntheticWeatherAlert(lat, lon);
            return fallback ? [fallback] : [];
        } catch (error) {
            console.error('Error fetching weather data:', error);
            // Fallback to mock if both NWS and synthetic fail
            return this.getMockWeatherAlerts(lat, lon);
        }
    }

    /**
     * Active NWS alerts only — no synthetic/mock fallback. Used for Alerts & Communication DB sync.
     */
    async fetchNWSActiveAlertsForPoint(lat: number, lon: number): Promise<APIWeatherAlert[]> {
        try {
            return await this.fetchNWSAlerts(lat, lon);
        } catch (error) {
            console.error('NWS active alerts fetch failed:', error);
            return [];
        }
    }

    /**
     * All **active** NWS alerts for the United States (paginated `GET /alerts/active`).
     * Use for nationwide dashboard sync; honors `NWS_ALERTS_MAX_PAGES` to cap pagination depth.
     */
    async fetchNWSActiveAlertsNationwide(): Promise<APIWeatherAlert[]> {
        try {
            return await this.fetchAllActiveNWSAlertsPaginated();
        } catch (error) {
            console.error('NWS nationwide active alerts fetch failed:', error);
            return [];
        }
    }

    /**
     * Raw GeoJSON features from nationwide paginated `GET /alerts/active?status=actual`.
     * Used by AI risk ingest for flood/hydro filtering (parity with Alerts & Communication NWS scope).
     */
    async fetchActiveNwsRawFeaturesNationwide(): Promise<unknown[]> {
        try {
            const maxPages = Math.min(
                500,
                Math.max(1, parseInt(process.env.NWS_ALERTS_MAX_PAGES ?? '100', 10))
            );
            let nextUrl: string | null = `${this.nwsBaseURL}/alerts/active?status=actual`;
            const features: unknown[] = [];
            let pages = 0;

            while (nextUrl && pages < maxPages) {
                pages += 1;
                const response = await fetch(nextUrl, {
                    method: 'GET',
                    headers: this.nwsRequestHeaders(),
                });
                if (!response.ok) {
                    throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                const chunk = Array.isArray(data.features) ? data.features : [];
                features.push(...chunk);
                const pagination = data.pagination as { next?: string } | undefined;
                const next = pagination?.next;
                nextUrl =
                    typeof next === 'string' && (next.startsWith('http://') || next.startsWith('https://'))
                        ? next
                        : null;
            }

            return features;
        } catch (error) {
            console.error('[weather-api] fetchActiveNwsRawFeaturesNationwide', error);
            return [];
        }
    }

    private nwsRequestHeaders(): HeadersInit {
        return {
            Accept: 'application/geo+json',
            'User-Agent': process.env.NWS_USER_AGENT || 'ready2go-emergency-dashboard (non-production)',
        };
    }

    /** Representative coordinates from GeoJSON geometry, or fallback (e.g. point-query lat/lon). */
    private coordsFromNwsFeature(
        feature: any,
        fallback?: { lat: number; lon: number }
    ): { lat: number; lon: number } {
        const US_CENTER = { lat: 39.8283, lon: -98.5795 };
        const g = feature?.geometry;
        if (!g?.type) {
            return fallback ?? US_CENTER;
        }
        if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
            const [lon, lat] = g.coordinates;
            if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
        }
        const avgRing = (ring: number[][]): { lat: number; lon: number } | null => {
            let sLat = 0;
            let sLon = 0;
            let n = 0;
            for (const pt of ring) {
                if (Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[1]) && Number.isFinite(pt[0])) {
                    sLon += pt[0];
                    sLat += pt[1];
                    n += 1;
                }
            }
            if (n === 0) return null;
            return { lat: sLat / n, lon: sLon / n };
        };
        if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) {
            const c = avgRing(g.coordinates[0]);
            if (c) return c;
        }
        if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates?.[0]?.[0])) {
            const c = avgRing(g.coordinates[0][0]);
            if (c) return c;
        }
        return fallback ?? US_CENTER;
    }

    private mapNwsGeoJsonFeature(
        feature: any,
        pointFallback?: { lat: number; lon: number }
    ): APIWeatherAlert {
        const props = feature.properties || {};
        const severity = this.mapNwsSeverity(props.severity);
        const event: string = props.event || 'Weather Alert';

        const descriptionParts: string[] = [];
        if (props.headline) descriptionParts.push(props.headline);
        if (props.description) descriptionParts.push(props.description);
        if (props.instruction) descriptionParts.push(`Instructions: ${props.instruction}`);

        const areaDesc: string = props.areaDesc || '';
        const geocode = props.geocode || {};
        const ugcZones: string[] = Array.isArray(geocode.UGC) ? geocode.UGC : [];

        const affectedAreas: string[] = [];
        if (areaDesc) {
            affectedAreas.push(...areaDesc.split(';').map((s: string) => s.trim()).filter(Boolean));
        }
        if (affectedAreas.length === 0 && ugcZones.length > 0) {
            affectedAreas.push(...ugcZones);
        }

        const { lat, lon } = this.coordsFromNwsFeature(feature, pointFallback);

        const instruction =
            typeof props.instruction === 'string' && props.instruction.trim()
                ? props.instruction.trim()
                : undefined;

        return {
            id: props.id || feature.id || `nws-${Date.now()}`,
            source: AlertSource.WEATHER_API,
            severity,
            title: props.headline || event,
            description: descriptionParts.join('\n\n') || 'Official weather alert from National Weather Service.',
            instruction,
            timestamp: props.sent || props.effective || new Date().toISOString(),
            expiresAt: props.expires || props.ends || undefined,
            event,
            areaDesc,
            zones: ugcZones,
            weatherType: this.mapNwsEventToWeatherType(event),
            temperature: undefined,
            windSpeed: undefined,
            humidity: undefined,
            precipitation: undefined,
            coordinates: { lat, lon },
            affectedAreas,
        };
    }

    /**
     * Paginated nationwide active alerts (`status=actual` omits test/exercise products).
     */
    private async fetchAllActiveNWSAlertsPaginated(): Promise<APIWeatherAlert[]> {
        const maxPages = Math.min(
            500,
            Math.max(1, parseInt(process.env.NWS_ALERTS_MAX_PAGES ?? '100', 10))
        );

        let nextUrl: string | null = `${this.nwsBaseURL}/alerts/active?status=actual`;
        const alerts: APIWeatherAlert[] = [];
        let pages = 0;

        while (nextUrl && pages < maxPages) {
            pages += 1;
            const response = await fetch(nextUrl, {
                method: 'GET',
                headers: this.nwsRequestHeaders(),
            });

            if (!response.ok) {
                throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const features = Array.isArray(data.features) ? data.features : [];
            for (const feature of features) {
                alerts.push(this.mapNwsGeoJsonFeature(feature));
            }

            const pagination = data.pagination as { next?: string } | undefined;
            const next = pagination?.next;
            nextUrl =
                typeof next === 'string' && (next.startsWith('http://') || next.startsWith('https://'))
                    ? next
                    : null;
        }

        return alerts;
    }

    /**
     * Fetch active alerts from National Weather Service for a specific point.
     */
    private async fetchNWSAlerts(lat: number, lon: number): Promise<APIWeatherAlert[]> {
        const point = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        const url = `${this.nwsBaseURL}/alerts/active?point=${encodeURIComponent(point)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: this.nwsRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const features = Array.isArray(data.features) ? data.features : [];

        return features.map((feature: any) => this.mapNwsGeoJsonFeature(feature, { lat, lon }));
    }

    /**
     * Fallback: synthesize a single status-style alert from Open-Meteo current conditions.
     */
    private async fetchSyntheticWeatherAlert(lat: number, lon: number): Promise<APIWeatherAlert | null> {
        const url = `${this.baseURL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const current = data.current;
        if (!current) return null;

        const weatherCode = current.weather_code;
        const temp = current.temperature_2m;

        const severity = this.calculateSeverityFromCode(weatherCode, temp);
        const weatherType = this.determineWeatherTypeFromCode(weatherCode);
        const description = this.generateDescriptionFromCode(weatherCode, temp, current.wind_speed_10m);

        const alert: APIWeatherAlert = {
            id: `weather-${Date.now()}-${lat}-${lon}`,
            source: AlertSource.WEATHER_API,
            severity: severity as any,
            title: this.getWeatherTitleFromCode(weatherCode),
            description,
            timestamp: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            weatherType,
            temperature: temp,
            windSpeed: current.wind_speed_10m,
            humidity: current.relative_humidity_2m,
            precipitation: current.precipitation,
            coordinates: { lat, lon },
            affectedAreas: ['Current Location'],
        };

        return alert;
    }

    /**
     * Fetch weather alerts for multiple locations
     */
    async fetchWeatherAlertsForLocations(
        locations: Array<{ lat: number; lon: number; name: string }>
    ): Promise<APIWeatherAlert[]> {
        try {
            const allAlerts: APIWeatherAlert[] = [];

            for (const location of locations) {
                const alerts = await this.fetchWeatherAlerts(location.lat, location.lon);
                allAlerts.push(...alerts);
            }

            return allAlerts;
        } catch (error) {
            console.error('Error fetching weather for multiple locations:', error);
            throw error;
        }
    }

    private getWeatherIcon(code: number): string {
        if (code === 0) return 'sun';
        if (code <= 3) return 'cloud';
        if (code <= 48) return 'cloud'; // Fog
        if (code <= 67) return 'cloud-rain';
        if (code <= 77) return 'cloud-snow';
        if (code <= 82) return 'cloud-rain';
        if (code <= 86) return 'cloud-snow';
        if (code >= 95) return 'cloud-lightning';
        return 'sun';
    }

    private synthesizeAlerts(code: number, temp: number): WeatherAlert[] {
        const alerts: WeatherAlert[] = [];
        if (code >= 95) {
            alerts.push({
                id: 'w-alert-1',
                type: 'Severe Thunderstorm',
                severity: 'severe',
                headline: 'Thunderstorm Warning',
                description: 'Severe thunderstorms detected in the area. Seek shelter.',
                start: new Date(),
                end: new Date(Date.now() + 2 * 60 * 60 * 1000)
            });
        } else if (temp > 35) {
            alerts.push({
                id: 'w-alert-heat',
                type: 'Excessive Heat',
                severity: 'moderate',
                headline: 'Heat Advisory',
                description: 'High temperatures expected. Stay hydrated.',
                start: new Date(),
                end: new Date(Date.now() + 8 * 60 * 60 * 1000)
            });
        }
        return alerts;
    }

    /**
     * WMO Weather interpretation codes (WW)
     * https://open-meteo.com/en/docs
     */
    private calculateSeverityFromCode(code: number, temp: number): APIAlertSeverity {
        if (code >= 95) return APIAlertSeverity.SEVERE; // Thunderstorms
        if (code >= 71) return APIAlertSeverity.HIGH;   // Snow
        if (code >= 51) return APIAlertSeverity.MODERATE; // Drizzle/Rain
        if (temp > 35 || temp < -10) return APIAlertSeverity.HIGH; // Extreme temps
        return APIAlertSeverity.INFO;
    }

    /**
     * Map NWS severity strings into internal alert severity enum.
     */
    private mapNwsSeverity(severity: string | undefined): APIAlertSeverity {
        const value = (severity || '').toLowerCase();
        switch (value) {
            case 'extreme':
                return APIAlertSeverity.EXTREME;
            case 'severe':
                return APIAlertSeverity.SEVERE;
            case 'moderate':
                return APIAlertSeverity.MODERATE;
            case 'minor':
            case 'minor flooding':
                return APIAlertSeverity.LOW;
            default:
                return APIAlertSeverity.INFO;
        }
    }

    /**
     * Roughly classify NWS event names into our weatherType categories.
     */
    private mapNwsEventToWeatherType(eventName: string): APIWeatherAlert['weatherType'] {
        const name = eventName.toLowerCase();
        if (name.includes('tornado')) return 'tornado';
        if (name.includes('hurricane')) return 'hurricane';
        if (name.includes('flood') || name.includes('flash flood')) return 'flood';
        if (name.includes('snow') || name.includes('blizzard') || name.includes('winter')) return 'snow';
        if (name.includes('heat') || name.includes('excessive heat')) return 'heat';
        if (name.includes('cold') || name.includes('freeze') || name.includes('wind chill')) return 'cold';
        if (name.includes('wind')) return 'wind';
        if (name.includes('storm') || name.includes('thunder')) return 'thunderstorm';
        if (name.includes('fog')) return 'fog';
        return 'other';
    }

    private determineWeatherTypeFromCode(code: number): APIWeatherAlert['weatherType'] {
        if (code >= 95) return 'thunderstorm';
        if (code >= 71) return 'snow';
        if (code >= 61) return 'rain';
        if (code >= 51) return 'rain'; // Drizzle
        if (code >= 45) return 'fog'; // Fog
        return 'other';
    }

    private getWeatherTitleFromCode(code: number): string {
        if (code === 0) return 'Sunny';
        if (code <= 3) return 'Partly Cloudy';
        if (code <= 48) return 'Foggy';
        if (code <= 55) return 'Drizzle';
        if (code <= 65) return 'Rainy';
        if (code <= 75) return 'Snowy';
        if (code <= 82) return 'Rain Showers';
        if (code <= 86) return 'Snow Showers';
        if (code >= 95) return 'Thunderstorm';
        return 'Fair';
    }

    private generateDescriptionFromCode(code: number, temp: number, wind: number): string {
        let desc = `Current temperature is ${temp}°C with wind speeds of ${wind} km/h. `;

        if (code >= 95) desc += 'Expect severe thunderstorms. Seek shelter if necessary.';
        else if (code >= 71) desc += 'Significant snowfall expected. Use caution on roads.';
        else if (code >= 61) desc += 'Heavy rain detected. Watch for local flooding.';
        else if (code >= 51) desc += 'Light rain/drizzle. Visibility may be reduced.';
        else if (code >= 45) desc += 'Foggy conditions. Drive safely.';
        else desc += 'Weather conditions are currently stable.';

        return desc;
    }

    /**
     * Get mock weather alerts for testing
     */
    private getMockWeatherAlerts(lat: number, lon: number): APIWeatherAlert[] {
        return [
            {
                id: `mock-weather-${Date.now()}`,
                source: AlertSource.WEATHER_API,
                severity: APIAlertSeverity.HIGH as any,
                title: 'Severe Thunderstorm Warning (Offline)',
                description: 'Service temporarily unavailable. Showing cached/mock data. Severe thunderstorms expected.',
                timestamp: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
                weatherType: 'thunderstorm',
                temperature: 28,
                windSpeed: 45,
                humidity: 85,
                precipitation: 25,
                coordinates: { lat, lon },
                affectedAreas: ['Local Area'],
            },
        ];
    }
}

// Export singleton instance
export const weatherAPI = new WeatherAPIService();
