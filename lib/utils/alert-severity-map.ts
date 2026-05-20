/** Map alert `severity` strings to heat intensity and map colors (NWS-style). */

export function normalizeAlertSeverity(raw: unknown): string {
    const s = String(raw ?? 'Moderate').trim();
    if (!s) return 'Moderate';
    const lower = s.toLowerCase();
    if (lower === 'extreme') return 'Extreme';
    if (lower === 'severe') return 'Severe';
    if (lower === 'high') return 'High';
    if (lower === 'moderate') return 'Moderate';
    if (lower === 'low' || lower === 'info' || lower === 'minor') return 'Low';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Heatmap weight 0.35–1.0 — higher severity = hotter on the gradient. */
export function severityToHeatWeight(severity: unknown): number {
    switch (normalizeAlertSeverity(severity)) {
        case 'Extreme':
            return 1.0;
        case 'Severe':
            return 0.92;
        case 'High':
            return 0.78;
        case 'Moderate':
            return 0.58;
        case 'Low':
            return 0.4;
        default:
            return 0.55;
    }
}

/** Fill/stroke for severity circles on the map. */
export function severityToMapColor(severity: unknown): string {
    switch (normalizeAlertSeverity(severity)) {
        case 'Extreme':
            return '#B91C1C';
        case 'Severe':
            return '#DC2626';
        case 'High':
            return '#EA580C';
        case 'Moderate':
            return '#EAB308';
        case 'Low':
            return '#3B82F6';
        default:
            return '#64748B';
    }
}

/** Circle radius in meters for alert influence on map. */
export function severityToMapRadiusMeters(severity: unknown): number {
    switch (normalizeAlertSeverity(severity)) {
        case 'Extreme':
            return 42000;
        case 'Severe':
            return 34000;
        case 'High':
            return 26000;
        case 'Moderate':
            return 18000;
        case 'Low':
            return 12000;
        default:
            return 16000;
    }
}
