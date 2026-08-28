'use client'

import * as React from 'react'
import Image from 'next/image'
import { Eye, ExternalLink, Film, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CITIZEN_ACTIVITY_CATEGORY_META } from '@/lib/citizen-activity/category-meta'
import type {
    CitizenActivityDetail,
    CitizenActivityMissingField,
} from '@/lib/citizen-activity/types'
import type { CitizenActivityDisplayRow } from '@/components/citizen-activity/citizen-activity-display'
import { cn } from '@/lib/utils'

const MISSING_FIELD_LABELS: Record<CitizenActivityMissingField, string> = {
    details: 'Additional details',
    pictures: 'Pictures',
    videos: 'Videos',
}

const PRIORITY_STYLES: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-amber-100 text-amber-800',
    normal: 'bg-slate-100 text-slate-600',
    low: 'bg-emerald-100 text-emerald-700',
}

function cloudinaryVideoPoster(url: string): string | undefined {
    if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) {
        return undefined
    }
    return url
        .replace('/video/upload/', '/video/upload/so_0/')
        .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg$2')
}

function DetailSection({
    title,
    children,
}: {
    title: string
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {children}
        </div>
    )
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <dt className="text-xs font-medium text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm text-slate-800">{value?.trim() ? value : '—'}</dd>
        </div>
    )
}

type PreviewDoc = { title: string; url: string; fileName?: string } | null

function buildFallbackDetail(entry: CitizenActivityDisplayRow): CitizenActivityDetail {
    const pictures = entry.pictures ?? []
    const videos = entry.videos ?? []
    const missingOptionalFields: CitizenActivityMissingField[] = []
    if (!entry.line2?.trim()) missingOptionalFields.push('details')
    if (pictures.length === 0) missingOptionalFields.push('pictures')
    if (videos.length === 0) missingOptionalFields.push('videos')

    return {
        ...entry,
        description: entry.line1,
        details: entry.line2 ?? '',
        missingOptionalFields,
        requestedMissingFields: [],
        missingInfoRequestedAt: null,
        canRequestMissingInfo: false,
    }
}

export interface CitizenActivityDetailDialogProps {
    entry: CitizenActivityDisplayRow | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onUpdated?: () => void | Promise<void>
}

