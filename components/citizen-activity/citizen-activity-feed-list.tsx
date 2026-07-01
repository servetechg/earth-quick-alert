'use client'

import * as React from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { CitizenActivityItem } from '@/lib/citizen-activity/types'
import { CITIZEN_ACTIVITY_CATEGORY_META } from '@/lib/citizen-activity/category-meta'

const PRIORITY_STYLES: Record<CitizenActivityItem['priority'], string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-amber-100 text-amber-800',
    normal: 'bg-slate-100 text-slate-600',
    low: 'bg-emerald-100 text-emerald-700',
}

export interface CitizenActivityFeedListProps {
    items: CitizenActivityItem[]
    compact?: boolean
    className?: string
    emptyMessage?: string
}

export function CitizenActivityFeedList({
    items,
    compact = false,
    className,
    emptyMessage = 'No citizen activity to display.',
}: CitizenActivityFeedListProps) {
    if (items.length === 0) {
        return (
            <p className={cn('py-6 text-center text-sm text-slate-500', className)}>{emptyMessage}</p>
        )
    }

    return (
        <ul className={cn('flex flex-col divide-y divide-slate-100', className)}>
            {items.map((entry) => {
                const meta = CITIZEN_ACTIVITY_CATEGORY_META[entry.category]
                return (
                    <li
                        key={entry.id}
                        className={cn(
                            'flex items-start gap-2',
                            compact ? 'py-2.5 first:pt-1 last:pb-1' : 'py-3.5 first:pt-2 last:pb-2',
                        )}
                    >
                        <span
                            className={cn(
                                'flex shrink-0 items-center justify-center rounded-md',
                                compact ? 'h-8 w-8' : 'h-10 w-10',
                            )}
                            style={{ backgroundColor: meta.tileColor }}
                        >
                            <Image
                                src={meta.icon}
                                alt=""
                                aria-hidden
                                width={18}
                                height={18}
                                className={cn('object-contain', compact ? 'h-4 w-4' : 'h-5 w-5')}
                            />
                        </span>
                        <div className="min-w-0 flex-1 leading-snug">
                            <div className="mb-0.5 flex flex-wrap items-center gap-2">
                                <p
                                    className={cn(
                                        'font-semibold tabular-nums text-slate-500',
                                        compact ? 'text-[10px]' : 'text-xs',
                                    )}
                                >
                                    {entry.displayTime}
                                </p>
                                {!compact && entry.status ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                        {entry.status}
                                    </span>
                                ) : null}
                                {!compact ? (
                                    <span
                                        className={cn(
                                            'rounded-full px-2 py-0.5 text-[10px] font-bold capitalize',
                                            PRIORITY_STYLES[entry.priority],
                                        )}
                                    >
                                        {entry.priority}
                                    </span>
                                ) : null}
                            </div>
                            <p
                                className={cn(
                                    'font-bold text-slate-900',
                                    compact ? 'text-[12px]' : 'text-sm',
                                )}
                            >
                                {entry.title}
                            </p>
                            <p
                                className={cn(
                                    'font-medium text-slate-500',
                                    compact ? 'text-[10px] whitespace-pre-line' : 'text-xs',
                                )}
                            >
                                {entry.line2 ? `${entry.line1}\n${entry.line2}` : entry.line1}
                            </p>
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}
