/**
 * Single source of truth for responder operational verticals (`User.responderVertical`).
 * Keep in sync with Mongoose enum in `models/User.ts`.
 */
export const RESPONDER_VERTICALS = [
    'general-responder',
    'hospital',
    /** @deprecated Prefer `hospital`; kept for older records / CSV imports */
    'healthcare-hospital',
    'police',
    'hotel',
    'pharmacy',
    'medical-logistics',
    'transit',
    'utility-electric',
    'utility-gas',
    'utility-water',
    'utility-energy',
    'food-logistics',
    'telecom',
    'national-guard',
    'federal',
    'nonprofit',
] as const;

export type ResponderVertical = (typeof RESPONDER_VERTICALS)[number];

export const RESPONDER_VERTICAL_LABELS: Record<ResponderVertical, string> = {
    'general-responder': 'General responder',
    hospital: 'Hospital / public health',
    'healthcare-hospital': 'Hospital (legacy key)',
    police: 'Police / law enforcement',
    hotel: 'Hotel / shelter / lodging',
    pharmacy: 'Pharmacy',
    'medical-logistics': 'Medical logistics',
    transit: 'Public transportation',
    'utility-electric': 'Electric utility',
    'utility-gas': 'Gas utility',
    'utility-water': 'Water utility',
    'utility-energy': 'Energy utility',
    'food-logistics': 'Food & supply logistics',
    telecom: 'Broadband / cellular',
    'national-guard': 'National Guard',
    federal: 'Federal staging',
    nonprofit: 'Nonprofit / VOAD',
};

export function isResponderVertical(v: string): v is ResponderVertical {
    return (RESPONDER_VERTICALS as readonly string[]).includes(v);
}

/** Maps stored vertical → dashboard experience (mock + API namespace). */
export type ResponderDashboardKind = 'hospital' | 'police' | 'hotel' | 'general';

export function getResponderDashboardKind(vertical: string): ResponderDashboardKind {
    const v = vertical || '';
    if (v === 'hospital' || v === 'healthcare-hospital') return 'hospital';
    if (v === 'police' || v === 'national-guard' || v === 'federal') return 'police';
    if (v === 'hotel') return 'hotel';
    return 'general';
}
