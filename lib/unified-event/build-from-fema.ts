import { format, formatDistanceToNow } from 'date-fns';
import type {
    FemaWebDisasterSummary,
    OpenFemaDisasterRecord,
} from '@/lib/services/openfema-service';
import type { UnifiedEventInsert } from '@/lib/unified-event/types';
import { inferCategoryFromLegacyRow } from '@/lib/unified-event/category-infer';
import { normalizeExternalId } from '@/lib/unified-event/legacy-source';

function formatIssued(iso: string): string {
    try {
        return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
        return 'historically';
    }
}

function formatExpires(iso?: string): string {
    if (!iso) return 'See OpenFEMA';
    try {
        return format(new Date(iso), 'h:mm a');
    } catch {
        return 'See OpenFEMA';
    }
}

function formatFemaDeclarationTitle(raw: string): string {
    const s = raw.trim();
    if (!s) return 'Disaster declaration';
    if (s.length > 4 && s === s.toUpperCase()) {
        return s
            .toLowerCase()
            .split(/\s+/)
            .map((word) =>
                word
                    .split('-')
                    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
                    .join('-'),
            )
            .join(' ');
    }
    return s;
}

function totalFederalAidUsd(web?: FemaWebDisasterSummary): number | null {
    if (!web) return null;
    const parts = [
        web.totalAmountIhpApproved,
        web.totalAmountHaApproved,
        web.totalAmountOnaApproved,
        web.totalObligatedAmountPa,
        web.totalObligatedAmountHmgp,
    ].filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    if (parts.length === 0) return null;
    return parts.reduce((a, b) => a + b, 0);
}

export function buildUnifiedEventFromFemaRecord(
    r: OpenFemaDisasterRecord,
    web?: FemaWebDisasterSummary,
): UnifiedEventInsert {
    const ext = r.id
        ? `fema:${r.id}`
        : `fema:DR-${r.disasterNumber}-${(r.designatedArea ?? 'area').replace(/\s+/g, '-').slice(0, 80)}`;
    const externalId = normalizeExternalId('fema', ext);
    const loc =
        [r.designatedArea, r.state].filter(Boolean).join(', ') || r.state || 'United States';
    const titleRaw = r.declarationTitle || r.incidentType || 'Disaster declaration';
    const name = formatFemaDeclarationTitle(titleRaw);
    const decl = r.femaDeclarationString ?? `DR-${r.disasterNumber ?? '?'}`;
    const incident = (r.incidentType ?? '').toLowerCase();
    const aidTotal = totalFederalAidUsd(web);
    const aidLine =
        aidTotal != null && aidTotal > 0
            ? `Federal aid (IHP+HA+ONA+PA+HMGP): $${Math.round(aidTotal).toLocaleString('en-US')}`
            : null;

    const description = [
        `Declaration: ${decl}${r.state ? ` · ${r.state}` : ''}`,
        r.incidentType && `Type: ${r.incidentType}`,
        aidLine,
    ]
        .filter(Boolean)
        .join(' — ');

    const category = inferCategoryFromLegacyRow({
        source: 'fema',
        name,
        description,
        externalId,
    });

    const declarationType = r.declarationType ?? 'DR';
    const disasterNum = r.disasterNumber ?? null;

    const properties: Record<string, unknown> = {
        [category]: {
            intensity: disasterNum
                ? {
                      metric: 'disaster_declaration',
                      value: disasterNum,
                      unit: declarationType,
                      display: decl,
                  }
                : null,
            femaDeclarationString: r.femaDeclarationString ?? null,
            femaDisasterNumber: disasterNum,
            declarationType,
            declarationTitle: r.declarationTitle ?? null,
            incidentType: r.incidentType ?? null,
            declarationDate: r.declarationDate ?? null,
            incidentBeginDate: r.incidentBeginDate ?? null,
            incidentEndDate: r.incidentEndDate ?? null,
            designatedArea: r.designatedArea ?? null,
            iaProgram: r.iaProgramDeclared ?? null,
            paProgram: r.paProgramDeclared ?? null,
            hmProgram: r.hmProgramDeclared ?? null,
            ihProgram: r.ihProgramDeclared ?? null,
            totalNumberIaApproved: web?.totalNumberIaApproved ?? null,
            totalAmountIhpApproved: web?.totalAmountIhpApproved ?? null,
            totalAmountHaApproved: web?.totalAmountHaApproved ?? null,
            totalAmountOnaApproved: web?.totalAmountOnaApproved ?? null,
            totalObligatedAmountPa: web?.totalObligatedAmountPa ?? null,
            totalObligatedAmountHmgp: web?.totalObligatedAmountHmgp ?? null,
            totalFederalAidUsd: aidTotal,
        },
    };

    if (category === 'hurricane_typhoon') {
        (properties.hurricane_typhoon as Record<string, unknown>).stormName = name;
        (properties.hurricane_typhoon as Record<string, unknown>).femaDeclarationType = declarationType;
    }

    return {
        externalId,
        source: 'fema',
        category,
        name,
        description,
        severity: 'High',
        type: 'Declaration',
        iconType: /flood|hurricane|typhoon|rain|coastal|storm surge/.test(incident) ? 'cloud' : 'triangle',
        status: 'Monitor',
        location: loc,
        lat: null,
        lng: null,
        issuedAt: formatIssued(r.declarationDate ?? new Date().toISOString()),
        expiresAt: formatExpires(r.incidentEndDate),
        instructions: [],
        properties,
    };
}
