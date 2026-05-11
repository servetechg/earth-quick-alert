'use client'

import * as React from 'react'
import { ShieldAlert, Search, Stethoscope, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeploymentRow {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  count: number
  tone: 'red' | 'amber' | 'green' | 'navy'
}

const MOCK_ROWS: DeploymentRow[] = [
  { icon: ShieldAlert, label: 'Task Forces', count: 6, tone: 'red' },
  { icon: Search, label: 'Search & Rescue', count: 4, tone: 'amber' },
  { icon: Stethoscope, label: 'Medical Teams', count: 7, tone: 'green' },
  { icon: Package, label: 'Logistics Teams', count: 5, tone: 'navy' },
]

const TONE_BG: Record<DeploymentRow['tone'], string> = {
  red: 'bg-[#A41E22]/10 text-[#A41E22]',
  amber: 'bg-[#F59E0B]/10 text-[#F59E0B]',
  green: 'bg-[#16A34A]/10 text-[#16A34A]',
  navy: 'bg-[#33375D]/10 text-[#33375D]',
}

export interface ResourceDeploymentCardProps {
  className?: string
  onViewDeployments?: () => void
}

export function ResourceDeploymentCard({
  className,
  onViewDeployments,
}: ResourceDeploymentCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">Resource Deployment</h3>

      <ul className="flex flex-col gap-2 flex-1">
        {MOCK_ROWS.map((row) => {
          const Icon = row.icon
          return (
            <li key={row.label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'w-6 h-6 rounded-md flex items-center justify-center shrink-0',
                    TONE_BG[row.tone],
                  )}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
                </span>
                <span className="text-[11px] font-medium text-slate-700 truncate">
                  {row.label}
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-900 shrink-0">
                <span className="tabular-nums">{row.count}</span>{' '}
                <span className="text-[10px] font-medium text-slate-500">Deployed</span>
              </span>
            </li>
          )
        })}
      </ul>

      <button
        onClick={onViewDeployments}
        className="w-full py-2 rounded-lg bg-[#33375D] text-white text-[11px] font-bold hover:bg-[#2A2E4D] transition-colors"
      >
        View Deployments
      </button>
    </div>
  )
}
