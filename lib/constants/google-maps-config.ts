/**
 * Shared Google Maps configuration to prevent "Loader must not be called again with different options" error.
 *
 * Client map components require NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env
 * (GOOGLE_MAPS_API_KEY alone is server-only and is not sent to the browser).
 */

export const GOOGLE_MAPS_API_KEY =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    '';

export function isGoogleMapsConfigured(): boolean {
    return GOOGLE_MAPS_API_KEY.length > 0;
}

export const GOOGLE_MAPS_LIBRARIES: ("places" | "drawing" | "geometry")[] = ["places"];

export const GOOGLE_MAPS_LOADER_ID = "google-map-script";
