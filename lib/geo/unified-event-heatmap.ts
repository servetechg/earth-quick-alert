/** Heatmap weight 0.1–1.0 from UnifiedEvent severity (aligned with Alerts & Communication). */
export function severityToHeatWeight(
    severity: string | null | undefined,
    alertType?: string | null
): number {
    const sev = String(severity ?? '')
        .trim()
        .toLowerCase();
    const type = String(alertType ?? '')
        .trim()
        .toLowerCase();

    let weight = 0.5;
    if (sev === 'extreme') weight = 1;
    else if (sev === 'high' || sev === 'severe') weight = 0.88;
    else if (sev === 'moderate' || sev === 'medium') weight = 0.68;
    else if (sev === 'low') weight = 0.42;

    if (type === 'warning') weight = Math.min(1, weight + 0.08);
    else if (type === 'watch') weight = Math.max(0.35, weight - 0.05);

    return Math.max(0.1, Math.min(1.2, weight));
}

export type UnifiedEventHeatPoint = {
    id: string;
    lat: number;
    lng: number;
    weight: number;
    severity: string;
    name: string;
    category?: string;
    source?: string;
    location?: string;
};
