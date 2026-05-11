'use client'

import * as React from 'react'
import { Bed } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface HospitalCapacityCardProps {
  className?: string
  availableBeds?: number
  totalBeds?: number
  icuBeds?: { available: number; total: number }
  erWaitTime?: string
  onViewHospitals?: () => void
}

export function HospitalCapacityCard({
  className,
  availableBeds = 312,
  totalBeds = 782,
  icuBeds = { available: 48, total: 113 },
  erWaitTime = '22 min',
  onViewHospitals,
}: HospitalCapacityCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">Hospital Capacity</h3>

      <div className="flex items-start gap-3 flex-1">
        <span className="w-12 h-12 rounded-xl bg-[#33375D]/10 flex items-center justify-center shrink-0">
          <Bed className="w-6 h-6 text-[#33375D]" strokeWidth={2.25} />
        </span>
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div>
            <p className="text-[10px] font-medium text-slate-500">Available Beds</p>
            <p className="text-[22px] font-bold text-slate-900 leading-none tabular-nums">
              {availableBeds.toLocaleString()}
            </p>
            <p className="text-[10px] font-medium text-slate-500 mt-0.5">
              of {totalBeds.toLocaleString()}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
            <div>
              <p className="text-[9px] font-semibold text-slate-500">ICU Beds</p>
              <p className="text-[11px] font-bold text-slate-900 tabular-nums">
                {icuBeds.available}{' '}
                <span className="text-[9px] font-medium text-slate-500">
                  of {icuBeds.total}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-slate-500">ER Wait Time</p>
              <p className="text-[11px] font-bold text-slate-900 tabular-nums">{erWaitTime}</p>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onViewHospitals}
        className="w-full py-2 rounded-lg bg-[#33375D] text-white text-[11px] font-bold hover:bg-[#2A2E4D] transition-colors"
      >
        View Hospitals
      </button>
    </div>
  )
}
