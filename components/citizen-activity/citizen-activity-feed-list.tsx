'use client'

import * as React from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { CitizenActivityItem } from '@/lib/citizen-activity/types'
import { CITIZEN_ACTIVITY_CATEGORY_META } from '@/lib/citizen-activity/category-meta'
import {
    enrichCitizenActivityItems,
    type CitizenActivityDisplayRow,
    type CitizenActivityResolutionStatus,
} from '@/components/citizen-activity/citizen-activity-display'

const PRIORITY_STYLES: Record<CitizenActivityItem['priority'], string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-amber-100 text-amber-800',
    normal: 'bg-slate-100 text-slate-600',
    low: 'bg-emerald-100 text-emerald-700',
}

const RESOLUTION_STYLES: Record<CitizenActivityResolutionStatus, string> = {
    completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    pending: 'bg-amber-100 text-amber-900 border-amber-200',
}

export interface CitizenActivityFeedListProps {
    items: CitizenActivityItem[]
    compact?: boolean
    className?: string
    emptyMessage?: string
    searchQuery?: string
    onMarkCompleted?: (id: string) => void | Promise<void>
}

function ResolutionBadge({ status }: { status: CitizenActivityResolutionStatus }) {
    return (
        <span
            className={cn(
                'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide',
                RESOLUTION_STYLES[status],
            )}
        >
            {status === 'completed' ? 'Completed' : 'Pending'}
        </span>
    )
}

function ActivityCell({
    entry,
    compact,
}: {
    entry: CitizenActivityDisplayRow
    compact?: boolean
}) {
    const meta = CITIZEN_ACTIVITY_CATEGORY_META[entry.category]
    return (
        <div className="flex items-start gap-2.5 min-w-0">
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
            <div className="min-w-0">
                <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
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
                <p className={cn('font-bold text-slate-900', compact ? 'text-[12px]' : 'text-sm')}>
                    {entry.title}
                </p>
                <p className={cn('text-slate-500', compact ? 'text-[10px]' : 'text-xs')}>
                    {entry.line1}
                </p>
            </div>
        </div>
    )
}

function cloudinaryVideoPoster(url: string): string | undefined {
    if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) {
        return undefined
    }
    return url
        .replace('/video/upload/', '/video/upload/so_0/')
        .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg$2')
}

function ActivityMedia({ entry }: { entry: CitizenActivityDisplayRow }) {
    const pictures = entry.pictures ?? []
    const videos = entry.videos ?? []
    if (pictures.length === 0 && videos.length === 0) return null

    return (
        <div className="mt-3 space-y-2">
            {pictures.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {pictures.map((pic) => (
                        <a
                            key={pic.url}
                            href={pic.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-16 w-16 overflow-hidden rounded-md border bg-white"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={pic.url}
                                alt={pic.fileName || 'Report picture'}
                                className="h-full w-full object-cover"
                            />
                        </a>
                    ))}
                </div>
            ) : null}
            {videos.map((vid) => (
                <div key={vid.url} className="overflow-hidden rounded-md border bg-black">
                    <video
                        src={vid.url}
                        controls
                        preload="metadata"
                        playsInline
                        poster={cloudinaryVideoPoster(vid.url)}
                        className="aspect-video max-h-40 w-full bg-black object-contain"
                    >
                        Your browser does not support video playback.
                    </video>
                </div>
            ))}
        </div>
    )
}

function FeedTableRow({
    entry,
    onMarkCompleted,
}: {
    entry: CitizenActivityDisplayRow
    onMarkCompleted?: (id: string) => void | Promise<void>
}) {
    const isLiveRecord = Boolean(entry.userId)
    return (
        <tr className="border-b border-slate-100 last:border-0 align-top">
            <td className="py-4 pr-4 min-w-[220px]">
                <ActivityCell entry={entry} />
                <ActivityMedia entry={entry} />
            </td>
            <td className="py-4 pr-4 min-w-[120px]">
                <p className="text-sm font-bold text-slate-900">{entry.citizenName}</p>
            </td>
            <td className="py-4 pr-4 min-w-[160px]">
                <p className="text-sm font-medium text-slate-600 leading-snug">{entry.citizenAddress}</p>
            </td>
            <td className="py-4 pr-4 min-w-[280px]">
                <p className="text-sm leading-relaxed text-slate-600">{entry.takeAction}</p>
                {entry.resolutionStatus === 'pending' && isLiveRecord && onMarkCompleted ? (
                    <button
                        type="button"
                        onClick={() => void onMarkCompleted(entry.id)}
                        className="mt-2 rounded-lg bg-[#33375D] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#252847]"
                    >
                        Mark completed
                    </button>
                ) : null}
            </td>
            <td className="py-4 text-right whitespace-nowrap">
                <ResolutionBadge status={entry.resolutionStatus} />
            </td>
        </tr>
    )
}

function CompactFeedRow({ entry }: { entry: CitizenActivityDisplayRow }) {
    return (
        <li className="py-3 first:pt-1 last:pb-1">
            <div className="flex items-start justify-between gap-3">
                <ActivityCell entry={entry} compact />
                <ResolutionBadge status={entry.resolutionStatus} />
            </div>
            <div className="mt-2 ml-10 space-y-1">
                <p className="text-[11px] font-bold text-slate-800">
                    {entry.citizenName}
                    <span className="font-medium text-slate-400"> · </span>
                    <span className="font-medium text-slate-500">{entry.citizenAddress}</span>
                </p>
                <p className="text-[10px] leading-relaxed text-slate-500 line-clamp-2">{entry.takeAction}</p>
            </div>
        </li>
    )
}

export function CitizenActivityFeedList({
    items,
    compact = false,
    className,
    emptyMessage = 'No citizen activity to display.',
    searchQuery = '',
    onMarkCompleted,
}: CitizenActivityFeedListProps) {
    const rows = React.useMemo(() => {
        const enriched = enrichCitizenActivityItems(items)
        const q = searchQuery.trim().toLowerCase()
        if (!q) return enriched
        return enriched.filter((entry) => {
            const blob = [
                entry.title,
                entry.line1,
                entry.line2,
                entry.location,
                entry.status,
                entry.citizenName,
                entry.citizenAddress,
                entry.takeAction,
                entry.resolutionStatus,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
            return blob.includes(q)
        })
    }, [items, searchQuery])

    if (rows.length === 0) {
        return (
            <p className={cn('py-6 text-center text-sm text-slate-500', className)}>{emptyMessage}</p>
        )
    }

    if (compact) {
        return (
            <ul className={cn('flex flex-col divide-y divide-slate-100', className)}>
                {rows.map((entry) => (
                    <CompactFeedRow key={entry.id} entry={entry} />
                ))}
            </ul>
        )
    }

    return (
        <div className={cn('overflow-x-auto', className)}>
            <table className="w-full min-w-[960px] border-collapse text-left">
                <thead>
                    <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-400">
                            Activity
                        </th>
                        <th className="pb-3 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-400">
                            Citizen
                        </th>
                        <th className="pb-3 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-400">
                            Address
                        </th>
                        <th className="pb-3 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-400">
                            Take action
                        </th>
                        <th className="pb-3 text-right text-[11px] font-black uppercase tracking-widest text-slate-400">
                            Status
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((entry) => (
                        <FeedTableRow key={entry.id} entry={entry} onMarkCompleted={onMarkCompleted} />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