export function CitizenActivityDetailDialog({
    entry,
    open,
    onOpenChange,
    onUpdated,
}: CitizenActivityDetailDialogProps) {
    const [detail, setDetail] = React.useState<CitizenActivityDetail | null>(null)
    const [loading, setLoading] = React.useState(false)
    const [requestingMissing, setRequestingMissing] = React.useState(false)
    const [markingCompleted, setMarkingCompleted] = React.useState(false)
    const [previewDoc, setPreviewDoc] = React.useState<PreviewDoc>(null)

    const loadDetail = React.useCallback(async (id: string, isLiveRecord: boolean) => {
        if (!isLiveRecord) return null
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/citizen-activity/${id}`, {
                credentials: 'include',
            })
            if (!res.ok) throw new Error('Failed')
            const data = await res.json()
            return data.activity as CitizenActivityDetail
        } catch {
            toast.error('Failed to load activity detail')
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        if (!open || !entry) {
            setDetail(null)
            return
        }

        const isLiveRecord = Boolean(entry.userId)
        if (!isLiveRecord) {
            setDetail(buildFallbackDetail(entry))
            return
        }

        let cancelled = false
        void loadDetail(entry.id, true).then((loaded) => {
            if (cancelled) return
            setDetail(loaded ?? buildFallbackDetail(entry))
        })

        return () => {
            cancelled = true
        }
    }, [open, entry, loadDetail])

    const requestMissingDetails = async () => {
        if (!detail?.userId) return
        const missing = detail.missingOptionalFields ?? []
        if (missing.length === 0) {
            toast.message('This user already provided details, pictures, and videos')
            return
        }

        setRequestingMissing(true)
        try {
            const res = await fetch(
                `/api/admin/citizen-activity/${detail.id}/request-missing-info`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: missing }),
                },
            )
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(typeof data?.error === 'string' ? data.error : 'Request failed')
            }
            toast.success(
                `Reminder sent (${data.pushSent ? 'push' : 'no push'}, ${data.emailSent ? 'email' : 'no email'}, in-app)`,
            )
            const refreshed = await loadDetail(detail.id, true)
            if (refreshed) setDetail(refreshed)
            await onUpdated?.()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to send reminder')
        } finally {
            setRequestingMissing(false)
        }
    }

    const markCompleted = async () => {
        if (!detail?.userId) return
        setMarkingCompleted(true)
        try {
            const res = await fetch(`/api/admin/citizen-activity/${detail.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resolutionStatus: 'completed',
                    status: 'Resolved',
                }),
            })
            if (!res.ok) throw new Error('Update failed')
            toast.success('Marked as completed')
            const refreshed = await loadDetail(detail.id, true)
            if (refreshed) setDetail(refreshed)
            await onUpdated?.()
        } catch {
            toast.error('Failed to update activity')
        } finally {
            setMarkingCompleted(false)
        }
    }

    const active = detail ?? (entry ? buildFallbackDetail(entry) : null)
    if (!active) return null

    const meta = CITIZEN_ACTIVITY_CATEGORY_META[active.category]
    const pictures = active.pictures ?? []
    const videos = active.videos ?? []

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Citizen activity</DialogTitle>
                    </DialogHeader>

                    {loading && !detail ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    ) : (
                        <div className="space-y-4 text-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <span
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                                        style={{ backgroundColor: meta.tileColor }}
                                    >
                                        <Image
                                            src={meta.icon}
                                            alt=""
                                            width={18}
                                            height={18}
                                            className="h-5 w-5 object-contain"
                                        />
                                    </span>
                                    <div>
                                        <div className="font-semibold text-slate-900">{active.title}</div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                            <span className="tabular-nums">{active.displayTime}</span>
                                            {active.status ? (
                                                <Badge variant="secondary">{active.status}</Badge>
                                            ) : null}
                                            <span
                                                className={cn(
                                                    'rounded-full px-2 py-0.5 text-[10px] font-bold capitalize',
                                                    PRIORITY_STYLES[active.priority],
                                                )}
                                            >
                                                {active.priority}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <Badge
                                    className={cn(
                                        active.resolutionStatus === 'completed'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-amber-100 text-amber-900',
                                    )}
                                >
                                    {active.resolutionStatus === 'completed' ? 'Completed' : 'Pending'}
                                </Badge>
                            </div>

                            <DetailSection title="Citizen">
                                <dl className="grid gap-3 sm:grid-cols-2">
                                    <DetailRow label="Name" value={active.citizenName} />
                                    <DetailRow label="Phone" value={active.citizenPhone} />
                                    <DetailRow label="Email" value={active.userEmail} />
                                    <DetailRow label="Address" value={active.citizenAddress} />
                                </dl>
                            </DetailSection>

                            <DetailSection title="Report">
                                <dl className="space-y-3">
                                    <DetailRow label="Description" value={active.description || active.line1} />
                                    <DetailRow label="Additional details" value={active.details} />
                                    <DetailRow label="Location" value={active.location} />
                                </dl>
                            </DetailSection>

                            <DetailSection title="Responder action">
                                <p className="rounded-lg bg-slate-50 p-3 text-slate-600 leading-relaxed">
                                    {active.takeAction}
                                </p>
                            </DetailSection>

                            <DetailSection title="Media">
                                <div className="space-y-3 rounded-lg bg-slate-50 p-4">
                                    <div>
                                        <div className="font-medium text-slate-800">Pictures</div>
                                        {pictures.length > 0 ? (
                                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {pictures.map((pic, idx) => (
                                                    <button
                                                        key={pic.url + idx}
                                                        type="button"
                                                        onClick={() =>
                                                            setPreviewDoc({
                                                                title: 'Picture',
                                                                url: pic.url,
                                                                fileName: pic.fileName || `Picture ${idx + 1}`,
                                                            })
                                                        }
                                                        className="group relative block h-24 w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={pic.url}
                                                            alt={pic.fileName || 'Picture'}
                                                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                                            <Eye className="h-5 w-5 text-white" />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-0.5 text-slate-600">Not provided</p>
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-800">Videos</div>
                                        {videos.length > 0 ? (
                                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {videos.map((vid, idx) => (
                                                    <button
                                                        key={vid.url + idx}
                                                        type="button"
                                                        onClick={() =>
                                                            setPreviewDoc({
                                                                title: 'Video',
                                                                url: vid.url,
                                                                fileName: vid.fileName || `Video ${idx + 1}`,
                                                            })
                                                        }
                                                        className="group relative block h-24 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900"
                                                    >
                                                        {cloudinaryVideoPoster(vid.url) ? (
                                                            /* eslint-disable-next-line @next/next/no-img-element */
                                                            <img
                                                                src={cloudinaryVideoPoster(vid.url)}
                                                                alt=""
                                                                className="h-full w-full object-cover opacity-75"
                                                            />
                                                        ) : null}
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                            <Film className="h-6 w-6 text-white" />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-0.5 text-slate-600">Not provided</p>
                                        )}
                                    </div>

                                    {active.canRequestMissingInfo ? (
                                        (active.missingOptionalFields?.length ?? 0) > 0 ? (
                                            <div className="border-t pt-3 space-y-2">
                                                <p className="text-xs text-amber-700">
                                                    Missing:{' '}
                                                    {(active.missingOptionalFields ?? [])
                                                        .map((f) => MISSING_FIELD_LABELS[f] ?? f)
                                                        .join(', ')}
                                                </p>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    disabled={requestingMissing}
                                                    onClick={() => void requestMissingDetails()}
                                                >
                                                    {requestingMissing ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Send className="mr-2 h-4 w-4" />
                                                    )}
                                                    Request missing details (push, email &amp; in-app)
                                                </Button>
                                                {active.missingInfoRequestedAt ? (
                                                    <p className="text-xs text-slate-500">
                                                        Last requested{' '}
                                                        {new Date(active.missingInfoRequestedAt).toLocaleString()}
                                                    </p>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-emerald-700">
                                                All optional details were provided.
                                            </p>
                                        )
                                    ) : null}
                                </div>
                            </DetailSection>

                            {active.userId && active.resolutionStatus === 'pending' ? (
                                <div className="border-t pt-4">
                                    <Button
                                        disabled={markingCompleted}
                                        onClick={() => void markCompleted()}
                                    >
                                        {markingCompleted ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : null}
                                        Mark completed
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(previewDoc)} onOpenChange={(next) => { if (!next) setPreviewDoc(null) }}>
                <DialogContent className="max-w-3xl overflow-hidden p-0">
                    {previewDoc ? (
                        <>
                            <DialogHeader className="border-b px-6 py-4">
                                <DialogTitle>{previewDoc.title}</DialogTitle>
                                {previewDoc.fileName ? (
                                    <p className="text-xs text-slate-500">{previewDoc.fileName}</p>
                                ) : null}
                            </DialogHeader>
                            <div className="flex min-h-[240px] items-center justify-center bg-slate-950 p-4">
                                {/\.(mp4|mov|webm|m4v)(\?|$)/i.test(previewDoc.url) ? (
                                    <video
                                        src={previewDoc.url}
                                        controls
                                        autoPlay
                                        playsInline
                                        className="max-h-[60vh] w-full rounded-lg"
                                    />
                                ) : (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                        src={previewDoc.url}
                                        alt={previewDoc.fileName || previewDoc.title}
                                        className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain"
                                    />
                                )}
                            </div>
                            <div className="border-t px-6 py-3">
                                <a
                                    href={previewDoc.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#33375D] hover:underline"
                                >
                                    Open in original tab
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </div>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    )
}
