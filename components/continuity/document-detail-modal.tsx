'use client'

import React, { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { integrityPresentation } from '@/lib/constants/integrity-status'
import { INTEGRITY_TOOLTIPS } from '@/lib/constants/integrity-tooltips'
import { Loader2, ExternalLink, RefreshCw, Info, Files } from 'lucide-react'

export type ComponentScores = {
    content?: number | null
    name?: number | null
    quality?: number | null
    duplication?: number | null
}

export type DetailAttachment = {
    _id?: string
    fileName: string
    fileUrl: string
    planId: string
    planLabel: string
    aiIntegrityStatus?: string
    aiIntegrityScore?: number
    aiIntegritySummary?: string
    aiIntegrityAnalyzedAt?: string
    aiIntegrityComponents?: ComponentScores
}

type SimilarRow = {
    attachmentId: string
    fileName: string
    planId: string
    planLabel?: string
    similarity: number
    exactDuplicate: boolean
}

function resolveFileHref(fileUrl: string): string {
    const trimmed = fileUrl.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
    if (typeof window !== 'undefined') {
        const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
        return new URL(path, window.location.origin).href
    }
    return trimmed
}

function InfoDot({ label, text }: { label: string; text: string }) {
    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#33375D]/30"
                        aria-label={`About ${label}`}
                    >
                        <Info className="h-3.5 w-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-left leading-snug">
                    {text}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

const COMPONENT_ROWS: ReadonlyArray<{
    key: keyof ComponentScores
    label: string
    tooltip: string
}> = [
    { key: 'content', label: 'Content match', tooltip: INTEGRITY_TOOLTIPS.componentScores.content },
    { key: 'name', label: 'Filename match', tooltip: INTEGRITY_TOOLTIPS.componentScores.name },
    { key: 'quality', label: 'Text quality', tooltip: INTEGRITY_TOOLTIPS.componentScores.quality },
    { key: 'duplication', label: 'Uniqueness', tooltip: INTEGRITY_TOOLTIPS.componentScores.duplication },
]

function ComponentBar({
    label,
    tooltip,
    value,
}: {
    label: string
    tooltip: string
    value?: number | null
}) {
    const has = typeof value === 'number' && Number.isFinite(value)
    const pct = has ? Math.min(100, Math.max(0, value as number)) : 0
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    {label}
                    <InfoDot label={label} text={tooltip} />
                </span>
                <span className="text-xs font-black text-slate-900">{has ? Math.round(pct) : '—'}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                    className="h-full rounded-full bg-[#33375D] transition-all duration-700"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

export function DocumentDetailModal({
    open,
    attachment,
    analyzing,
    onClose,
    onReanalyze,
}: {
    open: boolean
    attachment: DetailAttachment | null
    analyzing: boolean
    onClose: () => void
    onReanalyze: () => void
}) {
    const [similar, setSimilar] = useState<SimilarRow[]>([])
    const [similarLoading, setSimilarLoading] = useState(false)

    const attachmentId = attachment?._id

    const loadSimilar = React.useCallback(async (id: string) => {
        setSimilarLoading(true)
        try {
            const res = await fetch(
                `/api/admin/continuity-plans/similar?attachmentId=${encodeURIComponent(id)}`,
                { cache: 'no-store' },
            )
            const body = await res.json().catch(() => ({}))
            setSimilar(res.ok && body.success && Array.isArray(body.data) ? (body.data as SimilarRow[]) : [])
        } catch {
            setSimilar([])
        } finally {
            setSimilarLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!open || !attachmentId) {
            setSimilar([])
            return
        }
        void loadSimilar(attachmentId)
    }, [open, attachmentId, loadSimilar, analyzing])

    if (!attachment) return null

    const integ = integrityPresentation(attachment.aiIntegrityStatus, attachment.aiIntegrityScore)
    const analyzed = Boolean(attachment.aiIntegrityAnalyzedAt || attachment.aiIntegrityStatus)
    const components = attachment.aiIntegrityComponents

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="break-all pr-6 text-lg font-black tracking-tight text-slate-900">
                        {attachment.fileName}
                    </DialogTitle>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {attachment.planLabel} · {attachment.planId}
                    </p>
                </DialogHeader>

                {/* Verdict header */}
                <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                    {analyzing ? (
                        <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                        </span>
                    ) : analyzed ? (
                        <span className={cn('inline-flex items-center gap-1 text-sm font-black uppercase tracking-widest', integ.labelColor)}>
                            {integ.label}
                            <InfoDot label="Status" text={INTEGRITY_TOOLTIPS.status} />
                        </span>
                    ) : (
                        <span className="text-sm font-black uppercase tracking-widest text-slate-400">Not analyzed</span>
                    )}
                    {analyzed && !analyzing ? (
                        <span className="inline-flex items-center gap-1 text-sm font-black text-slate-900">
                            Score {integ.pct} / 100
                            <InfoDot label="Score" text={INTEGRITY_TOOLTIPS.score} />
                        </span>
                    ) : null}
                </div>

                {/* Component bars */}
                {analyzed && components ? (
                    <div className="space-y-3 pt-1">
                        {COMPONENT_ROWS.map((row) => (
                            <ComponentBar
                                key={row.key}
                                label={row.label}
                                tooltip={row.tooltip}
                                value={components[row.key]}
                            />
                        ))}
                    </div>
                ) : null}

                {/* Summary */}
                <div className="space-y-1.5 pt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                        Summary
                        <InfoDot label="Summary" text={INTEGRITY_TOOLTIPS.summary} />
                    </span>
                    {attachment.aiIntegritySummary ? (
                        <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-slate-600">
                            {attachment.aiIntegritySummary}
                        </p>
                    ) : (
                        <p className="text-sm font-medium text-slate-400">
                            {analyzing ? 'Summary is being generated…' : 'No summary yet.'}
                        </p>
                    )}
                </div>

                {/* Similar files */}
                <div className="space-y-2 pt-1">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-500">
                        <Files className="h-3.5 w-3.5" /> Similar files
                    </span>
                    {similarLoading ? (
                        <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the vault…
                        </p>
                    ) : similar.length ? (
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                            {similar.map((s) => (
                                <div key={s.attachmentId} className="flex items-center gap-3 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-semibold text-slate-800" title={s.fileName}>
                                            {s.fileName}
                                        </div>
                                        <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                                            {s.planLabel ?? s.planId}
                                        </div>
                                    </div>
                                    {s.exactDuplicate ? (
                                        <span className="shrink-0 rounded-md bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-600">
                                            Exact duplicate
                                        </span>
                                    ) : null}
                                    <span className="shrink-0 text-xs font-black text-slate-900">
                                        {Math.round(s.similarity * 100)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm font-medium text-slate-400">No similar files found.</p>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={analyzing}
                        onClick={onReanalyze}
                        className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                        {analyzing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Re-analyze
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                            window.open(resolveFileHref(attachment.fileUrl), '_blank', 'noopener,noreferrer')
                        }
                        className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                        <ExternalLink className="mr-2 h-4 w-4" /> Open file
                    </Button>
                    <Button type="button" onClick={onClose} className="bg-[#33375D] text-white hover:bg-[#2B2F50]">
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
