import type { UnifiedEvent, AlertLevel } from '../types';
import type { InciWebIncident } from '@/lib/services/wildfire-service';

function extractContainment(desc: string): number {
    const match = desc.match(/(\d+)\s*%\s*contained/i);
    return match ? parseInt(match[1], 10) : 0;
}

function containmentToScore(pct: number): number {
    return Math.max(0, 100 - pct);
}

function scoreToAlertLevel(score: number): AlertLevel {
    if (score >= 80) return 'emergency';
    if (score >= 55) return 'warning';
    if (score >= 30) return 'watch';
    return 'normal';
}

export function normalizeInciWeb(incident: InciWebIncident): UnifiedEvent[] {
    if (!incident.lat || !incident.lon) return [];

    const containment = extractContainment(incident.description);
    const severityScore = containmentToScore(containment);
    const alertLevel = scoreToAlertLevel(severityScore);

    return [
        {
            event_id: crypto.randomUUID(),
            event_type: 'wildfire',
            source_api: 'InciWeb',
            alert_level: alertLevel,
            severity_score: severityScore,
            geo_coordinates: { lat: incident.lat, lon: incident.lon },
            confidence_level: 'high',
            title: `${alertLevel.toUpperCase()}: ${incident.title}`,
            description: `${incident.description.substring(0, 200)} | Containment: ${containment}%`,
            raw_data: incident,
            ingested_at: new Date().toISOString(),
            valid_at: incident.pubDate ? new Date(incident.pubDate).toISOString() : new Date().toISOString(),
        },
    ];
}
