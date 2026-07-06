'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CitizenActivityItem } from '@/lib/citizen-activity/types'
import { CitizenActivityFeedList } from '@/components/citizen-activity/citizen-activity-feed-list'

export interface CitizenActivityFeedProps {
    className?: string
}

export function CitizenActivityFeed({ className }: CitizenActivityFeedProps) {
    const [items, setItems] = React.useState<CitizenActivityItem[]>([])
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                const res = await fetch('/api/admin/citizen-activity?limit=4', { cache: 'no-store' })
                const data = await res.json()
                if (!cancelled && res.ok && Array.isArray(data.items)) {
                    setItems(data.items)
                }
            } catch {
                /* widget falls back to empty */
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <div
            className={cn(
                'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
                className,
            )}
        >
            <h3 className="text-[13px] font-bold text-slate-900">Citizen Activity Feed</h3>

            {loading ? (
                <div className="space-y-3 py-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                    ))}
                </div>
            ) : (
                <CitizenActivityFeedList items={items} compact emptyMessage="No recent activity." />
            )}

            <Link
                href="/citizen-activity-feed"
                className="mt-1 text-center text-[11px] font-bold text-[#33375D] hover:underline"
            >
                See all
            </Link>
        </div>
    )
}
