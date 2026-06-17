'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import jsPDF from 'jspdf'
import {
    Layers,
    Clock,
    FileText,
    CheckCircle,
    Activity,
    Download,
    Share2,
    Sparkles,
    ArrowUpRight,
    Target,
    Zap,
    RotateCcw,
    Plus,
    AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { AdminPageShell } from '@/components/admin-page-shell'
import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageLoader } from '@/components/admin-page-loader'
import type { AfterActionReviewData } from '@/lib/types/after-action-review'

export default function AfterActionReviewPage() {
    const [reviewData, setReviewData] = useState<AfterActionReviewData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isExporting, setIsExporting] = useState(false)

    useEffect(() => {
        async function fetchReviewData() {
            try {
                const res = await fetch('/api/admin/after-action-review', { cache: 'no-store' })
                if (res.ok) {
                    const data = await res.json()
                    if (data.success && data.data) {
                        setReviewData(data.data)
                    }
                }
            } catch (err) {
                console.error('Failed to fetch AAR data:', err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchReviewData()
    }, [])

    if (isLoading) {
        return <AdminPageLoader />
    }

    if (!reviewData) {
        return (
            <AdminPageShell>
                <AdminPageHeader
                    title="After-Action Review"
                    description="No resolved incident is available for review in your jurisdiction."
                />
                <Card className="p-10 flex flex-col items-center justify-center gap-4 text-center border border-slate-200 rounded-2xl">
                    <AlertTriangle className="w-10 h-10 text-slate-300" />
                    <p className="text-sm font-bold text-slate-600">
                        After-action data appears once an incident is resolved or a demo simulation is active.
                    </p>
                    <p className="text-xs text-slate-400 max-w-md">
                        For the Arkansas tornado presentation, enable Demo Simulation from the admin bar while signed in as
                        arkansas@admin.com.
                    </p>
                </Card>
            </AdminPageShell>
        )
    }

    const kpiCards = [
        {
            label: 'Tactical Name',
            value: reviewData.name,
            sub: reviewData.demo ? 'Demo Scenario' : 'Identity Marker',
            icon: Target,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            border: 'border-blue-100',
        },
        {
            label: 'Event Classification',
            value: reviewData.type,
            sub: 'Impact Category',
            icon: Layers,
            color: 'text-orange-600',
            bg: 'bg-orange-50',
            border: 'border-orange-100',
        },
        {
            label: 'Deployment Duration',
            value: reviewData.durationDetail ?? reviewData.duration,
            sub: reviewData.metadata?.durationMinutes
                ? `${reviewData.metadata.durationMinutes} min on ground`
                : 'Mission Window',
            icon: Activity,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
            border: 'border-purple-100',
        },
        {
            label: 'AI Intel Count',
            value: String(reviewData.insights),
            sub: 'Automated Insights',
            icon: Sparkles,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
        },
    ]

    const downloadReportPdf = () => {
        if (isExporting) return
        setIsExporting(true)
        try {
            const doc = new jsPDF({ unit: 'pt', format: 'a4' })
            const pageW = doc.internal.pageSize.getWidth()
            const pageH = doc.internal.pageSize.getHeight()
            const margin = 44
            const contentW = pageW - margin * 2
            let y = margin

            const ensure = (h: number) => {
                if (y + h > pageH - margin) {
                    doc.addPage()
                    y = margin
                }
            }

            const writeTitle = (text: string) => {
                ensure(30)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(13)
                doc.setTextColor(35, 56, 102)
                doc.text(text, margin, y)
                y += 8
                doc.setDrawColor(220, 225, 235)
                doc.line(margin, y, pageW - margin, y)
                y += 14
            }

            const writeWrapped = (text: string, size = 10.5, indent = 0, spacing = 13) => {
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(size)
                doc.setTextColor(35, 40, 55)
                const lines = doc.splitTextToSize(text, contentW - indent)
                lines.forEach((line: string) => {
                    ensure(spacing)
                    doc.text(line, margin + indent, y)
                    y += spacing
                })
            }

            doc.setFillColor(35, 56, 102)
            doc.rect(0, 0, pageW, 72, 'F')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(20)
            doc.setTextColor(255, 255, 255)
            doc.text('After-Action Review', margin, 34)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
            doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 52)
            doc.text('Ready2Go Operational Intelligence', pageW - margin, 34, { align: 'right' })
            y = 98

            writeTitle('KPI Dashboard Snapshot')
            kpiCards.forEach((kpi) => {
                writeWrapped(`${kpi.label}: ${kpi.value} (${kpi.sub})`)
            })
            y += 8

            writeTitle('Mission Chronology')
            reviewData.events.forEach((event, idx) => {
                ensure(30)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(10)
                doc.text(`${idx + 1}. ${event.time} · ${event.type}`, margin, y)
                y += 13
                writeWrapped(event.title, 11)
                writeWrapped(event.description, 10, 12)
                y += 6
            })

            writeTitle('Intelligence Analysis')
            reviewData.aiInsights.forEach((insight, idx) => {
                ensure(22)
                doc.setFont('helvetica', 'bold')
                doc.text(`${idx + 1}. ${insight.category || 'Insight'}`, margin, y)
                y += 12
                writeWrapped(insight.description || 'No details available.', 10, 12)
                y += 4
            })

            writeTitle('Performance Indicators')
            reviewData.performanceIndicators.forEach((metric) =>
                writeWrapped(`• ${metric.label}: ${metric.val} (${metric.status})`),
            )
            y += 6

            writeTitle('Strategic Enhancements')
            reviewData.strategicEnhancements.forEach((item) => writeWrapped(`• ${item}`))

            const pageCount = doc.getNumberOfPages()
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i)
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
                doc.setTextColor(140, 150, 170)
                doc.text(
                    `Ready2Go · After-Action Review · Page ${i} of ${pageCount}`,
                    pageW / 2,
                    pageH - 18,
                    { align: 'center' },
                )
            }

            doc.save(`Ready2Go-AAR-${new Date().toISOString().slice(0, 10)}.pdf`)
            toast.success('After-Action Review PDF downloaded.')
        } catch (err) {
            console.error('AAR PDF export failed:', err)
            toast.error('PDF export failed. Please try again.')
        } finally {
            setIsExporting(false)
        }
    }

    const summaryInsight =
        reviewData.aiInsights.find((i) => i.category === 'Summary') ?? reviewData.aiInsights[0]

    return (
        <AdminPageShell>
            <AdminPageHeader
                title="After-Action Review"
                description={`Strategic tactical analysis of ${reviewData.name}. ${reviewData.demo ? 'Arkansas EF-3 tornado presentation scenario.' : 'Operational intelligence from resolved incident data.'}`}
                actions={
                    <>
                        {/* <div className="hidden md:flex items-center gap-2 h-12 px-4 rounded-xl bg-slate-50 border border-slate-200">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#33375D] px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                                {reviewData.demo ? 'Demo Record' : 'Official Record'}
                            </span>
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <Clock size={12} /> {new Date().toLocaleDateString()}
                            </span>
                        </div> */}
                        {/* <Button
                            onClick={() => toast.success('Mission Intel serialized and distributed to command nodes.')}
                            variant="outline"
                            className="flex h-12 gap-2 rounded-xl border-slate-200 bg-white px-6 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                        >
                            <Share2 size={16} /> Distribute Report
                        </Button> */}
                        <Button
                            onClick={downloadReportPdf}
                            disabled={isExporting}
                            className="flex h-12 gap-2 rounded-xl bg-[#33375D] px-6 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-[#2B2F50] active:scale-95"
                        >
                            <Download size={16} /> {isExporting ? 'Exporting...' : 'Export PDF'}
                        </Button>
                    </>
                }
            />

            {reviewData.metadata?.efRating != null && (
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest -mt-2 mb-2 px-1">
                    EF-{reviewData.metadata.efRating} · {reviewData.metadata.peakWindMph} mph peak ·{' '}
                    {reviewData.metadata.pathLengthMiles} mi track ·{' '}
                    {reviewData.metadata.structuresAffected?.toLocaleString()} structures ·{' '}
                    {reviewData.metadata.injuriesDirect} injuries ·{' '}
                    {(reviewData.metadata.counties ?? []).join(' & ')} counties
                </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiCards.map((kpi, i) => (
                    <Card
                        key={i}
                        className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
                    >
                        <div
                            className={cn(
                                'absolute right-6 top-6 w-12 h-12 rounded-xl flex items-center justify-center border transition-all',
                                kpi.bg,
                                kpi.color,
                                kpi.border,
                            )}
                        >
                            <kpi.icon size={22} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                            {kpi.label}
                        </p>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight pr-14 truncate">
                            {kpi.value}
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                            {kpi.sub}
                        </p>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-12 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-1">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                                Mission Chronology
                            </h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {reviewData.events.length} events from NWS products, EOC actions, citizens, and responders
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500" /> Critical
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500" /> Action
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Verified
                            </div>
                        </div>
                    </div>

                    <Card className="bg-white border border-slate-200 rounded-2xl p-8 lg:p-10 shadow-sm relative overflow-hidden">
                        <div className="absolute left-[42px] lg:left-[46.5px] top-10 bottom-10 w-px bg-gradient-to-b from-[#33375D]/30 via-slate-200 to-transparent" />

                        <div className="space-y-10">
                            {reviewData.events.map((event, i) => (
                                <div key={event.id ?? i} className="relative pl-12 lg:pl-14 group">
                                    <div
                                        className={cn(
                                            'absolute left-0 top-1.5 w-3 h-3 rounded-full ring-4 ring-white z-10 transition-transform scale-150',
                                            event.color === 'red'
                                                ? 'bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.15)]'
                                                : event.color === 'blue'
                                                    ? 'bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.15)]'
                                                    : event.color === 'purple'
                                                        ? 'bg-violet-500 shadow-[0_0_0_4px_rgba(139,92,246,0.15)]'
                                                        : 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]',
                                        )}
                                    />

                                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                                        <div className="space-y-3 max-w-2xl">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="text-[10px] font-black text-slate-700 bg-slate-50 h-7 px-3 rounded-lg inline-flex items-center border border-slate-200 uppercase tracking-widest">
                                                    {event.time}
                                                </span>
                                                <span
                                                    className={cn(
                                                        'text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-md border',
                                                        event.color === 'red'
                                                            ? 'bg-red-50 text-red-600 border-red-100'
                                                            : event.color === 'blue'
                                                                ? 'bg-blue-50 text-blue-600 border-blue-100'
                                                                : event.color === 'purple'
                                                                    ? 'bg-violet-50 text-violet-600 border-violet-100'
                                                                    : 'bg-emerald-50 text-emerald-600 border-emerald-100',
                                                    )}
                                                >
                                                    {event.type}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight group-hover:text-[#33375D] transition-colors">
                                                {event.title}
                                            </h3>
                                            <p className="text-slate-500 font-medium leading-relaxed text-sm">
                                                {event.description}
                                            </p>
                                        </div>

                                        {/* <div className="shrink-0 pt-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <Button
                                                variant="outline"
                                                className="h-10 px-4 rounded-xl text-[9px] font-bold text-[#33375D] uppercase tracking-widest border-slate-200 hover:bg-[#33375D]/5 hover:border-[#33375D]/30 transition-all gap-2"
                                            >
                                                Examine Intel <ArrowUpRight size={14} />
                                            </Button>
                                        </div> */}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-12 space-y-4">
                    <div className="px-1">
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                            Intelligence Analysis
                        </h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            Structured operational intelligence
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-all group">
                            <div className="pointer-events-none absolute right-5 top-5 opacity-[0.06] transition-transform group-hover:scale-110">
                                <FileText size={80} className="text-[#33375D]" />
                            </div>
                            <div className="relative z-10 space-y-4">
                                <div className="inline-flex w-11 h-11 rounded-xl items-center justify-center bg-blue-50 border border-blue-100 text-blue-600">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">
                                        Operational Summary
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                        AI Tactical Digest
                                    </p>
                                </div>
                                <p className="text-sm font-medium leading-relaxed text-slate-600">
                                    {summaryInsight?.description}
                                </p>
                                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                                            {reviewData.demo && reviewData.metadata?.historicalMatchConfidence
                                                ? `Historical match: ${Math.round(reviewData.metadata.historicalMatchConfidence * 100)}%`
                                                : 'AI-assisted synthesis'}
                                        </span>
                                    </div>
                                    <CheckCircle size={14} className="shrink-0 text-emerald-500" aria-hidden />
                                </div>
                            </div>
                        </Card>

                        <Card className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-all group">
                            <div className="pointer-events-none absolute right-5 top-5 opacity-[0.06] transition-transform group-hover:rotate-6">
                                <Zap size={80} className="text-emerald-600" />
                            </div>
                            <div className="relative z-10 space-y-4">
                                <div className="inline-flex w-11 h-11 rounded-xl items-center justify-center bg-emerald-50 border border-emerald-100 text-emerald-600">
                                    <Zap size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">
                                        Performance Indicators
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                        Scenario Telemetry
                                    </p>
                                </div>
                                <div className="space-y-4 pt-1">
                                    {reviewData.performanceIndicators.map((met, i) => (
                                        <div key={i} className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                <span className="min-w-0 truncate">{met.label}</span>
                                                <span className="shrink-0 tabular-nums text-sm font-black text-slate-900">
                                                    {met.val}
                                                </span>
                                            </div>
                                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                                <div
                                                    className="h-full bg-emerald-500 transition-all"
                                                    style={{ width: `${met.percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>

                        <Card className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-all group">
                            <div className="pointer-events-none absolute right-5 top-5 opacity-[0.06] transition-transform group-hover:-rotate-6">
                                <RotateCcw size={80} className="text-orange-600" />
                            </div>
                            <div className="relative z-10 space-y-4">
                                <div className="inline-flex w-11 h-11 rounded-xl items-center justify-center bg-orange-50 border border-orange-100 text-orange-600">
                                    <RotateCcw size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">
                                        Strategic Enhancements
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                        Recommended Actions
                                    </p>
                                </div>
                                <ul className="space-y-3">
                                    {reviewData.strategicEnhancements.map((imp, i) => (
                                        <li key={i} className="flex gap-3">
                                            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-orange-100 bg-orange-50">
                                                <Plus size={12} className="text-orange-600" />
                                            </div>
                                            <p className="min-w-0 text-sm font-medium leading-relaxed text-slate-600">
                                                {imp}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </AdminPageShell>
    )
}
