/** Shared hydration for `AlertCommunication` rows (same shape as `/api/alerts-communication`). */

export function parseLocations(raw: unknown): string[] {
    if (typeof raw !== 'string') return [];
    const s = raw.trim();
    if (!s) return [];

    if (s.includes(';')) {
        return s
            .split(';')
            .map((p) => p.trim())
            .filter(Boolean);
    }

    return [s];
}

export function summarizeLocations(locations: string[]): string {
    if (locations.length === 0) return '';
    if (locations.length === 1) return locations[0] ?? '';
    const preview = locations.slice(0, 3).join(', ');
    const remaining = locations.length - 3;
    return remaining > 0 ? `${preview} (+${remaining})` : preview;
}

export function hydrateAlertCommunicationRows(data: any[]): any[] {
    return data.map((row: any) => {
        const locations = parseLocations(row.location);
        const locationSummary = summarizeLocations(locations);
        return {
            ...row,
            locations,
            locationCount: locations.length,
            locationSummary: locationSummary || (typeof row.location === 'string' ? row.location : ''),
        };
    });
}
