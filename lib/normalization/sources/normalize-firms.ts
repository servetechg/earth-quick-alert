import type { UnifiedEvent, AlertLevel, ConfidenceLevel } from '../types';
import type { FIRMSRecord } from '@/lib/services/wildfire-service';

function scoreBrightness(kelvin: number): number {
    const min = 300;
    const max = 500;
    return Math.min(100, Math.round(((kelvin - min) / (max - min)) * 100));
}

function brightnessToAlertLevel(score: number): AlertLevel {
    if (score >= 80) return 'emergency';
    if (score >= 55) return 'warning';
    if (score >= 30) return 'watch';
    return 'normal';
}

function mapConfidence(conf: string): ConfidenceLevel {
    const c = conf?.toLowerCase() ?? '';
    if (c === 'h' || c === 'high') return 'high';
    if (c === 'n' || c === 'nominal') return 'nominal';
    return 'low';
}

export function normalizeFIRMS(record: FIRMSRecord): UnifiedEvent[] {
    const brightness = parseFloat(record.brightness);
    if (Number.isNaN(brightness)) return [];

    const severityScore = scoreBrightness(brightness);
    const alertLevel = brightnessToAlertLevel(severityScore);

    const acq = (record.acq_time ?? '').padStart(4, '0');
    const timePart = acq.length >= 4 ? `${acq.slice(0, 2)}:${acq.slice(2, 4)}` : '00:00';

    return [
        {
            event_id: crypto.randomUUID(),
            event_type: 'wildfire',
            source_api: 'NASA_FIRMS',
            alert_level: alertLevel,
            severity_score: severityScore,
            geo_coordinates: {
                lat: parseFloat(record.latitude),
                lon: parseFloat(record.longitude),
            },
            confidence_level: mapConfidence(record.confidence ?? ''),
            title: `${alertLevel.toUpperCase()}: Active Fire Detected`,
            description: `Brightness: ${brightness}K | FRP: ${record.frp ?? ''} MW | Confidence: ${record.confidence ?? ''}`,
            raw_data: record,
            ingested_at: new Date().toISOString(),
            valid_at: `${record.acq_date}T${timePart}:00Z`,
        },
    ];
}
