/**
 * Google Maps / Places configuration (Autocomplete + license preview maps only).
 *
 * The admin GIS situational map uses OpenStreetMap + Leaflet — it does NOT load
 * the Google Maps JavaScript API. Keep NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set for:
 * - Address Autocomplete (Places) in license modals, signup, responder deployment
 * - Optional small GoogleMap previews inside those forms
 *
 * Restrict the API key in Google Cloud Console to Places API (+ Geocoding if used
 * server-side for licenses) and omit Maps JavaScript API if you want zero map tile billing.
 *
 * AI Risk critical infrastructure uses free HIFLD/ArcGIS layers — not Google Places.
 */

export const GOOGLE_MAPS_API_KEY =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    '';

export function isGoogleMapsConfigured(): boolean {
    return GOOGLE_MAPS_API_KEY.length > 0;
}

export const GOOGLE_MAPS_LIBRARIES: ("places" | "drawing" | "geometry")[] = ["places"];

export const GOOGLE_MAPS_LOADER_ID = 'google-places-autocomplete-script';
