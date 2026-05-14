'use client'

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

/** Matches Alerts & Communication real-time strip styling */
export function ResponderInfoBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#6366F1]/10 bg-[#EEF2FF] p-3 text-[#4338CA]">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
        aria-hidden
      >
        <Info size={14} />
      </div>
      <div className="text-[12px] font-bold leading-relaxed">
        <span className="text-[#3730A3]">Responder portal:</span>{' '}
        <span className="font-medium text-[#4338CA]/80">{children}</span>
      </div>
    </div>
  )
}
