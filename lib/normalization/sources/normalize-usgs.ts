import type { UnifiedEvent, AlertLevel } from '../types';
import type { USGSTimeSeries } from '@/lib/services/flood-service';

const THRESHOLDS = {
    emergency: 15,
    warning: 10,
    watch: 7,
};

function getAlertLevel(gageHeight: number): AlertLevel {
    if (gageHeight >= THRESHOLDS.emergency) return 'emergency';
    if (gageHeight >= THRESHOLDS.warning) return 'warning';
    if (gageHeight >= THRESHOLDS.watch) return 'watch';
    return 'normal';
}

function scoreGageHeight(ft: number): number {
    if (ft >= 20) return 100;
    if (ft <= 0) return 0;
    return Math.min(100, Math.round((ft / 20) * 100));
}

export function normalizeUSGS(series: USGSTimeSeries): UnifiedEvent[] {
    const reading = series.values[0]?.value[0];
    if (!reading) return [];

    const gageHeight = parseFloat(reading.value);
    if (Number.isNaN(gageHeight)) return [];

    const alertLevel = getAlertLevel(gageHeight);
    const severityScore = scoreGageHeight(gageHeight);
    const qualifier = reading.qualifiers?.[0];

    return [
        {
            event_id: crypto.randomUUID(),
            event_type: 'flood',
            source_api: 'USGS',
            alert_level: alertLevel,
            severity_score: severityScore,
            geo_coordinates: {
                lat: series.sourceInfo.geoLocation.geogLocation.latitude,
                lon: series.sourceInfo.geoLocation.geogLocation.longitude,
            },
            confidence_level: qualifier === 'P' ? 'nominal' : 'high',
            title: `${alertLevel.toUpperCase()}: ${series.sourceInfo.siteName}`,
            description: `Gauge height: ${gageHeight.toFixed(2)} ft at ${series.sourceInfo.siteName}`,
            raw_data: series,
            ingested_at: new Date().toISOString(),
            valid_at: reading.dateTime,
        },
    ];
}
