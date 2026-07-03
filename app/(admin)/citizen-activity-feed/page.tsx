'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, HeartPulse, RefreshCw, ShieldCheck, Zap } from 'lucide-react'
import { AdminPageShell } from '@/components/admin-page-shell'
import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageLoader } from '@/components/admin-page-loader'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CitizenActivityFeedList } from '@/components/citizen-activity/citizen-activity-feed-list'
import { enrichCitizenActivityItems } from '@/components/citizen-activity/citizen-activity-display'
import {
    CITIZEN_ACTIVITY_FILTER_LABELS,
    type CitizenActivityFilter,
} from '@/lib/citizen-activity/category-meta'
import type { CitizenActivityFeedResponse, CitizenActivityFilter as FilterType } from '@/lib/citizen-activity/types'
import { cn } from '@/lib/utils'

const FILTERS: FilterType[] = ['all', 'help', 'safety', 'infrastructure', 'medical']

function StatCard({
    label,
    value,
    icon: Icon,
    accent,
}: {
    label: string
    value: number
    icon: React.ComponentType<{ className?: string }>
    accent: string
}) {
    return (
        <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">{value}</p>
                </div>
                <span
                    className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl text-white',
                        accent,
                    )}
                >
                    <Icon className="h-5 w-5" />
                </span>
            </div>
        </Card>
    )
}

export default function CitizenActivityFeedPage() {
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<FilterType>('all')
    const [query, setQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [payload, setPayload] = useState<CitizenActivityFeedResponse | null>(null)

    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
        return () => window.clearTimeout(t)
    }, [query])

    const loadFeed = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                filter,
                limit: '100',
            })
            const res = await fetch(`/api/admin/citizen-activity?${params.toString()}`, {
                cache: 'no-store',
            })
            const data = (await res.json()) as CitizenActivityFeedResponse
            if (res.ok) setPayload(data)
        } catch {
            setPayload(null)
        } finally {
            setLoading(false)
        }
    }, [filter])

    useEffect(() => {
        void loadFeed()
    }, [loadFeed])

    const stats = payload?.stats
    const items = payload?.items ?? []

    const filteredCount = useMemo(() => {
        if (!debouncedQuery.trim()) return items.length
        const q = debouncedQuery.trim().toLowerCase()
        return enrichCitizenActivityItems(items).filter((entry) =>
            [
                entry.title,
                entry.citizenName,
                entry.citizenAddress,
                entry.takeAction,
                entry.resolutionStatus,
            ]
                .join(' ')
                .toLowerCase()
                .includes(q),
        ).length
    }, [items, debouncedQuery])

    const filterButtons = useMemo(
        () =>
            FILTERS.map((key) => ({
                key,
                label: CITIZEN_ACTIVITY_FILTER_LABELS[key as CitizenActivityFilter],
            })),
        [],
    )

    if (loading && !payload) {
        return <AdminPageLoader />
    }

    return (
        <AdminPageShell innerClassName="space-y-6">
            <AdminPageHeader
                title="Citizen Activity Feed"
                description="Live citizen reports, safety check-ins, shelter activity, infrastructure alerts, and medical assistance requests across your jurisdiction."
                titleUppercase={false}
                actions={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-slate-200 font-bold"
                        onClick={() => void loadFeed()}
                        disabled={loading}
                    >
                        <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                        Refresh
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Help requests"
                    value={stats?.helpRequests ?? 0}
                    icon={Activity}
                    accent="bg-[#D74C30]"
                />
                <StatCard
                    label="Safe check-ins"
                    value={stats?.safeCheckIns ?? 0}
                    icon={ShieldCheck}
                    accent="bg-[#22A04C]"
                />
                <StatCard
                    label="Infrastructure alerts"
                    value={stats?.infrastructureAlerts ?? 0}
                    icon={Zap}
                    accent="bg-[#E5A436]"
                />
                <StatCard
                    label="Medical assistance"
                    value={stats?.medicalAssistance ?? 0}
                    icon={HeartPulse}
                    accent="bg-[#D74C30]"
                />
            </div>

            <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {filterButtons.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setFilter(key)}
                                className={cn(
                                    'rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                                    filter === key
                                        ? 'bg-[#33375D] text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search citizen, address, or status…"
                        className="max-w-md rounded-xl border-slate-200"
                    />
                </div>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Citizen requests</h2>
                        <p className="mt-1 text-xs text-slate-500">
                            Track who requested help, where they are, what Ready2Go did, and whether the case is
                            completed or still pending.
                        </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">
                        {filteredCount} record{filteredCount === 1 ? '' : 's'}
                    </p>
                </div>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                        ))}
                    </div>
                ) : (
                    <CitizenActivityFeedList items={items} searchQuery={debouncedQuery} />
                )}
            </Card>
        </AdminPageShell>
    )
}
