'use client'

import * as React from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Camera, Film, ExternalLink, MapPin, User, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import type { CitizenActivityDisplayRow } from '@/components/citizen-activity/citizen-activity-display'
import type { CitizenActivityMediaRef } from '@/lib/citizen-activity/types'
import { CITIZEN_ACTIVITY_CATEGORY_META } from '@/lib/citizen-activity/category-meta'
import { cn } from '@/lib/utils'

function cloudinaryVideoPoster(url: string): string | undefined {
    if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) {
        return undefined
    }
    return url
        .replace('/video/upload/', '/video/upload/so_0/')
        .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg$2')
}

export interface CitizenActivityMediaModalProps {
    entry: CitizenActivityDisplayRow | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export type MediaItem =
    | { type: 'image'; data: CitizenActivityMediaRef }
    | { type: 'video'; data: CitizenActivityMediaRef }

export function CitizenActivityMediaModal({
    entry,
    open,
    onOpenChange,
}: CitizenActivityMediaModalProps) {
    const [selectedIndex, setSelectedIndex] = React.useState(0)

    // Reset selected index when modal opens or entry changes
    React.useEffect(() => {
        if (open) {
            setSelectedIndex(0)
        }
    }, [open, entry?.id])

    if (!entry) return null

    const pictures = entry.pictures ?? []
    const videos = entry.videos ?? []

    const mediaList: MediaItem[] = [
        ...pictures.map((p) => ({ type: 'image' as const, data: p })),
        ...videos.map((v) => ({ type: 'video' as const, data: v })),
    ]

    if (mediaList.length === 0) return null

    const activeItem = mediaList[selectedIndex] || mediaList[0]
    const meta = CITIZEN_ACTIVITY_CATEGORY_META[entry.category]

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                elevated
                className="max-w-4xl overflow-hidden rounded-2xl bg-white p-0 gap-0 border-0 shadow-2xl sm:max-w-3xl"
            >
                {/* Modal Header */}
                <DialogHeader className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 text-left">
                    <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
                        <div className="flex items-center gap-3">
                            <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs"
                                style={{ backgroundColor: meta.tileColor }}
                            >
                                <Camera className="h-4 w-4 text-white" />
                            </span>
                            <div>
                                <DialogTitle className="text-base font-bold text-slate-900">
                                    {entry.title} Media
                                </DialogTitle>
                                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                    <span className="flex items-center gap-1 font-medium text-slate-700">
                                        <User className="h-3.5 w-3.5 text-slate-400" />
                                        {entry.citizenName}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                        {entry.citizenAddress}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1 tabular-nums">
                                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                                        {entry.displayTime}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Main Media Preview Area */}
                <div className="relative flex min-h-[320px] max-h-[65vh] w-full items-center justify-center bg-slate-950 p-4">
                    {activeItem.type === 'image' ? (
                        <div className="relative flex h-full max-h-[60vh] w-full items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={activeItem.data.url}
                                alt={activeItem.data.fileName || 'Citizen attachment'}
                                className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain shadow-lg"
                            />
                        </div>
                    ) : (
                        <div className="flex h-full max-h-[60vh] w-full items-center justify-center">
                            <video
                                key={activeItem.data.url}
                                src={activeItem.data.url}
                                controls
                                autoPlay
                                preload="metadata"
                                playsInline
                                poster={cloudinaryVideoPoster(activeItem.data.url)}
                                className="max-h-[60vh] w-full rounded-lg bg-black object-contain shadow-lg"
                            >
                                Your browser does not support video playback.
                            </video>
                        </div>
                    )}

                    {/* Navigation Arrows for Multiple Attachments */}
                    {mediaList.length > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={() =>
                                    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1))
                                }
                                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/90 transition-colors backdrop-blur-xs"
                                aria-label="Previous attachment"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setSelectedIndex((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0))
                                }
                                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/90 transition-colors backdrop-blur-xs"
                                aria-label="Next attachment"
                            >
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        </>
                    )}
                </div>

                {/* Bottom Gallery Thumbnails Bar & Footer */}
                <div className="border-t border-slate-100 bg-white p-4">
                    {mediaList.length > 1 && (
                        <div className="mb-3 flex items-center justify-center gap-2 overflow-x-auto py-1">
                            {mediaList.map((item, idx) => (
                                <button
                                    key={item.data.url + idx}
                                    type="button"
                                    onClick={() => setSelectedIndex(idx)}
                                    className={cn(
                                        'relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                                        selectedIndex === idx
                                            ? 'border-[#33375D] ring-2 ring-[#33375D]/20 scale-105'
                                            : 'border-slate-200 opacity-60 hover:opacity-100',
                                    )}
                                >
                                    {item.type === 'image' ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={item.data.url}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="relative h-full w-full bg-slate-900 flex items-center justify-center">
                                            {cloudinaryVideoPoster(item.data.url) ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img
                                                    src={cloudinaryVideoPoster(item.data.url)}
                                                    alt=""
                                                    className="h-full w-full object-cover opacity-75"
                                                />
                                            ) : null}
                                            <Film className="absolute h-5 w-5 text-white drop-shadow-md" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span className="font-medium">
                            Attachment {selectedIndex + 1} of {mediaList.length} ({activeItem.type})
                        </span>
                        <a
                            href={activeItem.data.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-bold text-[#33375D] hover:underline"
                        >
                            Open in original tab
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
