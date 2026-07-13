// Earthquake API Service - USGS Earthquake API Integration

import { EarthquakeAlert, AlertSeverity, AlertSource } from '@/lib/types/api-alerts';
import { resolveUsgsEarthquakeSourceUrl } from '@/lib/services/mobile/alert-source-url';

interface USGSFeature {
    id: string;
    properties: {
        mag: number;
        place: string;
        time: number;
        updated: number;
        tz?: number;
        url: string;
        detail: string;
        felt?: number;
        cdi?: number;
        mmi?: number;
        alert?: string;
        status: string;
        tsunami: number;
        sig: number;
        net: string;
        code: string;
        ids: string;
        sources: string;
        types: string;
        nst?: number;
        dmin?: number;
        rms: number;
        gap?: number;
        magType: string;
        type: string;
        title: string;
    };
    geometry: {
        type: string;
        coordinates: [number, number, number]; // [longitude, latitude, depth]
    };
}

interface USGSResponse {
    type: string;
    metadata: {
        generated: number;
        url: string;
        title: string;
        status: number;
        api: string;
        count: number;
    };
    features: USGSFeature[];
}

export class EarthquakeAPIService {
    private baseURL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';
    private minMagnitude = 2.5; // Only show earthquakes >= 2.5 magnitude

    /**
     * Fetch recent earthquakes from USGS API
     * @param timeframe - 'hour', 'day', 'week', or 'month'
     * @param minMagnitude - Minimum magnitude to filter (default: 4.0)
     */
    async fetchEarthquakes(
        timeframe: 'hour' | 'day' | 'week' | 'month' = 'day',
        minMagnitude: number = this.minMagnitude
    ): Promise<EarthquakeAlert[]> {
        try {
            // Determine magnitude category based on minMagnitude
            let magCategory = 'all';
            if (minMagnitude >= 4.5) magCategory = '4.5';
            else if (minMagnitude >= 2.5) magCategory = '2.5';
            else if (minMagnitude >= 1.0) magCategory = '1.0';

            const url = `${this.baseURL}/${magCategory}_${timeframe}.geojson`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`USGS API error: ${response.status} ${response.statusText}`);
            }

            const data: USGSResponse = await response.json();

            // Transform USGS data to our EarthquakeAlert format
            const alerts: EarthquakeAlert[] = data.features
                .filter(feature => feature.properties.mag >= minMagnitude)
                .map(feature => this.transformToAlert(feature));

            return alerts;
        } catch (error) {
            console.error('Error fetching earthquake data:', error);
            throw error;
        }
    }

    /**
     * Fetch earthquakes by location
     * @param lat - Latitude
     * @param lon - Longitude
     * @param radiusKm - Radius in kilometers
     */
    async fetchEarthquakesByLocation(
        lat: number,
        lon: number,
        radiusKm: number = 1000
    ): Promise<EarthquakeAlert[]> {
        try {
            const earthquakes = await this.fetchEarthquakes('day');

            // Filter by distance from location
            return earthquakes.filter(eq => {
                const distance = this.calculateDistance(
                    lat,
                    lon,
                    eq.coordinates.lat,
                    eq.coordinates.lon
                );
                return distance <= radiusKm;
            });
        } catch (error) {
            console.error('Error fetching earthquakes by location:', error);
            throw error;
        }
    }

    /**
     * Transform USGS feature to EarthquakeAlert
     */
    private transformToAlert(feature: USGSFeature): EarthquakeAlert {
        const magnitude = feature.properties.mag;
        const severity = this.calculateSeverity(magnitude);
        const [lon, lat, depth] = feature.geometry.coordinates;

        return {
            id: feature.id,
            source: AlertSource.EARTHQUAKE_API,
            severity,
            title: feature.properties.title,
            description: this.generateDescription(feature),
            timestamp: new Date(feature.properties.time).toISOString(),
            magnitude,
            depth,
            location: feature.properties.place,
            coordinates: { lat, lon },
            tsunami: feature.properties.tsunami === 1,
            felt: feature.properties.felt,
            significance: feature.properties.sig,
            affectedAreas: [feature.properties.place],
            sourceUrl: resolveUsgsEarthquakeSourceUrl(feature.id, feature.properties.url),
        };
    }

    /**
     * Calculate severity based on magnitude
     */
    private calculateSeverity(magnitude: number): AlertSeverity {
        if (magnitude >= 8.0) return AlertSeverity.EXTREME;
        if (magnitude >= 7.0) return AlertSeverity.SEVERE;
        if (magnitude >= 6.0) return AlertSeverity.HIGH;
        if (magnitude >= 5.0) return AlertSeverity.MODERATE;
        if (magnitude >= 4.0) return AlertSeverity.LOW;
        return AlertSeverity.INFO;
    }

    /**
     * Generate human-readable description
     */
    private generateDescription(feature: USGSFeature): string {
        const mag = feature.properties.mag.toFixed(1);
        const depth = feature.geometry.coordinates[2].toFixed(1);
        const tsunami = feature.properties.tsunami === 1 ? ' ⚠️ TSUNAMI WARNING' : '';

        let description = `Magnitude ${mag} earthquake detected at ${feature.properties.place}. `;
        description += `Depth: ${depth} km. `;

        if (feature.properties.felt) {
            description += `Felt by ${feature.properties.felt} people. `;
        }

        description += tsunami;

        return description.trim();
    }

    /**
     * Calculate distance between two coordinates (Haversine formula)
     */
    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
            Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
}

// Export singleton instance
export const earthquakeAPI = new EarthquakeAPIService();
