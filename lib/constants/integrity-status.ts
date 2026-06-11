/** Client-safe integrity status helpers (mirrors server normalization). */
export function normalizeIntegrityStatusLabel(status: string | undefined): string {
    const u = String(status ?? '')
        .trim()
        .toLowerCase();
    if (u === 'compliant' || u === 'in sync') return 'Compliant';
    if (u === 'non-compliant' || u === 'non compliant' || u.includes('non-compliant')) return 'Non-Compliant';
    if (u === 'under review' || u === 'reviewing') return 'Under Review';
    if (u === 'deviation found') return 'Non-Compliant';
    return 'Under Review';
}

export function integrityPresentation(status: string | undefined, score: number | undefined) {
    const label = normalizeIntegrityStatusLabel(status);
    const pct = Math.min(100, Math.max(0, typeof score === 'number' && !Number.isNaN(score) ? score : 0));
    let labelColor = 'text-blue-500';
    let barColor = 'bg-blue-500';
    if (label === 'Compliant') {
        labelColor = 'text-emerald-500';
        barColor = 'bg-emerald-500';
    } else if (label === 'Non-Compliant') {
        labelColor = 'text-red-500';
        barColor = 'bg-red-500';
    }
    return { label, labelColor, barColor, pct };
}
