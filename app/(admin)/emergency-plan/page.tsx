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
} from 'lucide-react'

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
            <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-[#0A0B10]">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <Loader2 className="w-16 h-16 animate-spin text-[#33375D]" />
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-blue-400">
                            PLAN
                        </div>
                    </div>
                    <p className="font-black text-xs uppercase tracking-[0.4em] text-slate-500 animate-pulse">
                        Synchronizing Planning Database...
                    </p>
                </div>
            </div>
        )
    }

    return (
        <main className="min-h-screen bg-[#0A0B10] p-8 lg:p-12 space-y-12 overflow-hidden relative">
            <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.csv,.xlsx"
                onChange={onFileChosen}
            />

            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

            {/* Header Section */}
            <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#33375D] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-blue-600/20">
                            <Folder size={24} />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-white uppercase tracking-tighter">
                                COOP / BC Plans
                            </h1>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">
                                Continuity of Operations & Strategic Recovery
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Button
                        type="button"
                        onClick={() => setBulkOpen(true)}
                        className="h-14 px-8 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all gap-3"
                    >
                        <Upload size={16} /> Bulk Continuity Plan
                    </Button>
                    <Button
                        type="button"
                        onClick={() => setNewPlanOpen(true)}
                        className="h-14 gap-3 rounded-2xl bg-[#33375D] px-8 font-black text-[10px] uppercase tracking-widest text-white shadow-2xl shadow-[#33375D]/25 hover:bg-[#2B2F50]"
                    >
                        <Plus size={16} /> New Continuity Plan
                    </Button>
                </div>
            </div>

            {/* Categories Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
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
                            'p-8 bg-white/[0.02] border rounded-[40px] shadow-2xl hover:bg-white/[0.04] transition-all cursor-pointer group relative overflow-hidden',
                            selectedCategoryIdx === i ? 'border-blue-500/40 ring-2 ring-blue-500/25' : 'border-white/5'
                        )}
                    >
                        <div
                            className={cn(
                                'inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-6',
                                cat.bg,
                                cat.color
                            )}
                        >
                            <cat.icon size={28} />
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-tight leading-tight">
                                    {cat.name}
                                </h4>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                                    Strategic Files
                                </p>
                            </div>
                            <span className="text-2xl font-black text-white group-hover:text-blue-400 transition-colors">
                                {cat.count}
                            </span>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Main Content: File Explorer */}
            <Card className="bg-slate-900/40 backdrop-blur-3xl border-white/5 rounded-[48px] shadow-2xl overflow-hidden relative">
                <div className="p-10 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="relative w-full max-w-xl">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="SEARCH CONTINUITY PROTOCOLS..."
                            className="h-16 pl-16 rounded-[24px] bg-white/[0.03] border-white/5 text-white font-black text-xs placeholder:text-slate-600 focus:ring-blue-500/20 focus:border-blue-500/40 uppercase tracking-widest"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 justify-end">
                        <div className="flex flex-wrap gap-4 items-center min-h-16 px-6 py-2 bg-white/[0.03] border border-white/5 rounded-[24px]">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                                Attach to plan
                            </span>
                            <select
                                value={uploadTargetPlanId}
                                onChange={(e) => setUploadTargetPlanId(e.target.value)}
                                className="h-11 min-w-[160px] rounded-xl bg-white/[0.04] border border-white/10 px-4 text-[10px] font-black uppercase tracking-wider text-white focus:border-blue-500/40 outline-none"
                            >
                                {planIdsSorted.length === 0 ? (
                                    <option value="">No plans loaded</option>
                                ) : (
                                    planIdsSorted.map((pid) => (
                                        <option key={pid} value={pid} className="bg-slate-900">
                                            {pid}
                                        </option>
                                    ))
                                )}
                            </select>
                            <Button
                                type="button"
                                onClick={handlePickFile}
                                className="h-11 px-6 rounded-xl bg-white/10 text-[10px] font-black uppercase tracking-wider text-white border border-white/10 hover:bg-white/15"
                            >
                                Browse
                            </Button>
                            {selectedUploadFile ? (
                                <span className="text-[10px] font-medium text-slate-400 truncate max-w-[140px]" title={selectedUploadFile.name}>
                                    {selectedUploadFile.name}
                                </span>
                            ) : null}
                            <Button
                                type="button"
                                disabled={uploading || !planIdsSorted.length}
                                onClick={submitUpload}
                                className="h-11 px-6 rounded-xl bg-[#33375D] text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#2B2F50]"
                            >
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload'}
                            </Button>
                        </div>
                        <div className="h-16 px-6 bg-white/[0.03] border border-white/5 rounded-[24px] flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                    Database Linked
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-white/[0.02]">
                                <th className="px-10 py-8 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                    Resource Identifier
                                </th>
                                <th className="px-10 py-8 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                    File Matrix
                                </th>
                                <th className="px-10 py-8 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                    Audit Cycle
                                </th>
                                <th className="px-10 py-8 text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                    AI Integrity
                                </th>
                                <th className="px-10 py-8 text-right text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                    Protocols
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {visibleRows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-10 py-16 text-center text-sm font-medium text-slate-500 uppercase tracking-wider">
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
                                        <tr key={`${doc.planId}-${attachmentId}`} className="group hover:bg-white/[0.03] transition-all">
                                            <td className="px-10 py-8">
                                                <div className="flex items-center gap-6">
                                                    <div className="w-14 h-14 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-blue-400 group-hover:bg-blue-600/10 transition-all">
                                                        <FileText size={24} />
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">
                                                            {doc.fileName}
                                                        </span>
                                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">
                                                            {doc.planLabel} · {doc.planId}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-10 py-8">
                                                <span className="h-8 px-4 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center w-fit text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                    {fileMatrixLabel(doc.fileName)}
                                                </span>
                                            </td>
                                            <td className="px-10 py-8 text-sm font-black text-slate-400 uppercase tracking-widest">
                                                {auditLabel}
                                            </td>
                                            <td className="px-10 py-8 text-center min-w-[200px]">
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
                                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
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
                                                            <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        'h-full transition-all duration-700',
                                                                        integ.barColor
                                                                    )}
                                                                    style={{ width: `${integ.pct}%` }}
                                                                />
                                                            </div>
                                                            {doc.aiIntegritySummary ? (
                                                                <p className="text-[8px] font-medium text-slate-500 leading-snug line-clamp-2 mt-1">
                                                                    {doc.aiIntegritySummary}
                                                                </p>
                                                            ) : null}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-10 py-8 text-right">
                                                <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
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
                                                        className="h-10 w-10 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all"
                                                    >
                                                        <Zap size={16} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        title="Edit protocol steps"
                                                        size="icon"
                                                        onClick={() => openEditSteps(doc)}
                                                        className="h-10 w-10 bg-white/5 text-slate-400 hover:bg-white/10 rounded-xl transition-all"
                                                    >
                                                        <Edit size={16} />
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
                                                        className="h-10 w-10 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-all"
                                                    >
                                                        <Trash2 size={16} />
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
            <div className="bg-blue-600/5 p-12 rounded-[48px] border border-blue-500/10 flex flex-col lg:flex-row gap-12 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 text-blue-500/5 grayscale group-hover:grayscale-0 transition-all duration-1000">
                    <Sparkles size={160} />
                </div>
                <div className="w-20 h-20 bg-blue-600 rounded-[30px] flex items-center justify-center text-white shadow-2xl shadow-blue-600/20 shrink-0 relative z-10">
                    <Zap size={40} />
                </div>
                <div className="relative z-10 space-y-4 flex-1">
                    <div className="flex flex-wrap items-center gap-4">
                        <h4 className="text-2xl font-black text-white uppercase tracking-tighter">AI-Driven Continuity Audit</h4>
                        {auditSummary ? (
                            <span
                                className={cn(
                                    'h-7 px-3 rounded-full border text-[9px] font-black uppercase tracking-[0.2em] flex items-center',
                                    auditSummary.posture === 'Resilient' && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                                    auditSummary.posture === 'Steady' && 'bg-blue-500/10 border-blue-500/30 text-blue-400',
                                    auditSummary.posture === 'At Risk' && 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                                )}
                            >
                                Posture · {auditSummary.posture}
                            </span>
                        ) : null}
                        {auditSummary && auditSummary.totals.plans > 0 ? (
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Avg integrity · {auditSummary.averageScore} / 100 · {auditSummary.totals.attachments} file{auditSummary.totals.attachments === 1 ? '' : 's'} across {auditSummary.totals.plans} plan{auditSummary.totals.plans === 1 ? '' : 's'}
                            </span>
                        ) : null}
                    </div>

                    {auditLoading && !auditSummary ? (
                        <p className="text-sm font-medium text-slate-400 leading-relaxed max-w-5xl flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Synthesizing continuity audit…
                        </p>
                    ) : auditSummary ? (
                        <>
                            <p className="text-base font-medium text-slate-300 leading-relaxed max-w-5xl">
                                {auditSummary.summary}
                            </p>
                            {auditSummary.findings.length ? (
                                <ul className="space-y-2 max-w-5xl">
                                    {auditSummary.findings.map((f, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-3 text-sm font-medium text-slate-400 leading-relaxed"
                                        >
                                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </>
                    ) : (
                        <p className="text-base font-medium text-slate-400 leading-relaxed max-w-5xl">
                            Add a continuity plan to generate an AI audit of your inventory.
                        </p>
                    )}

                    {auditSummary?.generatedAt ? (
                        <span className="block text-[10px] font-black text-slate-600 uppercase tracking-widest pt-2">
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
            </div>

            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <DialogContent className="border-white/10 bg-[#0A0B10] text-white sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-tight font-black text-lg">Bulk continuity plan</DialogTitle>
                        <DialogDescription className="text-slate-400 text-xs">
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
                            className="h-7 border-white/15 bg-transparent text-[10px] uppercase tracking-widest text-white hover:bg-white/10"
                        >
                            Reset
                        </Button>
                    </div>

                    <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
                        {bulkRows.map((row, idx) => (
                            <div
                                key={idx}
                                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
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
                                        className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
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
                                            className="rounded-xl border-white/10 bg-white/[0.04] font-mono text-xs"
                                        />
                                    </div>
                                    <div className="sm:col-span-7 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Display label</label>
                                        <Input
                                            value={row.label}
                                            onChange={(e) => updateBulkRow(idx, { label: e.target.value })}
                                            placeholder="Human-readable continuity title"
                                            className="rounded-xl border-white/10 bg-white/[0.04] text-xs"
                                        />
                                    </div>
                                    <div className="sm:col-span-5 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category</label>
                                        <select
                                            value={row.category}
                                            onChange={(e) => updateBulkRow(idx, { category: e.target.value as PlanCategory })}
                                            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white outline-none focus:border-blue-500/40"
                                        >
                                            {SELECTABLE_CATEGORIES.map((c) => (
                                                <option key={c.key} value={c.key} className="bg-slate-900">
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
                                            className="rounded-xl border-white/10 bg-white/[0.04] text-xs resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}

                        <Button
                            type="button"
                            variant="outline"
                            onClick={addBulkRow}
                            className="w-full h-10 border-dashed border-white/20 bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/5 hover:text-white gap-2"
                        >
                            <Plus size={14} /> Add another plan
                        </Button>
                    </div>

                    <p className="text-[10px] text-slate-500 pt-2">
                        Existing Plan IDs are <strong className="text-slate-300">updated</strong>; new ones are
                        <strong className="text-slate-300"> created</strong>. Steps and attachments are not affected.
                    </p>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            type="button"
                            className="border-white/15 bg-transparent text-white hover:bg-white/10"
                            onClick={() => setBulkOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={bulkRunning}
                            className="bg-[#33375D]"
                            onClick={submitBulkPlans}
                        >
                            {bulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create / update plans'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
                <DialogContent className="border-white/10 bg-[#0A0B10] text-white sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-tight font-black text-lg">Register continuity framework</DialogTitle>
                        <DialogDescription className="text-slate-400 text-xs">
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
                                className="rounded-xl border-white/10 bg-white/[0.04] font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Display label</label>
                            <Input
                                value={newPlanLabel}
                                onChange={(e) => setNewPlanLabel(e.target.value)}
                                placeholder="Human-readable continuity title"
                                className="rounded-xl border-white/10 bg-white/[0.04]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Continuity bucket</label>
                            <select
                                value={newPlanCategory}
                                onChange={(e) => setNewPlanCategory(e.target.value as PlanCategory)}
                                className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white outline-none focus:border-blue-500/40"
                            >
                                {SELECTABLE_CATEGORIES.map((c) => (
                                    <option key={c.key} value={c.key} className="bg-slate-900">
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
                                className="rounded-xl border-white/10 bg-white/[0.04] text-sm resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            type="button"
                            className="border-white/15 bg-transparent text-white hover:bg-white/10"
                            onClick={() => setNewPlanOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={savingPlan}
                            className="bg-[#33375D]"
                            onClick={submitNewPlan}
                        >
                            {savingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create vault'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="border-white/10 bg-[#0A0B10] text-white sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-tight font-black text-lg">Protocol cascade — {editPlanLabel}</DialogTitle>
                        <DialogDescription className="text-slate-400 text-xs">
                            One actionable step per line. These checkpoints appear for operators referencing this continuity plan bucket (
                            <span className="font-mono">{editPlanId}</span>).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 pb-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Continuity bucket</label>
                        <select
                            value={editPlanCategory === 'response' ? 'coop' : editPlanCategory}
                            onChange={(e) => setEditPlanCategory(e.target.value as PlanCategory)}
                            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white outline-none focus:border-blue-500/40"
                        >
                            {SELECTABLE_CATEGORIES.map((c) => (
                                <option key={c.key} value={c.key} className="bg-slate-900">
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <Textarea
                        value={editStepsText}
                        onChange={(e) => setEditStepsText(e.target.value)}
                        rows={14}
                        className="rounded-xl border-white/10 bg-white/[0.04] text-sm resize-none font-medium"
                    />
                    <DialogFooter>
                        <Button
                            variant="outline"
                            type="button"
                            className="border-white/15 bg-transparent text-white hover:bg-white/10"
                            onClick={() => setEditOpen(false)}
                        >
                            Close
                        </Button>
                        <Button type="button" disabled={savingSteps} className="bg-[#33375D]" onClick={saveSteps}>
                            {savingSteps ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save steps'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent className="border-white/10 bg-[#0A0B10] text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-black uppercase tracking-tighter">Purge continuity attachment?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 text-sm leading-relaxed">
                            This terminates <strong className="text-white">{deleteTarget?.fileName}</strong> from the mission dossier — the backing
                            object is revoked from encrypted storage immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/10 bg-transparent text-white hover:bg-white/10 hover:text-white">
                            Abort
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={deleting}
                            onClick={() => confirmDelete()}
                        >
                            {deleting ? 'Purging…' : 'Confirm purge'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    )
}
