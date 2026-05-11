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
} from 'lucide-react'
import { AdminPageShell } from '@/components/admin-page-shell'
import { AdminPageHeader } from '@/components/admin-page-header'

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

/** Maps OpenAI integrity status + score to the dashboard bar (score = fill width %). */
function integrityPresentation(status: string | undefined, score: number | undefined) {
    const s = status || 'Reviewing'
    const pct = Math.min(100, Math.max(0, typeof score === 'number' && !Number.isNaN(score) ? score : 0))
    let labelColor = 'text-blue-500'
    let barColor = 'bg-blue-500'
    if (s === 'In Sync') {
        labelColor = 'text-emerald-500'
        barColor = 'bg-emerald-500'
    } else if (s === 'Deviation Found') {
        labelColor = 'text-red-500'
        barColor = 'bg-red-500'
    }
    return { labelColor, barColor, pct }
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
    const [uploadTargetPlanId, setUploadTargetPlanId] = useState('')
    const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const [search, setSearch] = useState('')
    const [selectedCategoryIdx, setSelectedCategoryIdx] = useState<number | null>(null)

    const [newPlanOpen, setNewPlanOpen] = useState(false)
    const [newPlanId, setNewPlanId] = useState('')
    const [newPlanLabel, setNewPlanLabel] = useState('')
    const [newPlanOverview, setNewPlanOverview] = useState('')
    const [newPlanCategory, setNewPlanCategory] = useState<PlanCategory>('coop')
    const [savingPlan, setSavingPlan] = useState(false)

    type BulkRow = {
        planId: string
        label: string
        category: PlanCategory
        overview: string
    }

    const emptyBulkRow = (): BulkRow => ({ planId: '', label: '', category: 'coop', overview: '' })

    const [bulkOpen, setBulkOpen] = useState(false)
    const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow()])
    const [bulkRunning, setBulkRunning] = useState(false)

    type AuditSummary = {
        summary: string
        findings: string[]
        posture: 'Resilient' | 'Steady' | 'At Risk'
        averageScore: number
        totals: { plans: number; attachments: number; analyzed: number }
        integrity: { inSync: number; reviewing: number; deviation: number; unanalyzed: number }
        generatedAt: string
    }
    const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null)
    const [auditLoading, setAuditLoading] = useState(false)

    const [editOpen, setEditOpen] = useState(false)
    const [editPlanId, setEditPlanId] = useState('')
    const [editPlanLabel, setEditPlanLabel] = useState('')
    const [editPlanCategory, setEditPlanCategory] = useState<PlanCategory>('coop')
    const [editStepsText, setEditStepsText] = useState('')
    const [savingSteps, setSavingSteps] = useState(false)

    const [deleteTarget, setDeleteTarget] = useState<{ planId: string; attachmentId: string; fileName: string } | null>(
        null
    )
    const [deleting, setDeleting] = useState(false)

    const fetchPlans = async () => {
        try {
            const res = await fetch('/api/admin/emergency-plans')
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
            const res = await fetch('/api/admin/emergency-plans/audit-summary', { cache: 'no-store' })
            const body = await res.json().catch(() => ({}))
            if (res.ok && body.success && body.data) setAuditSummary(body.data as AuditSummary)
        } catch (err) {
            console.error('Audit summary load failed:', err)
        }
    }

    const refreshAuditSummary = async () => {
        setAuditLoading(true)
        try {
            const res = await fetch('/api/admin/emergency-plans/audit-summary', {
                method: 'POST',
                cache: 'no-store',
            })
            const body = await res.json().catch(() => ({}))
            if (res.ok && body.success && body.data) setAuditSummary(body.data as AuditSummary)
        } catch (err) {
            console.error('Audit summary refresh failed:', err)
        } finally {
            setAuditLoading(false)
        }
    }

    useEffect(() => {
        if (isLoading) return
        loadAuditSummary()
    }, [isLoading])

    const planIdsSorted = useMemo(() => Object.keys(plans).sort((a, b) => a.localeCompare(b)), [plans])

    useEffect(() => {
        if (!uploadTargetPlanId && planIdsSorted.length) {
            setUploadTargetPlanId(planIdsSorted[0])
        }
    }, [planIdsSorted, uploadTargetPlanId])

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
        const f = e.target.files?.[0]
        setSelectedUploadFile(f || null)
        e.target.value = ''
    }

    const submitUpload = async () => {
        if (!uploadTargetPlanId) {
            toast.error('Choose a continuity plan bucket first')
            return
        }
        if (!selectedUploadFile) {
            toast.info('Pick a protocol file')
            handlePickFile()
            return
        }
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('planId', uploadTargetPlanId)
            fd.append('file', selectedUploadFile)
            const res = await fetch('/api/admin/emergency-plans', { method: 'POST', body: fd })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(body.error || body.message || 'Upload failed')
            }
            toast.success('File synced to continuity vault')
            setSelectedUploadFile(null)
            await fetchPlans()
            refreshAuditSummary()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Upload failed')
        } finally {
            setUploading(false)
        }
    }

    const openEditSteps = (row: RowItem) => {
        const p = plans[row.planId]
        const steps = p?.steps || []
        setEditPlanId(row.planId)
        setEditPlanLabel(p?.label || row.planLabel)
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
            const currentCategory = resolveCategory(plans[editPlanId], editPlanId)
            const stored = toStoredCategory(editPlanCategory)
            if (editPlanCategory !== currentCategory && stored) {
                const catRes = await fetch('/api/admin/emergency-plans', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planId: editPlanId, category: stored }),
                })
                const catBody = await catRes.json().catch(() => ({}))
                if (!catRes.ok) throw new Error(catBody.error || 'Could not update category')
            }
            const res = await fetch('/api/admin/emergency-plans/steps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: editPlanId, steps }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body.error || 'Could not save steps')
            toast.success('Protocol steps serialized')
            setEditOpen(false)
            await fetchPlans()
            refreshAuditSummary()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Could not save steps')
        } finally {
            setSavingSteps(false)
        }
    }

    const PLAN_ID_REGEX = /^[a-z0-9][a-z0-9-_]*$/i

    const updateBulkRow = (index: number, patch: Partial<BulkRow>) => {
        setBulkRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    }

    const addBulkRow = () => setBulkRows((prev) => [...prev, emptyBulkRow()])

    const removeBulkRow = (index: number) => {
        setBulkRows((prev) => (prev.length <= 1 ? [emptyBulkRow()] : prev.filter((_, i) => i !== index)))
    }

    const submitBulkPlans = async () => {
        const rows = bulkRows
            .map((r) => ({
                planId: r.planId.trim(),
                label: r.label.trim(),
                category: r.category,
                overview: r.overview.trim(),
            }))
            .filter((r) => r.planId || r.label || r.overview)

        if (!rows.length) {
            toast.info('Add at least one plan row.')
            return
        }

        for (const r of rows) {
            if (!r.planId) {
                toast.error('Each row needs a Plan ID slug.')
                return
            }
            if (!PLAN_ID_REGEX.test(r.planId)) {
                toast.error(`Invalid Plan ID slug: "${r.planId}"`)
                return
            }
            if (!r.label) {
                toast.error(`Plan "${r.planId}" needs a display label.`)
                return
            }
        }

        const seen = new Set<string>()
        for (const r of rows) {
            const key = r.planId.toLowerCase()
            if (seen.has(key)) {
                toast.error(`Duplicate plan ID in rows: "${r.planId}"`)
                return
            }
            seen.add(key)
        }

        setBulkRunning(true)
        let created = 0
        const failed: string[] = []
        try {
            for (const row of rows) {
                const stored = toStoredCategory(row.category)
                const payload: Record<string, unknown> = {
                    planId: row.planId,
                    label: row.label,
                    overview: row.overview,
                }
                if (stored) payload.category = stored
                try {
                    const res = await fetch('/api/admin/emergency-plans', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    })
                    const body = await res.json().catch(() => ({}))
                    if (!res.ok) {
                        failed.push(`${row.planId}: ${body.error || res.statusText}`)
                    } else {
                        created++
                    }
                } catch (e) {
                    failed.push(`${row.planId}: ${e instanceof Error ? e.message : 'network error'}`)
                }
            }
            if (created) toast.success(`Created/updated ${created} plan${created === 1 ? '' : 's'}`)
            if (failed.length) toast.error(`${failed.length} row${failed.length === 1 ? '' : 's'} failed — ${failed[0]}`)
            if (created && !failed.length) {
                setBulkOpen(false)
                setBulkRows([emptyBulkRow()])
            }
            await fetchPlans()
            if (created) refreshAuditSummary()
        } finally {
            setBulkRunning(false)
        }
    }

    const submitNewPlan = async () => {
        setSavingPlan(true)
        try {
            const stored = toStoredCategory(newPlanCategory)
            const payload: Record<string, unknown> = {
                planId: newPlanId.trim(),
                label: newPlanLabel.trim(),
                overview: newPlanOverview.trim(),
            }
            if (stored) payload.category = stored
            const res = await fetch('/api/admin/emergency-plans', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body.error || 'Could not create plan')
            toast.success('Continuity framework registered')
            setNewPlanOpen(false)
            setNewPlanId('')
            setNewPlanLabel('')
            setNewPlanOverview('')
            setNewPlanCategory('coop')
            await fetchPlans()
            refreshAuditSummary()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Could not create plan')
        } finally {
            setSavingPlan(false)
        }
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await fetch('/api/admin/emergency-plans/attachment', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planId: deleteTarget.planId,
                    attachmentId: deleteTarget.attachmentId,
                }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body.error || 'Delete failed')
            toast.success('Attachment purged')
            setDeleteTarget(null)
            await fetchPlans()
            refreshAuditSummary()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Delete failed')
        } finally {
            setDeleting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[#33375D]" />
                    <p className="text-slate-500 font-bold animate-pulse">Loading continuity plans...</p>
                </div>
            </div>
        )
    }

    return (
        <AdminPageShell>
            <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.csv,.xlsx"
                onChange={onFileChosen}
            />

            <AdminPageHeader
                title="COOP / BC Plans"
                description="Continuity of Operations & Strategic Recovery — manage continuity frameworks, attach protocol files, and review AI integrity audits."
                actions={
                    <>
                        <Button
                            type="button"
                            onClick={() => setBulkOpen(true)}
                            variant="outline"
                            className="flex h-12 gap-2 rounded-xl border-slate-200 bg-white px-6 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                        >
                            <Upload size={16} /> Bulk Plan
                        </Button>
                        <Button
                            type="button"
                            onClick={() => setNewPlanOpen(true)}
                            className="flex h-12 gap-2 rounded-xl bg-[#33375D] px-6 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-[#2B2F50] active:scale-95"
                        >
                            <Plus size={18} /> New Plan
                        </Button>
                    </>
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
                        <div className="flex flex-wrap gap-2 items-center px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                                Attach to plan
                            </span>
                            <select
                                value={uploadTargetPlanId}
                                onChange={(e) => setUploadTargetPlanId(e.target.value)}
                                className="h-9 min-w-[140px] rounded-lg bg-white border border-slate-200 px-3 text-xs font-semibold text-slate-700 focus:border-[#33375D] outline-none"
                            >
                                {planIdsSorted.length === 0 ? (
                                    <option value="">No plans loaded</option>
                                ) : (
                                    planIdsSorted.map((pid) => (
                                        <option key={pid} value={pid}>
                                            {pid}
                                        </option>
                                    ))
                                )}
                            </select>
                            <Button
                                type="button"
                                onClick={handlePickFile}
                                variant="outline"
                                className="h-9 px-4 rounded-lg border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                                Browse
                            </Button>
                            {selectedUploadFile ? (
                                <span className="text-[11px] font-medium text-slate-500 truncate max-w-[140px]" title={selectedUploadFile.name}>
                                    {selectedUploadFile.name}
                                </span>
                            ) : null}
                            <Button
                                type="button"
                                disabled={uploading || !planIdsSorted.length}
                                onClick={submitUpload}
                                className="h-9 px-4 rounded-lg bg-[#33375D] text-xs font-bold text-white hover:bg-[#2B2F50]"
                            >
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload'}
                            </Button>
                        </div>
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
                                    File Type
                                </th>
                                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    Last Updated
                                </th>
                                <th className="px-6 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    AI Integrity
                                </th>
                                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visibleRows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-sm font-medium text-slate-500">
                                        No continuity protocols indexed for this lens.
                                        {planIdsSorted.length === 0
                                            ? ' Create a plan framework or ingest files above.'
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
                                                <span className="h-7 px-3 rounded-md bg-slate-100 border border-slate-200 inline-flex items-center w-fit text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                                    {fileMatrixLabel(doc.fileName)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-xs font-bold italic text-slate-400">
                                                {auditLabel}
                                            </td>
                                            <td className="px-6 py-5 text-center min-w-[200px]">
                                                <div
                                                    className="flex flex-col items-center gap-1 max-w-[240px] mx-auto"
                                                    title={
                                                        doc.aiIntegritySummary ||
                                                        (!doc.aiIntegrityAnalyzedAt && !doc.aiIntegrityStatus
                                                            ? 'AI integrity runs when you upload. Re-upload this file to score it.'
                                                            : 'OpenAI COOP integrity — PDF, DOCX, CSV, XLSX.')
                                                    }
                                                >
                                                    {!doc.aiIntegrityAnalyzedAt && !doc.aiIntegrityStatus ? (
                                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                            Not analyzed
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span
                                                                className={cn(
                                                                    'text-[9px] font-black uppercase tracking-[0.2em]',
                                                                    integ.labelColor
                                                                )}
                                                            >
                                                                {doc.aiIntegrityStatus || 'Reviewing'}
                                                            </span>
                                                            <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        'h-full transition-all duration-700',
                                                                        integ.barColor
                                                                    )}
                                                                    style={{ width: `${integ.pct}%` }}
                                                                />
                                                            </div>
                                                            {doc.aiIntegritySummary ? (
                                                                <p className="text-[10px] font-medium text-slate-500 leading-snug line-clamp-2 mt-1">
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
                <div className="relative z-10 space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">AI-Driven Continuity Audit</h4>
                        {auditSummary ? (
                            <span
                                className={cn(
                                    'h-6 px-2.5 rounded-full border text-[9px] font-black uppercase tracking-[0.2em] flex items-center',
                                    auditSummary.posture === 'Resilient' && 'bg-emerald-50 border-emerald-100 text-emerald-600',
                                    auditSummary.posture === 'Steady' && 'bg-blue-50 border-blue-100 text-blue-600',
                                    auditSummary.posture === 'At Risk' && 'bg-amber-50 border-amber-100 text-amber-600',
                                )}
                            >
                                Posture · {auditSummary.posture}
                            </span>
                        ) : null}
                        {auditSummary && auditSummary.totals.plans > 0 ? (
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Avg integrity · {auditSummary.averageScore} / 100 · {auditSummary.totals.attachments} file{auditSummary.totals.attachments === 1 ? '' : 's'} across {auditSummary.totals.plans} plan{auditSummary.totals.plans === 1 ? '' : 's'}
                            </span>
                        ) : null}
                    </div>

                    {auditLoading && !auditSummary ? (
                        <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-5xl flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[#33375D]" /> Synthesizing continuity audit…
                        </p>
                    ) : auditSummary ? (
                        <>
                            <p className="text-sm font-medium text-slate-600 leading-relaxed max-w-5xl">
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
                        <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-5xl">
                            Add a continuity plan to generate an AI audit of your inventory.
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

            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="tracking-tight font-black text-lg text-slate-900">Bulk continuity plan</DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Add as many continuity plans as you need in one shot. Each row creates (or updates) a plan with its
                            Plan ID, label, category, and overview. Existing attachments and steps are preserved.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex items-center justify-between gap-2 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {bulkRows.length} plan{bulkRows.length === 1 ? '' : 's'}
                        </span>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setBulkRows([emptyBulkRow()])}
                            className="h-7 border-slate-200 bg-white text-[10px] uppercase tracking-widest text-slate-700 hover:bg-slate-50"
                        >
                            Reset
                        </Button>
                    </div>

                    <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
                        {bulkRows.map((row, idx) => (
                            <div
                                key={idx}
                                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Plan #{idx + 1}
                                    </span>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => removeBulkRow(idx)}
                                        title="Remove row"
                                        className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                                    <div className="sm:col-span-5 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Plan ID slug</label>
                                        <Input
                                            value={row.planId}
                                            onChange={(e) => updateBulkRow(idx, { planId: e.target.value })}
                                            placeholder="e.g. pandemic-coop-plan"
                                            className="rounded-lg border-slate-200 bg-white font-mono text-xs"
                                        />
                                    </div>
                                    <div className="sm:col-span-7 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Display label</label>
                                        <Input
                                            value={row.label}
                                            onChange={(e) => updateBulkRow(idx, { label: e.target.value })}
                                            placeholder="Human-readable continuity title"
                                            className="rounded-lg border-slate-200 bg-white text-xs"
                                        />
                                    </div>
                                    <div className="sm:col-span-5 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category</label>
                                        <select
                                            value={row.category}
                                            onChange={(e) => updateBulkRow(idx, { category: e.target.value as PlanCategory })}
                                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-[#33375D]"
                                        >
                                            {SELECTABLE_CATEGORIES.map((c) => (
                                                <option key={c.key} value={c.key}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="sm:col-span-7 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Overview</label>
                                        <Textarea
                                            value={row.overview}
                                            onChange={(e) => updateBulkRow(idx, { overview: e.target.value })}
                                            rows={2}
                                            placeholder="Short purpose statement for this plan"
                                            className="rounded-lg border-slate-200 bg-white text-xs resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}

                        <Button
                            type="button"
                            variant="outline"
                            onClick={addBulkRow}
                            className="w-full h-10 border-dashed border-slate-300 bg-white text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:text-slate-900 gap-2"
                        >
                            <Plus size={14} /> Add another plan
                        </Button>
                    </div>

                    <p className="text-[10px] text-slate-500 pt-2">
                        Existing Plan IDs are <strong className="text-slate-700">updated</strong>; new ones are
                        <strong className="text-slate-700"> created</strong>. Steps and attachments are not affected.
                    </p>

                    <DialogFooter className="gap-3">
                        <Button
                            variant="outline"
                            type="button"
                            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            onClick={() => setBulkOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={bulkRunning}
                            className="bg-[#33375D] text-white hover:bg-[#2B2F50]"
                            onClick={submitBulkPlans}
                        >
                            {bulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create / update plans'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
                <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="tracking-tight font-black text-lg text-slate-900">Register continuity framework</DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Create a keyed plan vault you can attach files to. Use lowercase slug identifiers (hyphens encouraged).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Plan ID slug</label>
                            <Input
                                value={newPlanId}
                                onChange={(e) => setNewPlanId(e.target.value)}
                                placeholder="e.g. regional-power-outage-plan"
                                className="rounded-lg border-slate-200 bg-white font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Display label</label>
                            <Input
                                value={newPlanLabel}
                                onChange={(e) => setNewPlanLabel(e.target.value)}
                                placeholder="Human-readable continuity title"
                                className="rounded-lg border-slate-200 bg-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Continuity bucket</label>
                            <select
                                value={newPlanCategory}
                                onChange={(e) => setNewPlanCategory(e.target.value as PlanCategory)}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-[#33375D]"
                            >
                                {SELECTABLE_CATEGORIES.map((c) => (
                                    <option key={c.key} value={c.key}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-500">Drives the dashboard counts (Response, COOP, BCP, Compliance).</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Overview</label>
                            <Textarea
                                value={newPlanOverview}
                                onChange={(e) => setNewPlanOverview(e.target.value)}
                                rows={4}
                                className="rounded-lg border-slate-200 bg-white text-sm resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            type="button"
                            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            onClick={() => setNewPlanOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={savingPlan}
                            className="bg-[#33375D] text-white hover:bg-[#2B2F50]"
                            onClick={submitNewPlan}
                        >
                            {savingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create vault'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="tracking-tight font-black text-lg text-slate-900">Protocol steps — {editPlanLabel}</DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            One actionable step per line. These checkpoints appear for operators referencing this continuity plan bucket (
                            <span className="font-mono text-slate-700">{editPlanId}</span>).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 pb-2">
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
                    <Textarea
                        value={editStepsText}
                        onChange={(e) => setEditStepsText(e.target.value)}
                        rows={14}
                        className="rounded-lg border-slate-200 bg-white text-sm resize-none font-medium"
                    />
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
                            {savingSteps ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save steps'}
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
