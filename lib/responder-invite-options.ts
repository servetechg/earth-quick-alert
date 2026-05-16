import type { ResponderVertical } from '@/lib/responder-verticals';

export type ResponderInviteOption = {
    id: string;
    label: string;
    responderVertical: ResponderVertical;
    /** Stored on `User.responderFunction` for display and routing metadata. */
    responderFunction: string;
};

/**
 * Role/function choices when inviting external responders (sub-admin / super-admin).
 * Labels follow stakeholder copy; verticals align with `User.responderVertical` enum.
 */
export const RESPONDER_INVITE_OPTIONS: readonly ResponderInviteOption[] = [
    {
        id: 'dept-public-health',
        label: 'Department of Public Health',
        responderVertical: 'general-responder',
        responderFunction: 'Department of Public Health',
    },
    {
        id: 'hospitals',
        label: 'Hospitals',
        responderVertical: 'hospital',
        responderFunction: 'Hospitals',
    },
    {
        id: 'police-law-enforcement',
        label: 'Police / law enforcement',
        responderVertical: 'police',
        responderFunction: 'Police / law enforcement',
    },
    {
        id: 'pharmacies',
        label: 'Pharmacies',
        responderVertical: 'pharmacy',
        responderFunction: 'Pharmacies',
    },
    {
        id: 'pharmacy-medical-logistics',
        label: 'Pharmacy / Medical Logistics',
        responderVertical: 'medical-logistics',
        responderFunction: 'Pharmacy / Medical Logistics',
    },
    {
        id: 'state-em',
        label: 'State of Arkansas Emergency Management',
        responderVertical: 'general-responder',
        responderFunction: 'State of Arkansas Emergency Management',
    },
    {
        id: 'public-transportation',
        label: 'Public Transportation',
        responderVertical: 'transit',
        responderFunction: 'Public Transportation',
    },
    {
        id: 'energy-company',
        label: 'Energy Company',
        responderVertical: 'utility-energy',
        responderFunction: 'Energy Company',
    },
    {
        id: 'gas-company',
        label: 'Gas Company',
        responderVertical: 'utility-gas',
        responderFunction: 'Gas Company',
    },
    {
        id: 'electric-company',
        label: 'Electric Company',
        responderVertical: 'utility-electric',
        responderFunction: 'Electric Company',
    },
    {
        id: 'water-company',
        label: 'Water Company',
        responderVertical: 'utility-water',
        responderFunction: 'Water Company',
    },
    {
        id: 'food-supply-logistics',
        label: 'Food, supply logistics — private sector',
        responderVertical: 'food-logistics',
        responderFunction: 'Food, supply logistics — private sector',
    },
    {
        id: 'broadband-cell',
        label: 'Broadband / Cell Service',
        responderVertical: 'telecom',
        responderFunction: 'Broadband / Cell Service',
    },
    {
        id: 'national-guard',
        label: 'National Guard',
        responderVertical: 'national-guard',
        responderFunction: 'National Guard',
    },
    {
        id: 'public-officials',
        label: 'Public Officials',
        responderVertical: 'general-responder',
        responderFunction: 'Public Officials',
    },
    {
        id: 'federal-government',
        label: 'Federal Government',
        responderVertical: 'federal',
        responderFunction: 'Federal Government',
    },
    {
        id: 'state-government',
        label: 'State Government',
        responderVertical: 'state-government',
        responderFunction: 'State Government',
    },
    {
        id: 'nonprofits',
        label: 'Non-Profits',
        responderVertical: 'nonprofit',
        responderFunction: 'Non-Profits',
    },
] as const;

export function getResponderInviteOptionById(id: string): ResponderInviteOption | undefined {
    return RESPONDER_INVITE_OPTIONS.find((o) => o.id === id);
}
