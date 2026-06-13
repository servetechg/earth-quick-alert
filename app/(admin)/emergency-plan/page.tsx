'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    Edit,
    Loader2,
    Upload,
    FileText,
    Trash2,
    Plus,
    Folder,
    Search,
    Shield,
    Zap,
    CheckCircle,
    Sparkles,
    Download,
    Info,
} from 'lucide-react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { INTEGRITY_TOOLTIPS } from '@/lib/constants/integrity-tooltips'
import { integrityPresentation } from '@/lib/constants/integrity-status'
import { AdminPageShell } from '@/components/admin-page-shell'
import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageLoader } from '@/components/admin-page-loader'

type EmergencyAttachment = {
    _id?: string
    fileName: string
    fileUrl: string
    size: number
    uploadedAt: string | Date
    cloudinaryPublicId?: string
    cloudinaryResourceType?: 'image' | 'raw'
    aiIntegrityStatus?: string
    aiIntegrityScore?: number
    aiIntegritySummary?: string
    aiIntegrityAnalyzedAt?: string
}

type PlanCategory = 'response' | 'coop' | 'bcp' | 'compliance'
/** Subset accepted by the backend enum (excludes 'response'). */
type StoredPlanCategory = 'coop' | 'bcp' | 'compliance'

type EmergencyPlanDef = {
    id?: string
    label: string
    overview: string
    category?: PlanCategory | string
    steps: string[]
    attachments: EmergencyAttachment[]
}

type RowItem = EmergencyAttachment & { planId: string; planLabel: string }

