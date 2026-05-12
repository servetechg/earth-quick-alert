'use client'

import * as React from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

interface OutageSegment {
  name: string
  value: number
  color: string
}

const MOCK_SEGMENTS: OutageSegment[] = [
  { name: '> 10k Out', value: 3, color: '#A41E22' },
  { name: '1k - 10k Out', value: 7, color: '#F59E0B' },
  { name: '< 1k Out', value: 12, color: '#16A34A' },
]

export interface PowerOutageSummaryCardProps {
  className?: string
  segments?: OutageSegment[]
  totalOut?: string
  onViewMap?: () => void
}

export function PowerOutageSummaryCard({
  className,
  segments = MOCK_SEGMENTS,
  totalOut = '12,842',
  onViewMap,
}: PowerOutageSummaryCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">Power Outage Summary</h3>

      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-[130px] h-[130px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments}
                dataKey="value"
                innerRadius={42}
                outerRadius={62}
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {segments.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-[20px] font-bold text-slate-900 tabular-nums">{totalOut}</span>
            <span className="text-[9px] font-semibold text-slate-500 text-center mt-1 px-2">
              Customers Out
            </span>
          </div>
        </div>

        <ul className="flex flex-col gap-2 flex-1">
          {segments.map((seg) => (
            <li key={seg.name} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                  aria-hidden
                />
                <span className="text-[12px] font-medium text-slate-600 truncate">
                  {seg.name}
                </span>
              </div>
              <span className="text-[13px] font-bold text-slate-900 tabular-nums">
                {seg.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onViewMap}
        className="w-full py-2 rounded-lg bg-[#33375D] text-white text-[11px] font-bold hover:bg-[#2A2E4D] transition-colors"
      >
        View Outage Map
      </button>
    </div>
  )
}
