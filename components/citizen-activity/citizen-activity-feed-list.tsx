'use client'

import * as React from 'react'
import Image from 'next/image'
import { Camera, Film, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CitizenActivityItem } from '@/lib/citizen-activity/types'
import { CITIZEN_ACTIVITY_CATEGORY_META } from '@/lib/citizen-activity/category-meta'
import {
    enrichCitizenActivityItems,
    type CitizenActivityDisplayRow,
    type CitizenActivityResolutionStatus,
} from '@/components/citizen-activity/citizen-activity-display'
import { CitizenActivityMediaModal } from '@/components/citizen-activity/citizen-activity-media-modal'

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
    onOpenDetail?: (entry: CitizenActivityDisplayRow) => void
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

function MediaTriggerButton({
    entry,
    onClick,
}: {
    entry: CitizenActivityDisplayRow
    onClick: () => void
}) {
    const pictures = entry.pictures ?? []
    const videos = entry.videos ?? []
    const totalCount = pictures.length + videos.length
    if (totalCount === 0) return null

    const firstPic = pictures[0]?.url
    const firstVidPoster = videos[0] ? cloudinaryVideoPoster(videos[0].url) : undefined
    const thumbUrl = firstPic || firstVidPoster

    return (
        <button
            type="button"
            onClick={onClick}
            className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 transition-all shadow-2xs group cursor-pointer"
        >
            {thumbUrl ? (
                <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={thumbUrl}
                        alt=""
                        className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                    />
                    {videos.length > 0 && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                            <Play className="h-3 w-3 fill-current" />
                        </span>
                    )}
                </span>
            ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#33375D] text-white">
                    {videos.length > 0 ? <Film className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
                </span>
            )}

            <span>View Media ({totalCount})</span>
        </button>
    )
}

function FeedTableRow({
    entry,
    onOpenDetail,
    onOpenMedia,
}: {
    entry: CitizenActivityDisplayRow
    onOpenDetail?: (entry: CitizenActivityDisplayRow) => void
    onOpenMedia: (entry: CitizenActivityDisplayRow) => void
}) {
    return (
        <tr
            className="cursor-pointer border-b border-slate-100 align-top transition-colors last:border-0 hover:bg-slate-50"
            onClick={() => onOpenDetail?.(entry)}
        >
            <td className="min-w-[240px] py-4 pr-4">
                <ActivityCell entry={entry} />
                <div onClick={(e) => e.stopPropagation()}>
                    <MediaTriggerButton entry={entry} onClick={() => onOpenMedia(entry)} />
                </div>
            </td>
            <td className="min-w-[120px] py-4 pr-4">
                <p className="text-sm font-bold text-slate-900">{entry.citizenName}</p>
            </td>
            <td className="min-w-[160px] py-4 pr-4">
                <p className="text-sm font-medium leading-snug text-slate-600">{entry.citizenAddress}</p>
            </td>
            <td className="min-w-[280px] py-4 pr-4">
                <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">{entry.takeAction}</p>
            </td>
            <td className="whitespace-nowrap py-4 text-right">
                <ResolutionBadge status={entry.resolutionStatus} />
            </td>
        </tr>
    )
}

function CompactFeedRow({
    entry,
    onOpenDetail,
    onOpenMedia,
}: {
    entry: CitizenActivityDisplayRow
    onOpenDetail?: (entry: CitizenActivityDisplayRow) => void
    onOpenMedia: (entry: CitizenActivityDisplayRow) => void
}) {
    return (
        <li
            className="cursor-pointer py-3 first:pt-1 last:pb-1 hover:bg-slate-50/80"
            onClick={() => onOpenDetail?.(entry)}
        >
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
                <p className="line-clamp-2 text-[10px] leading-relaxed text-slate-500">{entry.takeAction}</p>
                <div onClick={(e) => e.stopPropagation()}>
                    <MediaTriggerButton entry={entry} onClick={() => onOpenMedia(entry)} />
                </div>
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
    onOpenDetail,
}: CitizenActivityFeedListProps) {
    const [selectedMediaEntry, setSelectedMediaEntry] = React.useState<CitizenActivityDisplayRow | null>(null)

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

    return (
        <>
            {compact ? (
                <ul className={cn('flex flex-col divide-y divide-slate-100', className)}>
                    {rows.map((entry) => (
                        <CompactFeedRow
                            key={entry.id}
                            entry={entry}
                            onOpenDetail={onOpenDetail}
                            onOpenMedia={(item) => setSelectedMediaEntry(item)}
                        />
                    ))}
                </ul>
            ) : (
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
                                <FeedTableRow
                                    key={entry.id}
                                    entry={entry}
                                    onOpenDetail={onOpenDetail}
                                    onOpenMedia={(item) => setSelectedMediaEntry(item)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Media Lightbox Popup Modal */}
            <CitizenActivityMediaModal
                entry={selectedMediaEntry}
                open={Boolean(selectedMediaEntry)}
                onOpenChange={(open) => {
                    if (!open) setSelectedMediaEntry(null)
                }}
            />
        </>
    )
}

