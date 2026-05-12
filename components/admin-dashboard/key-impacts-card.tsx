'use client'

import * as React from 'react'
import { Users, Home, CriticalFacilities, Roads } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface KeyImpactRow {
  Icon: React.ComponentType<{ style?: React.CSSProperties }>
  label: string
  value: string
}

export interface KeyImpactsCardProps {
  className?: string
  rows?: KeyImpactRow[]
}

const MOCK_ROWS: KeyImpactRow[] = [
  { Icon: Users, label: 'Population at Risk', value: '68,247' },
  { Icon: Home, label: 'Structures at Risk', value: '12,842' },
  { Icon: CriticalFacilities, label: 'Critical Facilities', value: '28' },
  { Icon: Roads, label: 'Roads Impacted', value: '51' },
]

export function KeyImpactsCard({ className, rows = MOCK_ROWS }: KeyImpactsCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">Key Impacts</h3>

      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const Icon = row.Icon
          return (
            <li key={row.label} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                  <Icon />
                </span>
                <span className="text-[11px] font-medium text-slate-600 truncate">
                  {row.label}
                </span>
              </div>
              <span className="text-[12px] font-bold text-slate-900 tabular-nums shrink-0">
                {row.value}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
