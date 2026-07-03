import type { UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap';
import type { InfrastructureClusterMode } from '@/lib/gis/map-layer-config';

export interface SituationalMapMarker {
    id: string;
    position: { lat: number; lng: number };
    title: string;
    type:
        | 'user'
        | 'hazard'
        | 'earthquake'
        | 'weather'
        | 'admin'
        | 'incident'
        | 'condition'
        | 'infrastructure'
        | 'responder';
    isSafe?: boolean;
    mag?: number;
    description?: string;
    status?: string;
    alerts?: unknown[];
    radius?: number;
    timestamp?: string;
    color?: string;
    icon?: string;
    glyph?: string;
    category?: string;
    location?: string;
    riskReportHref?: string;
    incidentId?: string;
}

export interface MapDisasterZoneCircleSpec {
    id: string;
    center: { lat: number; lng: number };
    radiusMeters: number;
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWeight?: number;
    label: string;
    labelPosition: { lat: number; lng: number };
}

export interface MapStateBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

export interface CoverageCircleSpec {
    center: { lat: number; lng: number };
    radiusMeters: number;
    label?: string;
}

export interface RoadClosureDetail {
    roadName: string;
    status: string;
    reason?: string;
    startLocation?: string;
    endLocation?: string;
    updatedAt?: string;
    source?: string;
}

export interface PowerOutageDetail {
    name: string;
    county: string;
    state: string;
    metersAffected: number;
    reportedStartTime?: string;
    estimatedRestorationTime?: string;
    cause?: string | null;
    statusKind?: string | null;
    communityDescriptor?: string;
    source?: string;
}

export interface MapPolygonSpec {
    id: string;
    paths: { lat: number; lng: number }[][];
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWeight?: number;
    label?: string;
    outage?: PowerOutageDetail;
}

export interface MapPolylineSpec {
    id?: string;
    path: { lat: number; lng: number }[];
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
    label?: string;
    kind?: 'road_closure' | 'route';
    closure?: RoadClosureDetail;
}

export interface SituationalMapProps {
    address?: string;
    markers?: SituationalMapMarker[];
    center?: { lat: number; lng: number };
    zoom?: number;
    heatPoints?: { lat: number; lng: number; weight?: number }[];
    showHeatmap?: boolean;
    stateBounds?: MapStateBounds | null;
    coverageCircle?: CoverageCircleSpec | null;
    lockToCoverage?: boolean;
    polylines?: MapPolylineSpec[];
    polygons?: MapPolygonSpec[];
    disasterZoneCircles?: MapDisasterZoneCircleSpec[];
    heatIncidents?: UnifiedEventHeatPoint[];
    heatClickOnly?: boolean;
    onHeatIncidentSelect?: (incident: UnifiedEventHeatPoint) => void;
    onBoundsChanged?: (bounds: MapStateBounds) => void;
    clusterInfrastructure?: boolean;
    /** Use dam-friendly clustering (lower uncluster zoom, count badges). */
    infrastructureClusterMode?: InfrastructureClusterMode;
    fitStateOnLoad?: boolean;
    allowZoomOut?: boolean;
}

/** @deprecated use SituationalMapMarker */
export type MapMarker = SituationalMapMarker;
