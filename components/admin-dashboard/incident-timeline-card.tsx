'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TimelineEntry {
  time: string
  event: string
  tone?: 'red' | 'amber' | 'navy' | 'slate'
}

export interface IncidentTimelineCardProps {
  className?: string
  entries?: TimelineEntry[]
}

const MOCK_ENTRIES: TimelineEntry[] = [
  { time: '09:45 AM', event: 'Tornado Warning Issued', tone: 'red' },
  { time: '09:52 AM', event: 'Shelter Activated-Pine Bluff HS', tone: 'navy' },
  { time: '10:02 AM', event: 'Power Outage Reported', tone: 'amber' },
  { time: '10:18 AM', event: 'Water Main Break Reported', tone: 'slate' },
]

const DOT_BG: Record<NonNullable<TimelineEntry['tone']>, string> = {
  red: 'bg-[#A41E22]',
  amber: 'bg-[#F59E0B]',
  navy: 'bg-[#33375D]',
  slate: 'bg-slate-400',
}

export function IncidentTimelineCard({
  className,
  entries = MOCK_ENTRIES,
}: IncidentTimelineCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">Incident Timeline</h3>

      <ul className="flex flex-col gap-4">
        {entries.map((entry, idx) => (
          <li key={`${entry.time}-${idx}`} className="flex items-start gap-2.5">
            <span
              className={cn(
                'mt-1.5 w-1.5 h-1.5 rounded-full shrink-0',
                DOT_BG[entry.tone ?? 'navy'],
              )}
              aria-hidden
            />
            <div className="flex items-baseline justify-between w-full gap-3 leading-snug">
              <span className="text-[11px] font-semibold text-slate-700 tabular-nums shrink-0">
                {entry.time}
              </span>
              <span className="text-[11px] font-medium text-slate-500 text-right">
                {entry.event}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
