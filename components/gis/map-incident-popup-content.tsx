'use client';

import { ArrowRight, MapPin } from 'lucide-react';
import type { UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap';

function formatSourceLabel(source?: string): string | null {
    if (!source?.trim()) return null;
    const key = source.trim().toLowerCase();
    const labels: Record<string, string> = {
        nws: 'NWS',
        nwps: 'NWPS',
        usgs: 'USGS',
        firms: 'FIRMS',
        earthquake: 'USGS Earthquake',
        fema: 'FEMA',
        inciweb: 'InciWeb',
        wfigs: 'WFIGS',
    };
    return labels[key] ?? source.toUpperCase();
}

function formatCategoryLabel(category?: string): string | null {
    if (!category?.trim()) return null;
    return category
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MapIncidentPopupContent({
    incident,
    onViewDetails,
    detailsLabel = 'View full details',
}: {
    incident: UnifiedEventHeatPoint;
    onViewDetails: () => void;
    detailsLabel?: string;
}) {
    const sourceLabel = formatSourceLabel(incident.source);
    const categoryLabel = formatCategoryLabel(incident.category);
    const meta = [categoryLabel, sourceLabel].filter(Boolean).join(' · ');

    return (
        <div className="overflow-hidden min-w-[260px] max-w-[300px] font-sans">
            <div className="px-4 py-3.5">
                <div className="mb-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">
                        Active incident
                    </p>
                    <h3 className="text-[15px] font-semibold text-slate-900 leading-snug tracking-tight">
                        {incident.name}
                    </h3>
                </div>

                {incident.location ? (
                    <p className="flex items-start gap-2 text-[12px] text-slate-600 leading-relaxed mb-2.5">
                        <MapPin
                            className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400"
                            strokeWidth={2}
                            aria-hidden
                        />
                        <span>{incident.location}</span>
                    </p>
                ) : null}

                {meta ? (
                    <p className="text-[11px] font-medium text-slate-400 mb-2 pl-[22px]">{meta}</p>
                ) : null}

                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails();
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#33375D] hover:text-[#2a2d4d] transition-colors"
                >
                    {detailsLabel}
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
                </button>
            </div>
        </div>
    );
}
