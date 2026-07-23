'use client'

import * as React from 'react'
import { AlertTriangle, CloudRain, Flame, Tornado, Wind, Zap } from 'lucide-react'
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

function iconForEvent(eventType: string) {
  const t = eventType.toLowerCase()
  if (t.includes('tornado')) return Tornado
  if (t.includes('flood') || t.includes('hydro')) return CloudRain
  if (t.includes('fire') || t.includes('wildfire') || t.includes('heat')) return Flame
  if (t.includes('wind') || t.includes('storm')) return Wind
  if (t.includes('thunder') || t.includes('lightning')) return Zap
  return AlertTriangle
}

export function IncidentOverviewCard({
  className,
  title = 'Incident Overview',
  eventType = 'Live situational picture',
  description = 'Live situational data synchronized with AI Risk Assessment.',
  date = '—',
  status = 'Monitoring',
  loading = false,
}: IncidentOverviewCardProps) {
  const Icon = iconForEvent(eventType)

  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm h-full',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">{title}</h3>

      <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-[#A41E22] via-[#7C161A] to-[#3F0A0C] p-3 flex items-start gap-3 flex-1 min-h-0">
        <Icon className="w-7 h-7 text-white shrink-0 mt-0.5" strokeWidth={2} />
        <div className="flex flex-col gap-2.5 leading-tight min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white">
            {loading ? 'Loading live snapshot…' : eventType}
          </p>
          <p className="text-[11px] font-medium text-white/85 whitespace-pre-line leading-snug">
            {loading
              ? 'Pulling NWS / USGS / FIRMS and aligning to your role scope…'
              : description}
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
