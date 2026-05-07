/**
 * Shared Google Maps configuration to prevent "Loader must not be called again with different options" error.
 */

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyBq2yjNcUbJoOOwyLa3HzO4xRPVGD9EQI4";

export const GOOGLE_MAPS_LIBRARIES: ("places" | "drawing" | "geometry" | "visualization")[] = ["places", "visualization"];

export const GOOGLE_MAPS_LOADER_ID = "google-map-script";
