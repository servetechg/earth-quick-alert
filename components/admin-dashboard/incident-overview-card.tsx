'use client'

import * as React from 'react'
import { Tornado } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface IncidentOverviewCardProps {
  className?: string
  title?: string
  eventType?: string
  description?: string
  date?: string
  status?: 'Active' | 'Resolved' | 'Monitoring'
  /** When true, show a compact loading state instead of placeholder copy. */
  loading?: boolean
}

/** Neutral copy when live ingest has not loaded yet (avoid stale demo geographies). */
const PLACEHOLDER_DATA: Required<Omit<IncidentOverviewCardProps, 'className'>> = {
  title: 'Incident Overview',
  eventType: 'Live situational picture',
  description:
    'This card reflects the same live feed fusion as AI Risk Assessment. Open AI Risk Assessment to run a full analysis and export the PDF.',
  date: '—',
  status: 'Monitoring',
}

export function IncidentOverviewCard({
  className,
  title = PLACEHOLDER_DATA.title,
  eventType = PLACEHOLDER_DATA.eventType,
  description = PLACEHOLDER_DATA.description,
  date = PLACEHOLDER_DATA.date,
  status = PLACEHOLDER_DATA.status,
  loading = false,
}: IncidentOverviewCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm h-full',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">{title}</h3>

      <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-[#A41E22] via-[#7C161A] to-[#3F0A0C] p-3 flex items-start gap-3 flex-1 min-h-0">
        <Tornado
          className="w-7 h-7 text-white shrink-0 mt-0.5"
          strokeWidth={2}
        />
        <div className="flex flex-col gap-2.5 leading-tight min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white">{loading ? 'Loading live snapshot…' : eventType}</p>
          <p className="text-[11px] font-medium text-white/85 whitespace-pre-line leading-snug">
            {loading ? 'Pulling NWS / USGS / FIRMS and aligning to your role scope…' : description}
          </p>
          <div className="flex items-center gap-2 text-[11px] font-medium text-white/90 mt-auto pt-2">
            <span>{loading ? '…' : date}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-white/70" />
            <span className="font-semibold">{status}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
