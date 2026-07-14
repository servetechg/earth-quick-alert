import L from 'leaflet';
import type { LucideIcon } from 'lucide-react';
import type { SituationalMapMarker } from '@/lib/gis/situational-map-types';
import { lucideGlyphSvg, resolveGlyphIcon } from '@/lib/gis/marker-glyph-icons';

const PIN_W = 28;
const PIN_H = 42;

/** Classic map pin (teardrop) — matches Google-style pin markers. */
function pinSvg(fillColor: string, strokeColor?: string): string {
    const stroke = strokeColor ?? darkenHex(fillColor, 0.15);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 28 42" fill="none">
  <ellipse cx="14" cy="40" rx="5.5" ry="1.2" fill="#000" opacity="0.14"/>
  <path d="M14 2C8.48 2 4 6.48 4 12c0 6.5 10 26.5 10 26.5S24 18.5 24 12C24 6.48 19.52 2 14 2z" fill="${fillColor}" stroke="${stroke}" stroke-width="1"/>
  <circle cx="14" cy="12" r="5.5" fill="#ffffff" opacity="0.95"/>
</svg>`;
}

function darkenHex(hex: string, amount: number): string {
    const raw = hex.replace('#', '');
    if (raw.length !== 6) return hex;
    const r = Math.max(0, Math.round(parseInt(raw.slice(0, 2), 16) * (1 - amount)));
    const g = Math.max(0, Math.round(parseInt(raw.slice(2, 4), 16) * (1 - amount)));
    const b = Math.max(0, Math.round(parseInt(raw.slice(4, 6), 16) * (1 - amount)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function glyphSvg(bg: string, glyph: string, size: number): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${bg}" stroke="white" stroke-width="3"/>
<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="${Math.round(size * 0.48)}" font-family="Arial, sans-serif" font-weight="700">${glyph}</text>
</svg>`;
}

function pinDivIcon(fillColor: string, strokeColor?: string): L.DivIcon {
    return L.divIcon({
        className: 'situational-map-pin',
        html: pinSvg(fillColor, strokeColor),
        iconSize: [PIN_W, PIN_H],
        iconAnchor: [PIN_W / 2, PIN_H],
        popupAnchor: [0, -PIN_H + 4],
    });
}

const PIN_COLORS: Record<string, string> = {
    green: '#22c55e',
    red: '#ef4444',
    orange: '#f97316',
    blue: '#3b82f6',
    yellow: '#eab308',
    purple: '#a855f7',
    pink: '#ec4899',
    ltblue: '#38bdf8',
};

const GLYPH_MARKER_SIZE = 34;

/** Marker `icon` ids that represent a facility/category (glyph badge, not a pin). */
const FACILITY_ICON_IDS = new Set([
    'dam',
    'shelter',
    'fuel',
    'pharmacy',
    'police',
    'meals',
    'generator',
    'volunteers',
    'resource',
    'it',
    'chemical',
    'financial',
    'road_closure',
    'power_outage',
    'hospital',
    'fire',
]);

/** Colored circular badge with the category's dropdown lucide glyph (white). */
function glyphMarkerDivIcon(color: string, Icon: LucideIcon): L.DivIcon {
    const size = GLYPH_MARKER_SIZE;
    const glyph = lucideGlyphSvg(Icon, Math.round(size * 0.52));
    const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;">${glyph}</div>`;
    return L.divIcon({
        className: 'situational-map-glyph-marker',
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
    });
}

/** "Road closed" sign: red disc with a white horizontal bar (TomTom-style). */
export function roadClosedIconMarker(size = 26): L.DivIcon {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 26 26">
  <circle cx="13" cy="13" r="11.5" fill="#E11D1D" stroke="#ffffff" stroke-width="2"/>
  <rect x="6" y="11" width="14" height="4" rx="2" fill="#ffffff"/>
</svg>`;
    return L.divIcon({
        className: 'situational-map-road-closed',
        html: `<div style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));line-height:0;">${svg}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
    });
}

