export type EventType = 'flood' | 'wildfire' | 'earthquake';

export type ConfidenceLevel = 'low' | 'nominal' | 'high';

export type AlertLevel = 'normal' | 'watch' | 'warning' | 'emergency';

export interface UnifiedEvent {
    event_id: string;
    event_type: EventType;
    source_api: string;
    alert_level: AlertLevel;
    severity_score: number;
    geo_coordinates: {
        lat: number;
        lon: number;
        bbox?: [number, number, number, number];
    };
    confidence_level: ConfidenceLevel;
    title: string;
    description: string;
    raw_data: unknown;
    ingested_at: string;
    valid_at: string;
}
