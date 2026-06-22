import L from 'leaflet';
import type { SituationalMapMarker } from '@/lib/gis/situational-map-types';

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

export function buildLeafletMarkerIcon(marker: SituationalMapMarker): L.DivIcon | L.Icon {
    if (marker.icon === 'dam' || (marker.type === 'infrastructure' && marker.category === 'Dams')) {
        return L.icon({
            iconUrl: '/icons/dam-marker.svg',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18],
        });
    }

    if (marker.type === 'infrastructure' && marker.glyph) {
        const bg = marker.color || '#6366F1';
        const size = 34;
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

    if (marker.icon === 'pharmacy') {
        return L.icon({
            iconUrl: '/icons/pharmacy-marker.svg',
            iconSize: [32, 42],
            iconAnchor: [16, 42],
            popupAnchor: [0, -36],
        });
    }

    if (marker.icon === 'emergency' || marker.icon === 'hospital') {
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

/** Red dam cluster badge with count — matches dam-marker.svg. */
export function damClusterIcon(count: number): L.DivIcon {
    const label = count > 999 ? '999+' : String(count);
    const size = count > 99 ? 44 : 38;
    const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#E32C28;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;color:#fff;font-family:Arial,sans-serif;font-weight:800;font-size:${count > 99 ? 10 : 12}px;">${label}</div>`;
    return L.divIcon({
        className: 'situational-map-dam-cluster',
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

/** Pin for heatmap incident selection popup */
export function heatIncidentPinIcon(): L.DivIcon {
    return pinDivIcon('#EA4335', '#C5221F');
}
