import 'leaflet';

declare module 'leaflet' {
    interface HeatLayer extends Layer {
        setLatLngs(latlngs: [number, number, number][]): this;
    }

    function heatLayer(
        latlngs: [number, number, number][],
        options?: {
            minOpacity?: number;
            maxZoom?: number;
            radius?: number;
            blur?: number;
            gradient?: Record<number, string>;
        },
    ): HeatLayer;

    interface MarkerClusterGroupOptions {
        showCoverageOnHover?: boolean;
        maxClusterRadius?: number;
        disableClusteringAtZoom?: number;
        iconCreateFunction?: (cluster: MarkerCluster) => DivIcon;
    }

    interface MarkerCluster extends Layer {
        getAllChildMarkers(): Marker[];
    }

    function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;

    interface MarkerClusterGroup extends FeatureGroup {
        addLayer(layer: Layer): this;
    }
}

declare module 'leaflet.heat';
declare module 'leaflet.markercluster';
