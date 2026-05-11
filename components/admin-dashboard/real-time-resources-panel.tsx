'use client'

import * as React from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface ResourceItem {
  icon: string
  label: string
  value: string
  status: string
  tileColor: string
}

const MOCK_RESOURCES: ResourceItem[] = [
  {
    icon: '/icons/personnel.svg',
    label: 'Personnel',
    value: '2,145',
    status: 'Deployed',
    tileColor: '#2BA34F',
  },
    // {
    //   icon: '/icons/vehicles.svg',
    //   label: 'Vehicles',
    //   value: '413',
    //   status: 'Available',
    //   tileColor: '#E14B40',
    // },
  {
    icon: '/icons/shelters.svg',
    label: 'Shelters',
    value: '14',
    status: 'Open',
    tileColor: '#F1772E',
  },
  {
    icon: '/icons/hospital-beds.svg',
    label: 'Hospital Beds',
    value: '312',
    status: 'Available',
    tileColor: '#22A9A1',
  },
  {
    icon: '/icons/power-crews.svg',
    label: 'Power Crews',
    value: '87',
    status: 'Deployed',
    tileColor: '#A99423',
  },
  {
    icon: '/icons/water-crews.svg',
    label: 'Water Crews',
    value: '34',
    status: 'Deployed',
    tileColor: '#4674C6',
  },
  {
    // No dedicated volunteers icon yet — reuse personnel glyph with the olive tile.
    icon: '/icons/personnel.svg',
    label: 'Volunteers',
    value: '1,268',
    status: 'Available',
    tileColor: '#5C7E2D',
  },
  {
    icon: '/icons/meals-ready.svg',
    label: 'Meals Ready',
    value: '18,560',
    status: 'Available',
    tileColor: '#D74C30',
  },
  {
    icon: '/icons/fuel-sites.svg',
    label: 'Fuel Sites',
    value: '23',
    status: 'Available',
    tileColor: '#D74C30',
  },
  {
    icon: '/icons/generators.svg',
    label: 'Generators',
    value: '56',
    status: 'Available',
    tileColor: '#E5A436',
  },
]

export interface RealTimeResourcesPanelProps {
  className?: string
}

export function RealTimeResourcesPanel({ className }: RealTimeResourcesPanelProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">Real-Time Resources</h3>

      <ul className="flex flex-col divide-y divide-slate-100">
        {MOCK_RESOURCES.map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-2 py-2 first:pt-0 last:pb-0"
          >
            <span
              className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: item.tileColor }}
            >
              <Image
                src={item.icon}
                alt=""
                aria-hidden
                width={18}
                height={18}
                className="w-4 h-4"
              />
            </span>
            <span className="text-[11px] font-semibold text-slate-700 flex-1 min-w-0 truncate">
              {item.label}
            </span>
            <div className="flex flex-col items-end leading-tight shrink-0">
              <span className="text-[13px] font-bold text-slate-900 tabular-nums">
                {item.value}
              </span>
              <span className="text-[9px] font-medium text-slate-500">{item.status}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
