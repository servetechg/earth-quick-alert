'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AIRiskPredictionCardProps {
  className?: string
  score?: number
  riskLabel?: 'Low' | 'Moderate' | 'High Risk' | 'Extreme'
}

const LABELS = ['Low', 'Moderate', 'High', 'Extreme'] as const

export function AIRiskPredictionCard({
  className,
  score = 85,
  riskLabel = 'High Risk',
}: AIRiskPredictionCardProps) {
  const indicatorPosition = Math.min(Math.max(score, 0), 100)

  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <div className="space-y-0.5">
        <h3 className="text-[13px] font-bold text-slate-900">AI Risk Prediction</h3>
        <p className="text-[11px] text-slate-500 font-medium">Overall Risk Score</p>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[44px] font-bold text-slate-900 leading-none tracking-tight">
          {score}
        </span>
        <span className="text-[12px] text-[#A41E22] font-bold">{riskLabel}</span>
      </div>

      <div className="space-y-2 pt-4">
        <div className="relative h-2 rounded-full bg-gradient-to-r from-[#16A34A] via-[#FACC15] via-50% to-[#A41E22] overflow-visible">
          <div
            className="absolute -top-1 w-1 h-4 bg-slate-900 rounded-full shadow-md"
            style={{ left: `calc(${indicatorPosition}% - 2px)` }}
            aria-hidden
          />
        </div>
        <div className="flex justify-between text-[9px] font-semibold text-slate-500 uppercase tracking-wide">
          {LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
