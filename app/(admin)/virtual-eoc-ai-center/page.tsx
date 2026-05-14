'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    AlertTriangle,
    FileText,
    CheckCircle,
    Shield,
    Users,
    ChevronDown,
    Layers,
    MapPin,
    Download,
    Sparkles,
    Circle,
    Activity,
    Target,
    Navigation2,
    Zap,
    Search
} from 'lucide-react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { AdminPageLoader } from '@/components/admin-page-loader'
import { useMemo, useEffect, useState } from 'react'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

const LeafletMap = dynamic(() => import('@/components/leaflet-map'), {
    ssr: false,
    loading: () => <AdminPageLoader layout="fill" />,
})

export default function VirtualEOCAICenterPage() {
    const mapResources = useMemo(() => [], [])

    const [isLoading, setIsLoading] = useState(true)
    const [activeLayers, setActiveLayers] = useState(['public_safety', 'informational', 'shelters'])
    const [stats, setStats] = useState({
        kpis: {
            activeIncidents: 12,
            resourcesActivated: 45,
            citizenReportsReceived: 128,
            areWeSafeCheckins: 842,
            totalUsers: 1200,
            gisLayersActive: 6
        },
        responderTasks: [],
        citizenReports: [],
        checkins: []
    })

    const [aiFeed, setAiFeed] = useState([
        { id: 1, type: 'critical', title: 'Flash Flood Risk Detected', detail: 'Analysis suggests 85% probability in Sector B within 45 mins.', time: 'Just Now' },
        { id: 2, type: 'warning', title: 'Resource Gap Identified', detail: 'Shelter capacity in Zone 4 reaching 90%. Deployment recommended.', time: '2m ago' },
        { id: 3, type: 'info', title: 'Traffic Realignment', detail: 'Evacuation route 7 cleared. Updating citizen guidance.', time: '5m ago' },
    ])

    useEffect(() => {
        async function fetchVirtualEOCData() {
            try {
                const res = await fetch('/api/admin/virtual-eoc')
                if (res.ok) {
                    const data = await res.json()
                    if (data.success) {
                        setStats(data.data)
                    }
                }
            } catch (err) {
                console.error("Failed to fetch Virtual EOC data:", err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchVirtualEOCData()
        const interval = setInterval(fetchVirtualEOCData, 30000)
        return () => clearInterval(interval)
    }, [])

    if (isLoading) {
        return (
            <AdminPageLoader layout="page" containerClassName="min-h-0 h-[80vh]" />
        )
    }

    return (
        <main className="h-screen w-full relative overflow-hidden bg-slate-50 selection:bg-[#33375D]/15">
            {/* Background Map Layer */}
            <div className="absolute inset-0 z-0">
                <LeafletMap
                    center={{ lat: 40.7128, lng: -74.0060 }}
                    resources={mapResources}
                    zoom={13}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-50/40 via-transparent to-slate-50/80 pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,white_100%)] opacity-40 pointer-events-none" />
            </div>

            {/* Top Command Bar */}
            <header className="absolute top-0 left-0 right-0 z-20 p-6 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    <div className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl px-6 py-4 flex items-center gap-6 shadow-xl">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-[#33375D] uppercase tracking-widest leading-none mb-1">Operational Hub</span>
                            <span className="text-lg font-black text-slate-900 uppercase tracking-tight">Virtual EOC AI Center</span>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20" />
                                <Circle className="w-3 h-3 text-emerald-500 fill-emerald-500" />
                            </div>
                            <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">System Online</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl p-1 flex shadow-xl">
                        <Button variant="ghost" className="rounded-xl px-4 py-2 text-[10px] font-black text-slate-600 hover:bg-slate-50 uppercase tracking-widest gap-2">
                            <Layers size={14} /> Layers
                        </Button>
                        <Button variant="ghost" className="rounded-xl px-4 py-2 text-[10px] font-black text-slate-600 hover:bg-slate-50 uppercase tracking-widest gap-2">
                             <Target size={14} /> Center Office
                        </Button>
                    </div>
                    <Button className="h-12 rounded-2xl bg-[#33375D] px-6 font-black text-[10px] uppercase tracking-widest text-white shadow-2xl shadow-[#33375D]/25 hover:bg-[#2B2F50]">
                        Initiate Broadcast
                    </Button>
                </div>
            </header>

            {/* Left Sidebar: AI Intelligence & Live Feed */}
            <aside className="absolute left-6 top-32 bottom-6 w-[400px] z-20 flex flex-col gap-6 pointer-events-none">
                {/* AI Incident Commander */}
                <Card className="pointer-events-auto bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-[32px] p-8 shadow-xl flex flex-col relative overflow-hidden group shadow-slate-200/50 transition-all duration-500 hover:border-[#33375D]/25">
                    <div className="absolute top-0 right-0 -mr-12 -mt-12 h-48 w-48 rounded-full bg-[#33375D]/10 blur-3xl transition-all group-hover:bg-[#33375D]/18" />
                    
                    <div className="flex items-center gap-3 mb-8">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#33375D]/15 text-[#33375D]">
                            <Sparkles size={24} className="animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">AI Commander</h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#33375D]">Real-Time Strategic Analysis</p>
                        </div>
                    </div>

                    <div className="space-y-4 flex-1">
                        {aiFeed.map((item) => (
                            <div key={item.id} className="p-5 rounded-[24px] bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all space-y-2 group/item shadow-sm">
                                <div className="flex justify-between items-center">
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest",
                                        item.type === 'critical' ? "bg-red-500/20 text-red-500" :
                                        item.type === 'warning' ? "bg-amber-500/20 text-amber-500" :
                                        "bg-[#33375D]/15 text-[#33375D]"
                                    )}>
                                        {item.type}
                                    </span>
                                    <span className="text-[8px] font-bold text-slate-500">{item.time}</span>
                                </div>
                                <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 transition-colors group-hover/item:text-[#33375D]">{item.title}</h4>
                                <p className="text-[10px] font-medium text-slate-500 leading-relaxed italic">{item.detail}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-100">
                         <Button className="w-full h-12 bg-slate-50 hover:bg-slate-100 text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100 shadow-sm transition-all">
                            Full Analysis Report
                         </Button>
                    </div>
                </Card>

                {/* Tactical KPI Stream */}
                <div className="pointer-events-auto grid grid-cols-2 gap-4">
                     <div className="bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-3xl p-5 shadow-xl shadow-slate-200/50">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Alerts</p>
                         <p className="text-2xl font-black text-slate-900">{stats.kpis.activeIncidents}</p>
                         <div className="h-1 w-full bg-red-600/10 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-red-600 w-[65%]" />
                         </div>
                     </div>
                     <div className="bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-3xl p-5 shadow-xl shadow-slate-200/50">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Safety Check</p>
                         <p className="text-2xl font-black text-slate-900">{Math.round((stats.kpis.areWeSafeCheckins / stats.kpis.totalUsers) * 100)}%</p>
                         <div className="h-1 w-full bg-emerald-600/10 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-emerald-600 w-[84%]" />
                         </div>
                     </div>
                </div>
            </aside>

            {/* Right Sidebar: Active Reports & Resources */}
            <aside className="absolute right-6 top-32 bottom-6 w-[400px] z-20 flex flex-col gap-6 pointer-events-none">
                 {/* Live Field Reports */}
                 <Card className="pointer-events-auto flex-1 bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-[32px] p-8 shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                             <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Field Reports</h3>
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verified Multi-Source Input</p>
                        </div>
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                            <Activity size={18} />
                        </div>
                    </div>

                    <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                         {stats.citizenReports.length > 0 ? stats.citizenReports.map((report: any) => (
                             <div key={report.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all group">
                                <div className="flex items-center justify-between mb-2">
                                     <div className="flex items-center gap-2">
                                          <div className="h-1.5 w-1.5 rounded-full bg-[#33375D]" />
                                          <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest">{report.type}</span>
                                     </div>
                                     <span className="text-[8px] font-bold text-slate-500">{report.timestamp}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-700 leading-tight mb-2">{report.location}</p>
                                <div className="flex items-center gap-4">
                                     <span className="text-[9px] font-bold text-slate-500 italic">Reported by: {report.submittedBy}</span>
                                </div>
                             </div>
                         )) : (
                             <div className="flex flex-col items-center justify-center h-40 opacity-20">
                                 <FileText size={48} className="mb-4 text-white" />
                                 <p className="text-[10px] font-black uppercase tracking-widest text-white">No Active Reports</p>
                             </div>
                         )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <Button className="h-12 w-full gap-2 rounded-xl border border-[#33375D]/20 bg-[#33375D]/10 font-black text-[10px] uppercase tracking-widest text-[#33375D] transition-all hover:bg-[#33375D]/18">
                             <MapPin size={14} /> Map Verified Zones
                        </Button>
                    </div>
                 </Card>

                 {/* Resource Grid Overflow */}
                 <div className="pointer-events-auto grid grid-cols-1 gap-4">
                    <div className="bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-3xl p-6 shadow-xl shadow-slate-200/50 flex items-center justify-between pointer-events-auto">
                         <div className="flex items-center gap-4">
                             <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#33375D] text-white shadow-xl shadow-[#33375D]/25">
                                 <Users size={24} />
                             </div>
                             <div>
                                 <p className="text-xl font-black text-slate-900">{stats.kpis.resourcesActivated}</p>
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responders Deployed</p>
                             </div>
                         </div>
                         <Button variant="ghost" size="icon" className="text-slate-500">
                             <Navigation2 size={18} />
                         </Button>
                    </div>
                 </div>
            </aside>

            {/* Bottom Status Bar */}
            <footer className="absolute bottom-6 left-[430px] right-[430px] z-20 pointer-events-none">
                <div className="pointer-events-auto bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-[32px] p-4 px-8 flex items-center justify-between shadow-xl shadow-slate-200/50">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                                <Zap size={16} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Active Threats</span>
                                <span className="text-xs font-black text-slate-900 uppercase">{stats.kpis.activeIncidents} Detected</span>
                            </div>
                        </div>
                        <div className="h-6 w-px bg-slate-200" />
                        <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#33375D]/10 text-[#33375D]">
                                <Activity size={16} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Network Load</span>
                                <span className="text-xs font-black text-slate-900 uppercase">Optimal (24ms)</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-2xl border border-slate-200">
                        <div className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#33375D] text-white shadow-[#33375D]/20 transition-colors hover:bg-[#2B2F50]">
                            <Search size={18} />
                        </div>
                        <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest pr-20">Command Search Filter...</p>
                    </div>
                </div>
            </footer>
        </main>
    )
}
