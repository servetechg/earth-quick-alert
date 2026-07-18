'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** NEXRAD base-reflectivity intensity scale (Iowa Mesonet / NOAA N0Q). */
const RADAR_LEGEND_ENTRIES = [
  { color: '#A5F3FC', label: 'Very Light Rain / Drizzle' },
  { color: '#3B82F6', label: 'Light Rain' },
  { color: '#22C55E', label: 'Moderate Rain' },
  { color: '#EAB308', label: 'Heavy Rain' },
  { color: '#F97316', label: 'Very Heavy Rain / Thunderstorms' },
  { color: '#EF4444', label: 'Extreme Rainfall / Severe Thunderstorms' },
  { color: '#A855F7', label: 'Hail or Extremely Intense Storms' },
] as const

type WeatherRadarLegendProps = {
  visible: boolean
  className?: string
}

export function WeatherRadarLegend({ visible, className }: WeatherRadarLegendProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (visible) setCollapsed(false)
  }, [visible])

  if (!visible) return null

  return (
    <div
      className={cn(
        'pointer-events-auto absolute bottom-3 left-3 z-[500] w-[min(100%-1.5rem,17.5rem)]',
        'animate-in fade-in slide-in-from-bottom-2 duration-300',
        className,
      )}
      role="region"
      aria-label="Weather Radar Legend"
    >
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/60"
          aria-expanded={!collapsed}
        >
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#33375D]">
            Weather Radar Legend
          </span>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
          )}
        </button>

        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
            collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <ul className="space-y-1.5 border-t border-slate-200/70 px-3 pb-2 pt-2">
              {RADAR_LEGEND_ENTRIES.map((entry) => (
                <li key={entry.label} className="flex items-center gap-2.5">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10 shadow-sm"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden
                  />
                  <span className="text-[11px] leading-snug text-slate-700">{entry.label}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-200/70 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
              Colors indicate precipitation intensity. Darker and warmer colors represent stronger
              precipitation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