const DOCUMENT_CATEGORY_META: ReadonlyArray<{
    key: PlanCategory
    name: string
    icon: typeof Zap
    color: string
    bg: string
}> = [
    { key: 'response', name: 'Response Plans', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { key: 'coop', name: 'COOP Protocols', icon: Shield, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { key: 'bcp', name: 'Business Continuity', icon: Folder, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { key: 'compliance', name: 'Compliance Vault', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
]

/** Fallback bucket for legacy plans created before category was a schema field. */
function inferCategoryFromPlanId(planId: string): PlanCategory {
    const id = planId.toLowerCase()
    if (
        /hurricane|earthquake|flood|wildfire|tornado|tsunami|severe|weather|national|dispatch|response|citizen|alert|evacuation/.test(
            id
        )
    ) {
        return 'response'
    }
    if (/staff|human|personnel|hr|employee|workforce|succession|essential|vital.?records|devolution/.test(id)) return 'coop'
    if (/telecom|communicat|it|network|technical|critical|system|data|supply|vendor|facility/.test(id)) return 'bcp'
    return 'compliance'
}

function resolveCategory(plan: { category?: PlanCategory | string } | undefined, planId: string): PlanCategory {
    const raw = plan?.category
    if (raw === 'coop' || raw === 'bcp' || raw === 'compliance') return raw
    return inferCategoryFromPlanId(planId)
}

function categoryIndex(cat: PlanCategory): number {
    return DOCUMENT_CATEGORY_META.findIndex((c) => c.key === cat)
}

/** Stored, user-selectable categories — excludes the synthetic 'response' bucket. */
const SELECTABLE_CATEGORIES = DOCUMENT_CATEGORY_META.filter((c) => c.key !== 'response')

/** Backend enum is `['coop','bcp','compliance']`; 'response' isn't stored — frontend infers it. */
function toStoredCategory(cat: PlanCategory): StoredPlanCategory | null {
    return cat === 'response' ? null : cat
}

function extensionFromFilename(name: string): string {
    const m = /\.([^.]+)$/i.exec(name.trim())
    return m ? m[1].toLowerCase() : ''
}

function fileMatrixLabel(fileName: string): string {
    const ext = extensionFromFilename(fileName)
    return ext ? ext.toUpperCase() : 'FILE'
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

function FieldTooltip({ label, text }: { label: string; text: string }) {
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

function normalizeAttachment(att: EmergencyAttachment): EmergencyAttachment {
    const rawId = att._id
    const idStr =
        typeof rawId === 'string' ? rawId : rawId != null ? String(rawId) : undefined

    let uploadedISO: string
    const up = att.uploadedAt as string | Date
    if (typeof up === 'string') {
        uploadedISO = up
    } else if (up instanceof Date) {
        uploadedISO = up.toISOString()
    } else {
        uploadedISO = new Date(String(up)).toISOString()
    }

    let aiAnalyzed: string | undefined
    const rawAi = (att as EmergencyAttachment & { aiIntegrityAnalyzedAt?: unknown }).aiIntegrityAnalyzedAt
    if (rawAi) {
        aiAnalyzed =
            typeof rawAi === 'string' ? rawAi : new Date(rawAi as string | Date).toISOString()
    }

    return {
        ...att,
        _id: idStr,
        uploadedAt: uploadedISO,
        aiIntegrityStatus: att.aiIntegrityStatus,
        aiIntegrityScore: att.aiIntegrityScore,
        aiIntegritySummary: att.aiIntegritySummary,
        aiIntegrityAnalyzedAt: aiAnalyzed,
    }
}

export default function EmergencyPlanPage() {
    const [plans, setPlans] = useState<Record<string, EmergencyPlanDef>>({})
    const [isLoading, setIsLoading] = useState(true)

    const [uploading, setUploading] = useState(false)
    const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([])
    const [uploadOpen, setUploadOpen] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const [search, setSearch] = useState('')
    const [selectedCategoryIdx, setSelectedCategoryIdx] = useState<number | null>(null)

    type AuditSummary = {
        summary: string
        findings: string[]
        posture: 'Resilient' | 'Steady' | 'At Risk'
        averageScore: number
        totals: { plans: number; attachments: number; analyzed: number }
        integrity: { compliant: number; underReview: number; nonCompliant: number; unanalyzed: number }
        generatedAt: string
        degraded?: boolean
    }
    const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null)
    const [auditLoading, setAuditLoading] = useState(false)

    const [editOpen, setEditOpen] = useState(false)
    const [editPlanId, setEditPlanId] = useState('')
    const [editPlanLabel, setEditPlanLabel] = useState('')
    const [editPlanOverview, setEditPlanOverview] = useState('')
    const [editPlanCategory, setEditPlanCategory] = useState<PlanCategory>('coop')
    const [editStepsText, setEditStepsText] = useState('')
    const [savingSteps, setSavingSteps] = useState(false)

    const [deleteTarget, setDeleteTarget] = useState<{ planId: string; attachmentId: string; fileName: string } | null>(
        null
    )
    const [deleting, setDeleting] = useState(false)

    const fetchPlans = async () => {
        try {
            const res = await fetch('/api/admin/continuity-plans')
            if (res.status === 401) {
                toast.error('Unauthorized')
                return
            }
            if (res.ok) {
                const data = await res.json()
                if (data.success && data.data) {
                    const next: Record<string, EmergencyPlanDef> = {}
                    for (const [k, v] of Object.entries(data.data as Record<string, EmergencyPlanDef>)) {
                        const p = v as EmergencyPlanDef
                        next[k] = {
                            ...p,
                            attachments: (p.attachments || []).map(normalizeAttachment),
                        }
                    }
                    setPlans(next)
                }
            }
        } catch (err) {
            console.error('Failed to fetch COOP plans:', err)
            toast.error('Failed to load COOP plans')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchPlans()
    }, [])

    const loadAuditSummary = async () => {
        try {
            const res = await fetch('/api/admin/continuity-plans/audit-summary', { cache: 'no-store' })
            const body = await res.json().catch(() => ({}))
            if (res.ok && body.success && body.data) setAuditSummary(body.data as AuditSummary)
        } catch (err) {
            console.error('Audit summary load failed:', err)
        }
    }

    const generateAuditSummary = async () => {
        setAuditLoading(true)
        try {
            const res = await fetch('/api/admin/continuity-plans/audit-summary', {
                method: 'POST',
                cache: 'no-store',
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok || !body.success) {
                throw new Error(body.error || 'Failed to generate audit summary')
            }
            if (body.data) {
                setAuditSummary(body.data as AuditSummary)
                toast.success('Continuity audit summary generated')
            }
        } catch (err) {
            console.error('Audit summary generate failed:', err)
            toast.error(err instanceof Error ? err.message : 'Failed to generate audit summary')
        } finally {
            setAuditLoading(false)
        }
    }

    useEffect(() => {
        if (isLoading) return
        loadAuditSummary()
    }, [isLoading])

    const planIdsSorted = useMemo(() => Object.keys(plans).sort((a, b) => a.localeCompare(b)), [plans])

    const flattenedRows = useMemo((): RowItem[] => {
        return Object.entries(plans).flatMap(([planId, p]) =>
            (p.attachments || []).map((att) => ({
                ...normalizeAttachment(att),
                planId,
                planLabel: p.label,
            }))
        )
    }, [plans])

    const documentCategories = useMemo(() => {
        const counts = DOCUMENT_CATEGORY_META.map(() => 0)
        const responseIdx = DOCUMENT_CATEGORY_META.findIndex((c) => c.key === 'response')
        for (const [planId, p] of Object.entries(plans)) {
            const n = (p.attachments || []).length
            if (!n) continue
            const idx = categoryIndex(resolveCategory(p, planId))
            if (idx >= 0) counts[idx] += n
        }
        if (responseIdx >= 0) {
            counts[responseIdx] = counts.reduce(
                (sum, value, i) => (i === responseIdx ? sum : sum + value),
                0
            )
        }
        return DOCUMENT_CATEGORY_META.map((c, i) => ({ ...c, count: counts[i] }))
    }, [plans])

    const visibleRows = useMemo(() => {
        const q = search.trim().toLowerCase()
        const selectedKey =
            selectedCategoryIdx !== null ? DOCUMENT_CATEGORY_META[selectedCategoryIdx]?.key : null
        return flattenedRows.filter((row) => {
            if (selectedKey && selectedKey !== 'response') {
                const plan = plans[row.planId]
                if (resolveCategory(plan, row.planId) !== selectedKey) {
                    return false
                }
            }
            if (!q) return true
            return (
                row.fileName.toLowerCase().includes(q) ||
                row.planLabel.toLowerCase().includes(q) ||
                row.planId.toLowerCase().includes(q)
            )
        })
    }, [flattenedRows, search, selectedCategoryIdx, plans])

    const handlePickFile = () => fileRef.current?.click()

    const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fl = e.target.files
        if (fl && fl.length) {
            setSelectedUploadFiles((prev) => {
                const merged = [...prev]
                const seen = new Set(prev.map((f) => `${f.name}|${f.size}`))
                for (const f of Array.from(fl)) {
                    const k = `${f.name}|${f.size}`
                    if (!seen.has(k)) {
                        merged.push(f)
                        seen.add(k)
                    }
                }
                return merged
            })
        }
        e.target.value = ''
    }

    const removeQueuedFile = (idx: number) => {
        setSelectedUploadFiles((prev) => prev.filter((_, i) => i !== idx))
    }

    const submitUpload = async () => {
        if (!selectedUploadFiles.length) {
            toast.info('Pick at least one continuity file')
            handlePickFile()
            return
        }
        setUploading(true)
        let attached = 0
        let created = 0
        const failed: string[] = []
        try {
            for (const file of selectedUploadFiles) {
                try {
                    const fd = new FormData()
                    fd.append('file', file)
                    const res = await fetch('/api/admin/continuity-plans', { method: 'POST', body: fd })
                    const body = await res.json().catch(() => ({}))
                    if (!res.ok) {
                        failed.push(`${file.name}: ${body.error || body.message || res.statusText}`)
                        continue
                    }
                    if (body.attachedToExistingPlan) attached++
                    else created++
                } catch (err) {
                    failed.push(`${file.name}: ${err instanceof Error ? err.message : 'network error'}`)
                }
            }
            if (created) toast.success(`Created ${created} new plan${created === 1 ? '' : 's'} from upload${created === 1 ? '' : 's'}`)
            if (attached) toast.success(`Attached ${attached} file${attached === 1 ? '' : 's'} to existing plan${attached === 1 ? '' : 's'}`)
            if (failed.length) toast.error(`${failed.length} upload${failed.length === 1 ? '' : 's'} failed — ${failed[0]}`)
            if (created + attached > 0) {
                setSelectedUploadFiles([])
                setUploadOpen(false)
                await fetchPlans()
            }
        } finally {
            setUploading(false)
        }
    }

    const openEditSteps = (row: RowItem) => {
        const p = plans[row.planId]
        const steps = p?.steps || []
        setEditPlanId(row.planId)
        setEditPlanLabel(p?.label || row.planLabel)
        setEditPlanOverview(p?.overview || '')
        setEditPlanCategory(resolveCategory(p, row.planId))
        setEditStepsText(steps.map((s) => s.trim()).join('\n'))
        setEditOpen(true)
    }

    const saveSteps = async () => {
        if (!editPlanId) return
        setSavingSteps(true)
        try {
            const steps = editStepsText
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            const current = plans[editPlanId]
            const currentCategory = resolveCategory(current, editPlanId)
            const stored = toStoredCategory(editPlanCategory)
            const trimmedLabel = editPlanLabel.trim()
            const trimmedOverview = editPlanOverview.trim()
            const patchPayload: Record<string, unknown> = {}
            if (trimmedLabel && trimmedLabel !== (current?.label || '')) patchPayload.label = trimmedLabel
            if (trimmedOverview !== (current?.overview || '')) patchPayload.overview = trimmedOverview
            if (editPlanCategory !== currentCategory && stored) patchPayload.category = stored
            if (Object.keys(patchPayload).length) {
                const patchRes = await fetch('/api/admin/continuity-plans', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planId: editPlanId, ...patchPayload }),
                })
                const patchBody = await patchRes.json().catch(() => ({}))
                if (!patchRes.ok) throw new Error(patchBody.error || 'Could not update plan')
            }
            const res = await fetch('/api/admin/continuity-plans/steps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: editPlanId, steps }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body.error || 'Could not save steps')
            toast.success('Plan updated')
            setEditOpen(false)
            await fetchPlans()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Could not save plan')
        } finally {
            setSavingSteps(false)
        }
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await fetch('/api/admin/continuity-plans/attachment', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planId: deleteTarget.planId,
                    attachmentId: deleteTarget.attachmentId,
                }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body.error || 'Delete failed')
            if (body.aiCleanupOk === false) {
                toast.warning('Attachment removed; AI vector cleanup will retry on next analysis.')
            } else {
                toast.success('Attachment purged')
            }
            setAuditSummary(null)
            setDeleteTarget(null)
            await fetchPlans()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Delete failed')
        } finally {
            setDeleting(false)
        }
    }

    if (isLoading) {
        return <AdminPageLoader />
    }

    return (
        <AdminPageShell>
            <input
                ref={fileRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.docx,.csv,.xlsx"
                onChange={onFileChosen}
            />

            <AdminPageHeader
                title="COOP / BC Plans"
                description="Continuity of Operations & Strategic Recovery — drop files in and the AI will classify, label, and file them into the right continuity bucket automatically."
                actions={
                    <Button
                        type="button"
                        onClick={() => setUploadOpen(true)}
                        className="flex h-12 gap-2 rounded-xl bg-[#33375D] px-6 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-[#2B2F50] active:scale-95"
                    >
                        <Plus size={18} /> Add Plans
                    </Button>
                }
            />

            {/* Categories Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {documentCategories.map((cat, i) => (
                    <Card
                        key={cat.name}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCategoryIdx((prev) => (prev === i ? null : i))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setSelectedCategoryIdx((prev) => (prev === i ? null : i))
                            }
                        }}
                        className={cn(
                            'p-6 bg-white border rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer group',
                            selectedCategoryIdx === i ? 'border-[#33375D] ring-2 ring-[#33375D]/15' : 'border-slate-200'
                        )}
                    >
                        <div
                            className={cn(
                                'inline-flex w-12 h-12 rounded-xl items-center justify-center mb-4',
                                cat.bg,
                                cat.color
                            )}
                        >
                            <cat.icon size={24} />
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">
                                    {cat.name}
                                </h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    Strategic Files
                                </p>
                            </div>
                            <span className="text-2xl font-black text-slate-900 group-hover:text-[#33375D] transition-colors">
                                {cat.count}
                            </span>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Main Content: File Explorer */}
            <Card className="bg-white border-slate-200 rounded-2xl shadow-sm overflow-hidden p-0 gap-0">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search continuity protocols..."
                            className="h-11 pl-11 rounded-xl bg-white border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-[#33375D]/10 focus:border-[#33375D]"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 justify-end">
                        <div className="hidden lg:flex h-11 px-4 bg-emerald-50 border border-emerald-100 rounded-xl items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest whitespace-nowrap">
                                Database Linked
                            </span>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    Resource Identifier
                                </th>
                                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    Category
                                </th>
                                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    File Type
                                </th>
                                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    Last Updated
                                </th>
                                <th className="px-6 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    <span className="inline-flex items-center justify-center gap-1.5">
                                        AI Integrity
                                        <FieldTooltip label="AI Integrity" text={INTEGRITY_TOOLTIPS.score} />
                                    </span>
                                </th>
                                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visibleRows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-sm font-medium text-slate-500">
                                        No continuity protocols indexed for this lens.
                                        {planIdsSorted.length === 0
                                            ? ' Click “Add Plans” to upload files — the AI will create plans for them.'
                                            : ''}
                                    </td>
                                </tr>
                            ) : (
                                visibleRows.map((doc) => {
                                    const integ = integrityPresentation(doc.aiIntegrityStatus, doc.aiIntegrityScore)
                                    let auditLabel = '—'
                                    try {
                                        auditLabel = `${formatDistanceToNow(new Date(doc.uploadedAt), { addSuffix: true })}`
                                    } catch {
                                        auditLabel = '—'
                                    }
                                    const attachmentId =
                                        typeof doc._id === 'string' ? doc._id : String((doc as { _id?: unknown })._id ?? '')
                                    
                                    const plan = plans[doc.planId]
                                    const categoryKey = resolveCategory(plan, doc.planId)
                                    const categoryMeta = DOCUMENT_CATEGORY_META.find(c => c.key === categoryKey)

                                    return (
                                        <tr key={`${doc.planId}-${attachmentId}`} className="group hover:bg-blue-50/30 transition-colors">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-11 h-11 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-[#33375D] group-hover:bg-white group-hover:shadow-sm transition-all">
                                                        <FileText size={20} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-sm font-black text-slate-900 group-hover:text-[#33375D] transition-colors block truncate">
                                                            {doc.fileName}
                                                        </span>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                                            {doc.planLabel} · {doc.planId}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className={cn(
                                                    "h-7 px-3 rounded-md border inline-flex items-center w-fit text-[10px] font-black uppercase tracking-widest border-transparent",
                                                    categoryMeta?.color, categoryMeta?.bg
                                                )}>
                                                    {categoryMeta?.name || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className="h-7 px-3 rounded-md bg-slate-100 border border-slate-200 inline-flex items-center w-fit text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                                    {fileMatrixLabel(doc.fileName)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-xs font-bold italic text-slate-400">
                                                {auditLabel}
                                            </td>
                                            <td className="px-6 py-5 text-center min-w-[200px]">
                                                <div className="flex flex-col items-center gap-1 max-w-[240px] mx-auto">
                                                    {!doc.aiIntegrityAnalyzedAt && !doc.aiIntegrityStatus ? (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                            Not analyzed
                                                            <FieldTooltip label="Not analyzed" text={INTEGRITY_TOOLTIPS.notAnalyzed} />
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span
                                                                className={cn(
                                                                    'inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em]',
                                                                    integ.labelColor,
                                                                )}
                                                            >
                                                                {integ.label}
                                                                <FieldTooltip label="Status" text={INTEGRITY_TOOLTIPS.status} />
                                                            </span>
                                                            <div className="flex w-32 items-center gap-1">
                                                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                                                    <div
                                                                        className={cn(
                                                                            'h-full transition-all duration-700',
                                                                            integ.barColor,
                                                                        )}
                                                                        style={{ width: `${integ.pct}%` }}
                                                                    />
                                                                </div>
                                                                <FieldTooltip label="Score" text={INTEGRITY_TOOLTIPS.score} />
                                                            </div>
                                                            {doc.aiIntegritySummary ? (
                                                                <p className="mt-1 line-clamp-4 whitespace-pre-line text-[10px] font-medium leading-snug text-slate-500">
                                                                    {doc.aiIntegritySummary}
                                                                </p>
                                                            ) : null}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        type="button"
                                                        title="Download / view"
                                                        size="icon"
                                                        onClick={() =>
                                                            window.open(
                                                                resolveFileHref(doc.fileUrl),
                                                                '_blank',
                                                                'noopener,noreferrer'
                                                            )
                                                        }
                                                        className="h-9 w-9 bg-[#33375D]/10 text-[#33375D] hover:bg-[#33375D] hover:text-white rounded-lg transition-colors"
                                                    >
                                                        <Download size={15} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        title="Edit protocol steps"
                                                        size="icon"
                                                        onClick={() => openEditSteps(doc)}
                                                        className="h-9 w-9 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors"
                                                    >
                                                        <Edit size={15} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        title="Delete attachment"
                                                        size="icon"
                                                        disabled={!attachmentId}
                                                        onClick={() =>
                                                            setDeleteTarget({
                                                                planId: doc.planId,
                                                                attachmentId,
                                                                fileName: doc.fileName,
                                                            })
                                                        }
                                                        className="h-9 w-9 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={15} />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* AI Intelligence Note */}
            <Card className="bg-white border-slate-200 p-8 rounded-2xl shadow-sm flex flex-col lg:flex-row gap-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 text-[#33375D]/5 grayscale group-hover:grayscale-0 transition-all duration-1000">
                    <Sparkles size={140} />
                </div>
                <div className="w-16 h-16 bg-[#33375D] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#33375D]/20 shrink-0 relative z-10">
                    <Sparkles size={28} />
                </div>
                <div className="relative z-10 flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">
                            AI-Driven Continuity Audit
                        </h4>
                        <FieldTooltip label="Continuity audit" text={INTEGRITY_TOOLTIPS.audit.summary} />
                        {auditSummary ? (
                            <span
                                className={cn(
                                    'flex h-6 items-center gap-1 rounded-full border px-2.5 text-[9px] font-black uppercase tracking-[0.2em]',
                                    auditSummary.posture === 'Resilient' && 'border-emerald-100 bg-emerald-50 text-emerald-600',
                                    auditSummary.posture === 'Steady' && 'border-blue-100 bg-blue-50 text-blue-600',
                                    auditSummary.posture === 'At Risk' && 'border-amber-100 bg-amber-50 text-amber-600',
                                )}
                            >
                                Posture · {auditSummary.posture}
                                <FieldTooltip label="Posture" text={INTEGRITY_TOOLTIPS.audit.posture} />
                            </span>
                        ) : null}
                        {auditSummary && auditSummary.totals.plans > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Avg integrity · {auditSummary.averageScore} / 100 · {auditSummary.totals.attachments} file
                                {auditSummary.totals.attachments === 1 ? '' : 's'} across {auditSummary.totals.plans} plan
                                {auditSummary.totals.plans === 1 ? '' : 's'}
                                <FieldTooltip label="Average score" text={INTEGRITY_TOOLTIPS.audit.averageScore} />
                            </span>
                        ) : null}
                        <Button
                            type="button"
                            size="sm"
                            disabled={auditLoading || planIdsSorted.length === 0}
                            onClick={() => void generateAuditSummary()}
                            className="ml-auto h-9 gap-2 rounded-lg bg-[#33375D] px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-[#2B2F50]"
                        >
                            {auditLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                            )}
                            Generate Audit Summary
                        </Button>
                    </div>

                    {auditSummary?.degraded ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                            {INTEGRITY_TOOLTIPS.audit.degraded}
                        </p>
                    ) : null}

                    {auditLoading && !auditSummary ? (
                        <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-5xl flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[#33375D]" /> Synthesizing continuity audit…
                        </p>
                    ) : auditSummary ? (
                        <>
                            <p className="whitespace-pre-line text-sm font-medium text-slate-600 leading-relaxed max-w-5xl">
                                {auditSummary.summary}
                            </p>
                            {auditSummary.findings.length ? (
                                <ul className="space-y-2 max-w-5xl">
                                    {auditSummary.findings.map((f, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-3 text-sm font-medium text-slate-500 leading-relaxed"
                                        >
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#33375D] shrink-0" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </>
                    ) : (
                        <p className="max-w-5xl text-sm font-medium leading-relaxed text-slate-500">
                            Upload continuity plans, then click Generate Audit Summary for an AI-written inventory health report.
                        </p>
                    )}

                    {auditSummary?.generatedAt ? (
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">
                            Updated {(() => {
                                try {
                                    return formatDistanceToNow(new Date(auditSummary.generatedAt), { addSuffix: true })
                                } catch {
                                    return ''
                                }
                            })()}
                            {auditLoading ? ' · refreshing…' : ''}
                        </span>
                    ) : null}
                </div>
            </Card>

            <Dialog
                open={uploadOpen}
                onOpenChange={(o) => {
                    if (uploading) return
                    setUploadOpen(o)
                }}
            >
                <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="tracking-tight font-black text-lg text-slate-900">Add continuity plans</DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Drop one or more PDF / DOCX / CSV / XLSX files. The AI reads each file, classifies it into a
                            continuity bucket, and either creates a new plan or attaches the file to an existing one.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2 space-y-4">
                        <button
                            type="button"
                            onClick={handlePickFile}
                            disabled={uploading}
                            className="group w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-slate-500 transition hover:border-[#33375D]/40 hover:bg-slate-50 disabled:opacity-60"
                        >
                            <span className="w-11 h-11 rounded-xl bg-white border border-slate-200 inline-flex items-center justify-center text-[#33375D] shadow-sm group-hover:shadow-md transition">
                                <Upload size={18} />
                            </span>
                            <span className="text-sm font-black uppercase tracking-widest text-slate-700">
                                {selectedUploadFiles.length ? 'Add more files' : 'Browse files'}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                                PDF · DOCX · CSV · XLSX — multiple files supported
                            </span>
                        </button>

                        {selectedUploadFiles.length ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Queued · {selectedUploadFiles.length} file{selectedUploadFiles.length === 1 ? '' : 's'}
                                    </span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={uploading}
                                        onClick={() => setSelectedUploadFiles([])}
                                        className="h-7 border-slate-200 bg-white text-[10px] uppercase tracking-widest text-slate-700 hover:bg-slate-50"
                                    >
                                        Clear
                                    </Button>
                                </div>
                                <div className="max-h-[220px] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
                                    {selectedUploadFiles.map((f, i) => (
                                        <div
                                            key={`${f.name}-${i}`}
                                            className="flex items-center gap-3 px-3 py-2"
                                        >
                                            <span className="w-8 h-8 rounded-md bg-slate-50 border border-slate-100 inline-flex items-center justify-center text-slate-400 shrink-0">
                                                <FileText size={14} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-semibold text-slate-800 truncate" title={f.name}>
                                                    {f.name}
                                                </div>
                                                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                                                    {fileMatrixLabel(f.name)} · {(f.size / 1024).toFixed(1)} KB
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeQueuedFile(i)}
                                                disabled={uploading}
                                                aria-label={`Remove ${f.name}`}
                                                className="h-7 w-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center shrink-0"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            variant="outline"
                            type="button"
                            disabled={uploading}
                            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            onClick={() => setUploadOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={uploading || !selectedUploadFiles.length}
                            onClick={submitUpload}
                            className="bg-[#33375D] text-white hover:bg-[#2B2F50] disabled:opacity-60"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Filing…
                                </>
                            ) : (
                                <>
                                    <Upload size={14} className="mr-2" />
                                    Upload {selectedUploadFiles.length > 1 ? `(${selectedUploadFiles.length})` : selectedUploadFiles.length === 1 ? '(1)' : ''}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="tracking-tight font-black text-lg text-slate-900">Edit plan — {editPlanLabel}</DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Fix any field the AI got wrong, refine the bucket, and add operator steps. Plan ID
                            (<span className="font-mono text-slate-700">{editPlanId}</span>) stays fixed because attachments are pinned to it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1 max-h-[60vh] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Display label</label>
                                <Input
                                    value={editPlanLabel}
                                    onChange={(e) => setEditPlanLabel(e.target.value)}
                                    placeholder="Human-readable continuity title"
                                    className="rounded-lg border-slate-200 bg-white text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Continuity bucket</label>
                                <select
                                    value={editPlanCategory === 'response' ? 'coop' : editPlanCategory}
                                    onChange={(e) => setEditPlanCategory(e.target.value as PlanCategory)}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-[#33375D]"
                                >
                                    {SELECTABLE_CATEGORIES.map((c) => (
                                        <option key={c.key} value={c.key}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Overview</label>
                            <Textarea
                                value={editPlanOverview}
                                onChange={(e) => setEditPlanOverview(e.target.value)}
                                rows={3}
                                placeholder="Short purpose statement for this plan"
                                className="rounded-lg border-slate-200 bg-white text-sm resize-none"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Protocol steps</label>
                            <Textarea
                                value={editStepsText}
                                onChange={(e) => setEditStepsText(e.target.value)}
                                rows={10}
                                placeholder="One actionable step per line"
                                className="rounded-lg border-slate-200 bg-white text-sm resize-none font-medium"
                            />
                            <p className="text-[10px] text-slate-500">One actionable step per line. Appears for operators referencing this plan.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            type="button"
                            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            onClick={() => setEditOpen(false)}
                        >
                            Close
                        </Button>
                        <Button type="button" disabled={savingSteps} className="bg-[#33375D] text-white hover:bg-[#2B2F50]" onClick={saveSteps}>
                            {savingSteps ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent className="border-slate-200 bg-white text-slate-900">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-black tracking-tight text-slate-900">Remove continuity attachment?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500 text-sm leading-relaxed">
                            This removes <strong className="text-slate-900">{deleteTarget?.fileName}</strong> from the continuity dossier — the backing
                            object is revoked from encrypted storage immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900">
                            Cancel
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            className="bg-rose-600 hover:bg-rose-700 text-white"
                            disabled={deleting}
                            onClick={() => confirmDelete()}
                        >
                            {deleting ? 'Removing…' : 'Confirm remove'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminPageShell>
    )
}
