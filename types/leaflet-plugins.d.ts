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
        maxClusterRadius?: number | ((zoom: number) => number);
        disableClusteringAtZoom?: number;
        spiderfyOnMaxZoom?: boolean;
        spiderfyDistanceMultiplier?: number;
        chunkedLoading?: boolean;
        chunkInterval?: number;
        chunkDelay?: number;
        removeOutsideVisibleBounds?: boolean;
        animate?: boolean;
        animateAddingMarkers?: boolean;
        singleMarkerMode?: boolean;
        zoomToBoundsOnClick?: boolean;
        iconCreateFunction?: (cluster: MarkerCluster) => DivIcon;
        [key: string]: any;
    }

    interface MarkerCluster extends Layer {
        getAllChildMarkers(): Marker[];
        getChildCount(): number;
    }

    function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;

    interface MarkerClusterGroup extends FeatureGroup {
        addLayer(layer: Layer): this;
        removeLayer(layer: Layer): this;
        clearLayers(): this;
    }
}

declare module 'leaflet.heat';
declare module 'leaflet.markercluster';
