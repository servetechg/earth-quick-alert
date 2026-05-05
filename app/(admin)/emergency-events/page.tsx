'use client'

import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    AlertTriangle,
    MapPin,
    TrendingUp,
    AlertCircle,
    X,
    Loader2,
    Trash2,
    Shield,
    Clock,
    Send,
    Edit2,
    Activity,
    Target,
    Zap,
    Download,
    Share2,
    Filter,
    Search,
    ChevronRight,
    ArrowUpRight,
    Trophy,
    Sparkles,
} from 'lucide-react'
import { SendCommunityAlertModal } from '@/components/modals/send-community-alert-modal'
import { ActiveEmergencyEventsModal } from '@/components/modals/active-emergency-events-modal'
import { AlertDetailModal } from '@/components/modals/alert-detail-modal'
import { ResourceMapModal } from '@/components/modals/resource-map-modal'
import { SituationReportModal } from '@/components/modals/situation-report-modal'
import { GISMap } from '@/components/gis-map'
import { useEvents } from '@/lib/store/event-store'
import { useAlerts } from '@/lib/store/alert-store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export default function EmergencyEventsPage() {
    const { events, isLoading: eventsLoading, deleteEvent, fetchEvents } = useEvents()
    const { alerts, fetchAlerts, isLoading: alertsLoading } = useAlerts()

    const [showSendAlertModal, setShowSendAlertModal] = useState(false)
    const [showEventsModal, setShowEventsModal] = useState(false)
    const [showMapModal, setShowMapModal] = useState(false)
    const [showAlertDetailModal, setShowAlertDetailModal] = useState(false)
    const [showResourceMapModal, setShowResourceMapModal] = useState(false)
    const [showSitRepModal, setShowSitRepModal] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const [selectedAlertForOverride, setSelectedAlertForOverride] = useState<any>(null)

    const handleManualSync = async () => {
        setIsSyncing(true)
        await Promise.all([fetchEvents(), fetchAlerts()])
        setIsSyncing(false)
    }

    const activeEvents = events.filter(e => e.status === 'active' || e.status === 'monitoring')
    const currentEvent = activeEvents[0] || events[0]

    if (eventsLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-slate-50">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <Loader2 className="w-16 h-16 animate-spin text-blue-600" />
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-blue-600">HQ</div>
                    </div>
                    <p className="font-black text-xs uppercase tracking-[0.4em] text-slate-400 animate-pulse">Synchronizing Tactical Matrix...</p>
                </div>
            </div>
        )
    }

    return (
        <main className="min-h-screen bg-slate-50 p-8 lg:p-12 space-y-12 overflow-hidden relative selection:bg-blue-600/10">
            {/* Background Artifacts */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

            {/* Header Section */}
            <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-slate-200">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-red-600/20">
                            <Activity size={24} />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Emergency Events</h1>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Incident Tracking & Dispatch Protocol</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        onClick={handleManualSync}
                        className="h-14 px-8 rounded-2xl bg-white border border-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 hover:text-slate-900 transition-all gap-3 shadow-sm"
                    >
                        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-emerald-600" />}
                        Sync Database
                    </Button>
                    <Button
                        onClick={() => setShowSendAlertModal(true)}
                        className="h-14 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-blue-600/20 gap-3"
                    >
                        <Send size={16} /> Broadcast Alert
                    </Button>
                </div>
            </div>

            {/* KPI Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
                {[
                    { label: 'Event Classification', value: currentEvent?.type || 'Clear', sub: 'Tactical Category', icon: Target, color: 'text-red-500', bg: 'bg-red-500/10' },
                    { label: 'Target Sector', value: typeof currentEvent?.location === 'string' ? currentEvent.location : (currentEvent?.location as any)?.address || 'Regional Area', sub: 'Deployment Zone', icon: MapPin, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: 'Active Personnel', value: '42 Units', sub: 'On-Site Resources', icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: 'Alert Frequency', value: alerts.length, sub: 'Messages Dispatched', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10' }
                ].map((kpi, i) => (
                    <Card key={i} className="p-8 bg-white border border-slate-100 rounded-[40px] shadow-xl shadow-slate-200/50 group hover:bg-slate-50 transition-all relative overflow-hidden">
                        <div className={cn("absolute right-8 top-8 w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm border", kpi.bg, kpi.color, kpi.color.replace('text-', 'border-').replace('500', '100'))}>
                            <kpi.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{kpi.label}</p>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{kpi.value}</h3>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">{kpi.sub}</p>
                    </Card>
                ))}
            </div>

            {/* Point 5: AI-Generated Incident Report */}
            <section className="relative z-10">
                <div className="bg-blue-50 p-10 rounded-[48px] border border-blue-100 flex flex-col lg:flex-row gap-12 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 text-blue-600/5 grayscale group-hover:grayscale-0 transition-all duration-1000">
                        <Sparkles size={160} />
                    </div>
                    <div className="w-20 h-20 bg-blue-600 rounded-[30px] flex items-center justify-center text-white shadow-xl shadow-blue-600/20 shrink-0 relative z-10">
                        <Zap size={40} className="fill-white" />
                    </div>
                    <div className="relative z-10 space-y-4">
                        <div className="flex items-center gap-4">
                            <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">AI Incident Intelligence {currentEvent ? ` - ${currentEvent.type}` : ''}</h4>
                            <Badge className="bg-blue-600/10 text-blue-600 border-none font-black text-[9px] px-3 uppercase tracking-widest">Live Analysis</Badge>
                        </div>
                        <p className="text-base font-medium text-slate-500 leading-relaxed max-w-5xl">
                            {currentEvent?.description || 'Strategic monitoring active. Neural logic is parsing real-time signals from ground-level deployments and civilian reporting nodes.'}
                            <br /><br />
                            <span className="text-blue-600 font-black uppercase tracking-widest text-xs italic">
                                Strategic Threshold: 10 reports met. Initiating automated advisory protocols.
                            </span>
                        </p>
                        <div className="pt-4 flex items-center gap-6">
                            <Button onClick={() => toast.info('Generating predictive mapping model...')} variant="link" className="p-0 h-auto text-blue-500 font-black uppercase tracking-[0.2em] text-[10px] hover:text-blue-400 transition-colors">
                                Run Strategic Predictive Mapping
                            </Button>
                            <div className="w-1 h-1 rounded-full bg-slate-800" />
                            <Button onClick={() => setShowSendAlertModal(true)} variant="link" className="p-0 h-auto text-blue-600 font-black uppercase tracking-[0.2em] text-[10px] hover:text-blue-700 transition-colors">
                                Authorize Global Dispatch (Radius Match)
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* Messages Log Column */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="flex items-center justify-between px-4">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Signal History</h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Audit trail of incident broadcasts</p>
                        </div>
                        <div className="flex items-center gap-2 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <button className="h-10 px-6 bg-blue-600 rounded-xl text-[9px] font-black text-white uppercase tracking-widest">All</button>
                            <button className="h-10 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Tactical</button>
                            <button className="h-10 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Community</button>
                        </div>
                    </div>

                    <Card className="bg-white border border-slate-100 rounded-[48px] p-2 shadow-xl shadow-slate-200/50 overflow-hidden">
                        <div className="max-h-[600px] overflow-y-auto custom-scrollbar p-6 space-y-4">
                            {alerts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-24 opacity-20">
                                    <Send size={48} className="text-slate-900 mb-6" />
                                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.4em]">Signal Buffer Empty</p>
                                </div>
                            ) : (
                                alerts.map((alert) => (
                                    <div key={alert.id} className="p-8 bg-white border border-slate-50 rounded-[32px] hover:bg-slate-50 transition-all group relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                                            <Button
                                                variant="ghost"
                                                onClick={() => {
                                                    setSelectedAlertForOverride(alert);
                                                    setShowSendAlertModal(true);
                                                }}
                                                className="h-12 w-12 rounded-2xl bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-all"
                                            >
                                                <Edit2 size={16} />
                                            </Button>
                                        </div>

                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
                                            <div className="space-y-4 max-w-2xl">
                                                <div className="flex items-center gap-4">
                                                    <span className={cn(
                                                        "h-8 px-4 rounded-xl flex items-center text-[9px] font-black uppercase tracking-widest border",
                                                        alert.source === 'admin_manual' ? "bg-blue-600/10 text-blue-400 border-blue-500/20" : "bg-emerald-600/10 text-emerald-400 border-emerald-500/20"
                                                    )}>
                                                        {alert.source === 'admin_manual' ? 'Manual Dispatch' : 'NWS Broadcast'}
                                                    </span>
                                                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                        <Clock size={12} /> {new Date(alert.createdAt).toLocaleString()}
                                                    </div>
                                                </div>
                                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter group-hover:text-blue-600 transition-colors lowercase first-letter:uppercase">{alert.title}</h3>
                                                <p className="text-slate-500 font-bold leading-relaxed text-sm lowercase first-letter:uppercase">{alert.message}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                </div>

                {/* Sidebar Column */}
                <div className="lg:col-span-4 space-y-8">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight px-4">Tactical Actions</h2>
                    <Card className="p-10 bg-white border border-slate-200 rounded-[48px] shadow-xl shadow-slate-200/50 space-y-6">
                        <Button
                            onClick={() => setShowMapModal(true)}
                            className="w-full h-18 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-[24px] shadow-xl shadow-blue-600/20 active:scale-95 transition-all text-[11px] uppercase tracking-[0.2em] gap-3"
                        >
                            <MapPin size={18} /> Visualize Coverage
                        </Button>
                        <div className="grid grid-cols-1 gap-4">
                            <Button
                                onClick={() => setShowSendAlertModal(true)}
                                className="w-full h-16 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 font-black rounded-[24px] transition-all text-[10px] uppercase tracking-[0.2em] gap-3 shadow-sm"
                            >
                                Message Lab
                            </Button>
                            <Button
                                className="w-full h-16 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 font-black rounded-[24px] transition-all text-[10px] uppercase tracking-[0.2em] gap-3 shadow-sm"
                            >
                                Audit Logs
                            </Button>
                        </div>
                        <div className="pt-6 border-t border-slate-100">
                            <div className="bg-red-50 p-6 rounded-[28px] border border-red-100 flex gap-4">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-600 shrink-0 shadow-sm">
                                    <AlertTriangle size={20} />
                                </div>
                                <p className="text-[10px] font-bold text-slate-500 leading-snug lowercase first-letter:uppercase">
                                    Confirm critical thresholds before re-synchronizing alert chains. Signal propagation is immediate.
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Event Analytics */}
                    <Card className="p-10 bg-white border border-slate-200 rounded-[48px] shadow-xl shadow-slate-200/50 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform">
                            <TrendingUp size={120} />
                        </div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-10">Deployment Metrics</h3>
                        <div className="space-y-8 relative z-10">
                            {[
                                { label: 'Network Stability', val: '99.2%', status: 'nominal', color: 'bg-emerald-500' },
                                { label: 'Dispatch Latency', val: '1.2s', status: 'optimal', color: 'bg-blue-500' },
                                { label: 'Feedback Loop', val: '84%', status: 'action_required', color: 'bg-amber-500' }
                            ].map((met, i) => (
                                <div key={i} className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{met.label}</span>
                                        <span className="text-xs font-black text-slate-400">{met.val}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full transition-all duration-1000", met.color)} style={{ width: met.val }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            <SendCommunityAlertModal
                key={selectedAlertForOverride ? `override-${selectedAlertForOverride.id}` : 'new-alert'}
                isOpen={showSendAlertModal}
                onClose={() => {
                    setShowSendAlertModal(false);
                    setSelectedAlertForOverride(null);
                }}
                initialData={selectedAlertForOverride ? {
                    type: selectedAlertForOverride.type,
                    severity: selectedAlertForOverride.severity,
                    title: selectedAlertForOverride.title,
                    message: selectedAlertForOverride.message,
                    zones: selectedAlertForOverride.zones,
                    locations: selectedAlertForOverride.locations
                } : undefined}
            />

            <ActiveEmergencyEventsModal isOpen={showEventsModal} onClose={() => setShowEventsModal(false)} />

            {currentEvent && (
                <AlertDetailModal
                    isOpen={showAlertDetailModal}
                    onClose={() => setShowAlertDetailModal(false)}
                    alert={{
                        title: currentEvent.title,
                        severity: currentEvent.severity,
                        description: currentEvent.description,
                        whatItMeans: `This is an active ${currentEvent.type} emergency and is currently in the ${currentEvent.status} phase.`,
                        whatToDo: "Follow all official EOC directives and stay tuned to local channels.",
                        preparedness: "Ensure your supply kits are accessible and emergency contacts are notified.",
                        issued: new Date(currentEvent.createdAt).toLocaleTimeString(),
                        expires: "Monitoring Ongoing",
                        source: "Emergency Management Agency"
                    }}
                />
            )}

            <ResourceMapModal
                isOpen={showResourceMapModal}
                onClose={() => setShowResourceMapModal(false)}
                title="Affected Area Resources"
                resources={[]}
            />

            <SituationReportModal
                isOpen={showSitRepModal}
                onClose={() => setShowSitRepModal(false)}
            />

            {showMapModal && (
                <div className="fixed inset-0 bg-white/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4 md:p-12">
                    <div className="bg-white rounded-[48px] w-full max-w-7xl h-full shadow-2xl flex flex-col border border-slate-200 relative overflow-hidden">
                        <div className="absolute inset-0 z-0 opacity-40">
                            <GISMap />
                        </div>

                        <div className="relative z-10 p-10 bg-gradient-to-b from-white to-transparent flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="w-14 h-14 bg-blue-600 rounded-[20px] flex items-center justify-center shadow-xl shadow-blue-600/20">
                                    <MapPin className="text-white" size={28} />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Tactical Visualization</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Live GIS Data Overlay & Asset Tracking</p>
                                </div>
                            </div>
                            <button onClick={() => setShowMapModal(false)} className="w-14 h-14 bg-white hover:bg-slate-50 border border-slate-200 rounded-[20px] flex items-center justify-center text-slate-900 transition-all hover:rotate-90 shadow-sm">
                                <X size={28} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}

function RefreshCw(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
        </svg>
    )
}
