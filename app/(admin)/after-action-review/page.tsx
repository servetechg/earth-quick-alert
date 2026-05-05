'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Flame,
    Layers,
    Clock,
    Columns,
    Loader2,
    FileText,
    CheckCircle,
    AlertTriangle,
    Shield,
    Activity,
    Download,
    Share2,
    Sparkles,
    ArrowUpRight,
    Target,
    Zap,
    RotateCcw,
    Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Dynamic Type for the Incident data
type IncidentReviewDef = {
    id?: string;
    name: string;
    type: string;
    duration: string;
    insights: number;
    events: any[];
    aiInsights: any[];
}

export default function AfterActionReviewPage() {
    const [incidentData, setIncidentData] = useState<IncidentReviewDef | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function fetchReviewData() {
            try {
                const res = await fetch('/api/admin/after-action-review')
                if (res.ok) {
                    const data = await res.json()
                    if (data.success && data.data) {
                        setIncidentData(data.data)
                    }
                }
            } catch (err) {
                console.error("Failed to fetch AAR data:", err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchReviewData()
    }, [])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-[#0A0B10]">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <Loader2 className="w-16 h-16 animate-spin text-blue-500" />
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-blue-400">AI</div>
                    </div>
                    <p className="font-black text-xs uppercase tracking-[0.4em] text-slate-500 animate-pulse">Synchronizing Mission Metadata...</p>
                </div>
            </div>
        )
    }

    const displayData = incidentData || {
        name: 'Incident OMEGA-74',
        type: 'Flash Flood Event',
        duration: '06h 45m',
        insights: 14,
        events: [
            { id: 1, time: '12:45 PM', type: 'Critical', color: 'red', title: 'Flash Flood Warning Issued', description: 'NWS triggered automated siren protocol for Sector 4 and surrounding plains.' },
            { id: 2, time: '01:12 PM', type: 'Action', color: 'blue', title: 'EOC Activation Level 2', description: 'Administrative protocols engaged. AI Incident Commander initialized with surface map data.' },
            { id: 3, time: '01:30 PM', type: 'Report', color: 'green', title: 'Citizen Report Verified', description: 'Visual confirmation of bridge collapse at 40.71°N 74.00°W. Rerouting emergency units.' },
        ],
        aiInsights: [
            { category: 'Summary', description: 'Rapid response protocols prevented structural failure in the eastern dam. Coordination via AI-enabled GIS mapping improved response time by 22%.' },
        ]
    }

    return (
        <main className="min-h-screen bg-[#0A0B10] p-8 lg:p-12 space-y-12 overflow-hidden relative">
            {/* Background Artifacts */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />

            {/* Hero Header */}
            <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="px-4 py-1.5 bg-blue-600 rounded-full text-[10px] font-black text-white uppercase tracking-widest shadow-2xl shadow-blue-600/30">
                            Official Record
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                            <Clock size={12} /> Generated {new Date().toLocaleDateString()}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight">After-Action Review</h1>
                        <p className="text-lg font-bold text-slate-400 max-w-2xl leading-relaxed">
                            Strategic tactical analysis of <span className="text-white underline underline-offset-4 decoration-blue-500/50">{displayData.name}</span>. Modern failure analysis and operational intelligence.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Button
                        onClick={() => toast.success('Mission Intel serialized and distributed to command nodes.')}
                        variant="ghost"
                        className="h-14 px-8 rounded-2xl text-[10px] font-black text-slate-400 h-16 uppercase tracking-[0.2em] border border-white/10 hover:bg-white/5 hover:text-white transition-all gap-3"
                    >
                        <Share2 size={16} /> Distribute Report
                    </Button>
                    <Button
                        onClick={() => toast.success('Downloading Strategic AAR Payload (PDF/Excel)...')}
                        className="h-14 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 h-16 text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-blue-600/20 gap-3"
                    >
                        <Download size={16} /> Export Intelligence
                    </Button>
                </div>
            </div>

            {/* KPI Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
                {[
                    { label: 'Tactical Name', value: displayData.name, sub: 'Identity Marker', icon: Target, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: 'Event Classification', value: displayData.type, sub: 'Impact Category', icon: Layers, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                    { label: 'Deployment Duration', value: displayData.duration, sub: 'Mission Window', icon: Activity, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                    { label: 'AI Intel Count', value: displayData.insights, sub: 'Automated Insights', icon: Sparkles, color: 'text-emerald-500', bg: 'bg-emerald-500/10' }
                ].map((kpi, i) => (
                    <Card key={i} className="p-8 bg-white/[0.02] border border-white/5 rounded-[40px] shadow-2xl group hover:bg-white/[0.04] transition-all relative overflow-hidden">
                        <div className={cn("absolute right-8 top-8 w-12 h-12 rounded-2xl flex items-center justify-center transition-all", kpi.bg, kpi.color)}>
                            <kpi.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">{kpi.label}</p>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tight">{kpi.value}</h3>
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-2">{kpi.sub}</p>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* Timeline Side */}
                <div className="lg:col-span-12 space-y-8">
                    <div className="flex items-center justify-between px-4">
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Mission Chronology</h2>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">High-fidelity event serialization</p>
                        </div>
                        <div className="flex items-center gap-6 text-[9px] font-black text-slate-500 uppercase tracking-widest">
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

                    <Card className="bg-slate-900/40 backdrop-blur-3xl border-white/5 rounded-[48px] p-12 shadow-2xl relative overflow-hidden">
                        <div className="absolute left-[54px] top-12 bottom-12 w-px bg-gradient-to-b from-blue-500/50 via-white/5 to-transparent" />

                        <div className="space-y-16">
                            {displayData.events.map((event: any, i: number) => (
                                <div key={i} className="relative pl-16 group">
                                    {/* Connector Dot */}
                                    <div className={cn(
                                        "absolute left-0 top-1 w-3 h-3 rounded-full border-4 border-[#0A0B10] z-10 transition-transform group-hover:scale-150",
                                        event.color === 'red' ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]' :
                                            event.color === 'blue' ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]' :
                                                'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                                    )} />

                                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-12">
                                        <div className="space-y-4 max-w-2xl">
                                            <div className="flex items-center gap-4">
                                                <span className="text-xs font-black text-white bg-white/5 h-8 px-4 rounded-xl flex items-center border border-white/10 uppercase tracking-widest">{event.time}</span>
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg border",
                                                    event.color === 'red' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                        event.color === 'blue' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                            'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                )}>
                                                    {event.type}
                                                </span>
                                            </div>
                                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter group-hover:text-blue-400 transition-colors">{event.title}</h3>
                                            <p className="text-slate-400 font-bold leading-relaxed text-[15px]">
                                                {event.description}
                                            </p>
                                        </div>

                                        <div className="shrink-0 pt-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                                            <Button variant="ghost" className="h-12 px-6 rounded-2xl text-[9px] font-black text-blue-400 uppercase tracking-widest border border-blue-500/20 hover:bg-blue-500/10 transition-all gap-3">
                                                Examine Intel <ArrowUpRight size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* AI Insight Cards */}
                <div className="lg:col-span-12 space-y-8">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight px-4">Intelligence Analysis</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Tactical Summary */}
                        <Card className="p-10 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-white/10 rounded-[48px] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform">
                                <FileText size={100} />
                            </div>
                            <div className="relative z-10 space-y-6">
                                <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.4em]">1. Operational Summary</h3>
                                <p className="text-slate-200 font-black text-lg leading-relaxed lowercase first-letter:uppercase">
                                    {displayData.aiInsights[0]?.description}
                                </p>
                                <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Confidence: 99.4%</span>
                                    </div>
                                    <CheckCircle size={14} className="text-blue-500" />
                                </div>
                            </div>
                        </Card>

                        {/* Efficiency Targets */}
                        <Card className="p-10 bg-white/[0.02] border border-white/5 rounded-[48px] relative group overflow-hidden">
                            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:rotate-12 transition-transform">
                                <Zap size={100} />
                            </div>
                            <div className="relative z-10 space-y-6">
                                <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em]">2. Performance Indicators</h3>
                                <div className="space-y-4">
                                    {[
                                        { label: 'Resource Deployment', val: '92%', status: 'optimal' },
                                        { label: 'Citizen Information Latency', val: '< 2.4s', status: 'optimal' },
                                        { label: 'Data Synchronization', val: '99.9%', status: 'nominal' }
                                    ].map((met, i) => (
                                        <div key={i} className="flex flex-col gap-2">
                                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                <span>{met.label}</span>
                                                <span className="text-white">{met.val}</span>
                                            </div>
                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 w-[90%]" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>

                        {/* Strategic Improvements */}
                        <Card className="p-10 bg-white/[0.02] border border-white/5 rounded-[48px] relative group overflow-hidden">
                            <div className="absolute bottom-0 right-0 p-10 opacity-10 group-hover:-translate-y-4 transition-transform">
                                <RotateCcw size={100} />
                            </div>
                            <div className="relative z-10 space-y-6">
                                <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-[0.4em]">3. Strategic Enhancements</h3>
                                <ul className="space-y-4">
                                    {[
                                        'Integrate Multi-Spectral Satellite Feed earlier in Type 4 events.',
                                        'Optimize secondary siren protocols in Sector 4 low-lands.',
                                        'Upgrade GIS impact layers for better flood prediction.'
                                    ].map((imp, i) => (
                                        <li key={i} className="flex gap-4">
                                            <div className="w-5 h-5 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                                                <Plus size={12} className="text-orange-500" />
                                            </div>
                                            <p className="text-[13px] font-bold text-slate-400 leading-snug">{imp}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </main>
    )
}
