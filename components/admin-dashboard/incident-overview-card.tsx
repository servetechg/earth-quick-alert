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
}

const MOCK_DATA: Required<Omit<IncidentOverviewCardProps, 'className'>> = {
  title: 'Incident Overview',
  eventType: 'Severe Weather Event',
  description: 'Tornadoes, Heavy Rain & Flooding\nPine Bluff, Jefferson County, AR',
  date: 'May 20, 2025',
  status: 'Active',
}

export function IncidentOverviewCard({
  className,
  title = MOCK_DATA.title,
  eventType = MOCK_DATA.eventType,
  description = MOCK_DATA.description,
  date = MOCK_DATA.date,
  status = MOCK_DATA.status,
}: IncidentOverviewCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">{title}</h3>

      <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-[#A41E22] via-[#7C161A] to-[#3F0A0C] p-3 flex items-start gap-3">
        <Tornado
          className="w-7 h-7 text-white shrink-0 mt-0.5"
          strokeWidth={2}
        />
        <div className="flex flex-col gap-1.5 leading-tight min-w-0">
          <p className="text-[13px] font-bold text-white">{eventType}</p>
          <p className="text-[11px] font-medium text-white/85 whitespace-pre-line leading-snug">
            {description}
          </p>
          <div className="flex items-center gap-2 text-[11px] font-medium text-white/90 mt-1.5">
            <span>{date}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-white/70" />
            <span className="font-semibold">{status}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
