'use client'

import * as React from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface FeedEntry {
  icon: string
  time: string
  title: string
  description: string
  tileColor: string
}

const MOCK_FEED: FeedEntry[] = [
  {
    icon: '/icons/help-request.svg',
    time: '09:45 AM',
    title: 'Help Request',
    description: 'High Water on Street\nPine Bluff, AR',
    tileColor: '#D74C30',
  },
  {
    icon: '/icons/shelters.svg',
    time: '09:45 AM',
    title: 'Shelter Check-In',
    description: 'Pine Bluff High School\n120 People',
    tileColor: '#22A04C',
  },
  {
    icon: '/icons/power-crews.svg',
    time: '09:45 AM',
    title: 'Power Outage',
    description: '102 Customers Affected',
    tileColor: '#E5A436',
  },
  {
    icon: '/icons/hospital-beds.svg',
    time: '09:45 AM',
    title: 'Medical Assistance',
    description: 'E. Harding Ave, Pine Bluff',
    tileColor: '#D74C30',
  },
]

export interface CitizenActivityFeedProps {
  className?: string
  onViewAll?: () => void
}

export function CitizenActivityFeed({ className, onViewAll }: CitizenActivityFeedProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm',
        className,
      )}
    >
      <h3 className="text-[13px] font-bold text-slate-900">Citizen Activity Feed</h3>

      <ul className="flex flex-col divide-y divide-slate-100">
        {MOCK_FEED.map((entry, idx) => (
          <li
            key={`${entry.title}-${idx}`}
            className="flex items-start gap-2 py-2.5 first:pt-1 last:pb-1"
          >
            <span
              className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: entry.tileColor }}
            >
              <Image
                src={entry.icon}
                alt=""
                aria-hidden
                width={18}
                height={18}
                className="w-4 h-4 object-contain"
              />
            </span>
            <div className="flex-1 min-w-0 leading-snug">
              <p className="text-[10px] font-semibold text-slate-500 tabular-nums">
                {entry.time}
              </p>
              <p className="text-[12px] font-bold text-slate-900">{entry.title}</p>
              <p className="text-[10px] font-medium text-slate-500 whitespace-pre-line">
                {entry.description}
              </p>
            </div>
          </li>
        ))}
      </ul>


    </div>
  )
}