export function buildLeafletMarkerIcon(marker: SituationalMapMarker): L.DivIcon | L.Icon {
    if (marker.icon === 'road_closure') {
        return roadClosedIconMarker();
    }

    const glyphIcon = resolveGlyphIcon(marker.icon, marker.category);
    const isFacility =
        marker.type === 'infrastructure' ||
        (marker.icon != null && FACILITY_ICON_IDS.has(marker.icon));

    if (glyphIcon && isFacility) {
        return glyphMarkerDivIcon(marker.color || '#6366F1', glyphIcon);
    }

    // Fallback for CI sectors that only carry a single-letter glyph.
    if (marker.type === 'infrastructure' && marker.glyph) {
        const bg = marker.color || '#6366F1';
        const size = GLYPH_MARKER_SIZE;
        return L.divIcon({
            className: 'situational-map-glyph-icon',
            html: glyphSvg(bg, marker.glyph, size),
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
        });
    }

    if (marker.type === 'user') {
        return pinDivIcon(marker.isSafe ? PIN_COLORS.green : PIN_COLORS.red);
    }

    if (marker.type === 'responder') {
        return pinDivIcon(PIN_COLORS.orange, '#c2410c');
    }

    if (marker.type === 'admin') {
        return pinDivIcon(PIN_COLORS.blue, '#1d4ed8');
    }

    if (marker.type === 'incident' || marker.type === 'weather') {
        return pinDivIcon(PIN_COLORS.yellow, '#ca8a04');
    }

    if (marker.type === 'hazard' || marker.type === 'earthquake') {
        return pinDivIcon(PIN_COLORS.orange, '#c2410c');
    }

    if (marker.type === 'infrastructure') {
        return pinDivIcon(marker.color || PIN_COLORS.purple, '#4f46e5');
    }

    if (marker.type === 'condition') {
        return pinDivIcon(marker.color || PIN_COLORS.blue, '#1d4ed8');
    }

    if (marker.icon === 'emergency') {
        return L.icon({
            iconUrl: '/icons/emergency-service-marker.svg',
            iconSize: [32, 42],
            iconAnchor: [16, 42],
            popupAnchor: [0, -36],
        });
    }

    const iconKey = marker.icon ?? 'red';
    const color = PIN_COLORS[iconKey] ?? PIN_COLORS.red;
    return pinDivIcon(color);
}

/**
 * Category cluster badge: colored circle with the dropdown lucide glyph plus a
 * white count pill (so both the icon and the count stay readable when zoomed).
 */
function badgeClusterIcon(
    count: number,
    background: string,
    className: string,
    iconId: string,
): L.DivIcon {
    const label = count > 999 ? '999+' : String(count);
    const size = count > 99 ? 46 : 40;
    const Icon = resolveGlyphIcon(iconId);
    const glyph = Icon ? lucideGlyphSvg(Icon, Math.round(size * 0.44)) : '';
    const countBadge = `<span style="position:absolute;bottom:-4px;right:-4px;background:#fff;color:#0f172a;border-radius:9999px;font-family:Arial,sans-serif;font-weight:800;font-size:${count > 99 ? 9 : 10}px;line-height:1;padding:2px 5px;min-width:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.35);">${label}</span>`;
    const html = `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${background};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;">${glyph}${countBadge}</div>`;
    return L.divIcon({
        className,
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

/** Red road-closure cluster badge with count. */
export function roadClosureClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#DC2626', 'situational-map-road-closure-cluster', 'road_closure');
}

export function clusterIcon(): L.DivIcon {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <circle cx="120" cy="120" r="62" fill="#33375D" opacity="0.14"/>
  <circle cx="120" cy="120" r="44" fill="#33375D" opacity="0.24"/>
  <circle cx="120" cy="120" r="28" fill="#33375D" opacity="0.36"/>
</svg>`;
    return L.divIcon({
        className: 'situational-map-cluster',
        html: svg,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
    });
}

export function shelterClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#16A34A', 'situational-map-shelter-cluster', 'shelter');
}

export function fuelClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#D74C30', 'situational-map-fuel-cluster', 'fuel');
}

export function pharmacyClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#10B981', 'situational-map-pharmacy-cluster', 'pharmacy');
}

export function policeClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#1E3A8A', 'situational-map-police-cluster', 'police');
}

export function mealsClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#D74C30', 'situational-map-meals-cluster', 'meals');
}

export function generatorClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#E5A436', 'situational-map-generator-cluster', 'generator');
}

export function volunteerClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#5C7E2D', 'situational-map-volunteer-cluster', 'volunteers');
}

export function resourceClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#16A34A', 'situational-map-resource-cluster', 'resource');
}

export function itClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#8B5CF6', 'situational-map-it-cluster', 'it');
}

export function chemicalClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#7C3AED', 'situational-map-chemical-cluster', 'chemical');
}

export function financialClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#059669', 'situational-map-financial-cluster', 'financial');
}

export function damClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#E32C28', 'situational-map-dam-cluster', 'dam');
}

/** Amber cluster badge for HIFLD-backed critical infrastructure sectors. */
export function criticalInfraClusterIcon(count: number): L.DivIcon {
    return badgeClusterIcon(count, '#D97706', 'situational-map-critical-infra-cluster', 'critical_infra');
}

/** Pin for heatmap incident selection popup */
export function heatIncidentPinIcon(): L.DivIcon {
    return pinDivIcon('#EA4335', '#C5221F');
}
