'use client'

import * as React from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

interface ShelterSegment {
  name: string
  value: number
  color: string
}

const MOCK_SEGMENTS: ShelterSegment[] = [
  { name: 'Available', value: 6, color: '#16A34A' },
  { name: 'Partial', value: 5, color: '#F59E0B' },
  { name: 'Full', value: 3, color: '#A41E22' },
  { name: 'Offline', value: 0, color: '#94A3B8' },
]

export interface ShelterStatusCardProps {
  className?: string
  segments?: ShelterSegment[]
  totalOpenLabel?: string
  onViewList?: () => void
}

export function ShelterStatusCard({
  className,
  segments = MOCK_SEGMENTS,
  totalOpenLabel = 'Open Shelters',
  onViewList,
}: ShelterStatusCardProps) {
  const totalOpen = segments.reduce((sum, s) => sum + s.value, 0)
  const chartData = segments.filter((s) => s.value > 0)

  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">Shelter Status</h3>

      <div className="flex items-center gap-3 flex-1">
        <div className="relative w-[90px] h-[90px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                innerRadius={28}
                outerRadius={42}
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-[20px] font-bold text-slate-900">{totalOpen}</span>
            <span className="text-[8px] font-semibold text-slate-500 text-center mt-0.5">
              {totalOpenLabel}
            </span>
          </div>
        </div>

        <ul className="flex flex-col gap-1.5 flex-1">
          {segments.map((seg) => (
            <li key={seg.name} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: seg.color }}
                  aria-hidden
                />
                <span className="text-[10px] font-medium text-slate-600 truncate">
                  {seg.name}
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-900 tabular-nums">
                {seg.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onViewList}
        className="w-full py-2 rounded-lg bg-[#33375D] text-white text-[11px] font-bold hover:bg-[#2A2E4D] transition-colors"
      >
        View Shelter List
      </button>
    </div>
  )
}
