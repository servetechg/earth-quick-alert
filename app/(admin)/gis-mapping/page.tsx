'use client'

import { useState, useMemo, useEffect } from 'react'
import { 
    Layers, 
    Map as MapIcon, 
    Table, 
    Filter, 
    Search, 
    Plus, 
    Download,
    Satellite,
    Crosshair,
    Maximize2,
    CheckCircle,
    Activity,
    Shield,
    AlertTriangle,
    Navigation,
    Loader2,
    RotateCcw,
    Zap
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GISEOCActivatedModal } from '@/components/modals/gis-eoc-activated-modal'
import { SendCommunityAlertModal } from '@/components/modals/send-community-alert-modal'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

const LeafletMap = dynamic(() => import('@/components/leaflet-map'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-slate-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-[#33375D]" />
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Synchronizing Surface Assets...</p>
            </div>
        </div>
    ),
})

export default function GISMappingPage() {
    const [viewMode, setViewMode] = useState<'map' | 'table'>('map')
    const [mapVariant, setMapVariant] = useState<'standard' | 'satellite' | 'dark'>('satellite')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false)
    const [reports, setReports] = useState<any[]>([
        { id: 'R-001', location: '40.7128° N, 74.0060° W', status: 'critical', type: 'flood', time: '12:45 PM', submittedBy: 'Unit 7' },
        { id: 'R-002', location: '40.7150° N, 74.0080° W', status: 'verified', type: 'hazard', time: '1:12 PM', submittedBy: 'HQ-1' },
        { id: 'R-003', location: '40.7110° N, 74.0040° W', status: 'pending', type: 'structural', time: '1:30 PM', submittedBy: 'Observer-4' },
    ])
    const [loading, setLoading] = useState(false)

    // Load actual data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/field-reports')
                if (res.ok) {
                    const data = await res.json()
                    if (data.success && data.data) {
                        // Merge or replace
                        // setReports(data.data)
                    }
                }
            } catch (err) {
                console.error("Failed to fetch reports", err)
            }
        }
        fetchData()
    }, [])

    return (
        <main className="h-[calc(100vh-64px)] w-full relative overflow-hidden bg-slate-50">
            {/* Background Map Context */}
            <div className={cn(
                "absolute inset-0 z-0 transition-all duration-700",
                viewMode === 'table' ? "scale-[1.1] blur-md opacity-30" : "scale-100 blur-0 opacity-100"
            )}>
                <LeafletMap
                    center={{ lat: 40.7128, lng: -74.0060 }}
                    resources={[]}
                    zoom={14}
                    variant={mapVariant}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-50/20 via-transparent to-slate-50/60 pointer-events-none" />
            </div>

            {/* Floating Control Terminal (Top Center) */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-6 pointer-events-none">
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl border border-slate-200 rounded-[40px] p-2 flex items-center justify-between shadow-xl shadow-slate-900/5">
                    <div className="flex items-center gap-1">
                        <Button 
                            variant="ghost" 
                            onClick={() => setViewMode('map')}
                            className={cn(
                                "h-12 px-6 rounded-full text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                                viewMode === 'map' ? "bg-[#33375D] text-white shadow-lg shadow-[#33375D]/25" : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <MapIcon size={14} /> Tactical View
                        </Button>
                        <Button 
                            variant="ghost" 
                            onClick={() => setViewMode('table')}
                            className={cn(
                                "h-12 px-6 rounded-full text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                                viewMode === 'table' ? "bg-[#33375D] text-white shadow-lg shadow-[#33375D]/25" : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <Table size={14} /> Intel Table
                        </Button>
                    </div>

                    <div className="h-8 w-px bg-white/10" />

                    <div className="flex items-center gap-3 pr-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" className="h-12 rounded-full px-4 text-slate-400 hover:text-white transition-all">
                                    <Layers size={18} />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 bg-white/90 backdrop-blur-3xl border border-slate-200 rounded-3xl p-6 shadow-2xl mt-4" align="center">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Visual Intelligence Layers</p>
                                <div className="space-y-4">
                                     {[
                                        { id: 'satellite', label: 'High-Res Satellite', action: () => setMapVariant('satellite'), active: mapVariant === 'satellite' },
                                        { id: 'dark', label: 'Operational Dark', action: () => setMapVariant('dark'), active: mapVariant === 'dark' },
                                        { id: 'standard', label: 'Topographical', action: () => setMapVariant('standard'), active: mapVariant === 'standard' }
                                     ].map((opt) => (
                                         <button 
                                            key={opt.id}
                                            onClick={opt.action}
                                            className={cn(
                                                "w-full flex items-center justify-between p-3 rounded-xl transition-all",
                                                opt.active ? "bg-blue-50 border border-blue-100" : "hover:bg-slate-50 border border-transparent shadow-sm"
                                            )}
                                         >
                                             <span className={cn("text-xs font-bold", opt.active ? "text-blue-600" : "text-slate-500")}>{opt.label}</span>
                                             {opt.active && <CheckCircle size={14} className="text-blue-600" />}
                                         </button>
                                     ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                        
                        <Button variant="ghost" className="h-12 rounded-full px-4 text-slate-400 hover:text-slate-900 transition-all">
                            <Crosshair size={18} />
                        </Button>
                        <Button onClick={() => setIsModalOpen(true)} className="h-12 w-12 rounded-full bg-[#33375D] p-0 text-white shadow-lg shadow-[#33375D]/25 hover:bg-[#2B2F50]">
                            <Plus size={20} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content Overlays */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                {/* Table View Overlay */}
                {viewMode === 'table' && (
                    <div className="h-full w-full bg-slate-50/60 backdrop-blur-md flex items-center justify-center p-12 pointer-events-auto animate-in fade-in zoom-in duration-500">
                        <Card className="w-full max-w-6xl bg-white border border-slate-200 rounded-[40px] shadow-2xl overflow-hidden flex flex-col">
                            <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Intel Reporting Terminal</h2>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Strategic Multi-Source Verification</p>
                                </div>
                                <div className="flex items-center gap-4">
                                     <div className="relative group">
                                         <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-blue-500 transition-colors" />
                                         <input 
                                            type="text" 
                                            placeholder="Search Strategic Grid..."
                                            className="h-12 pl-12 pr-6 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all w-64 shadow-sm"
                                         />
                                     </div>
                                     <Button variant="ghost" className="h-12 px-6 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-900 hover:bg-slate-50 gap-2 border border-slate-100">
                                         <Download size={14} /> Export Intel
                                     </Button>
                                </div>
                            </div>
                            
                            <div className="overflow-auto flex-1 custom-scrollbar">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-8">Identifier</th>
                                            <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Coordinates</th>
                                            <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Intel Type</th>
                                            <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Source Unit</th>
                                            <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Priority</th>
                                            <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right px-8">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {reports.map((report) => (
                                            <tr key={report.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="p-6 px-8">
                                                    <span className="text-xs font-black text-slate-900">{report.id}</span>
                                                </td>
                                                <td className="p-6">
                                                    <span className="text-[11px] font-mono font-bold text-slate-400 group-hover:text-blue-400 transition-colors">{report.location}</span>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex items-center gap-2">
                                                        <Activity size={14} className="text-slate-400" />
                                                        <span className="text-[11px] font-black text-slate-700 uppercase underline underline-offset-4 decoration-slate-200">{report.type}</span>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <span className="text-[11px] font-black text-slate-500 uppercase">{report.submittedBy}</span>
                                                </td>
                                                <td className="p-6">
                                                    <span className="text-[11px] font-bold text-slate-400 tracking-tight italic opacity-60">Verified {report.time}</span>
                                                </td>
                                                <td className="p-6 text-right px-8">
                                                    <span className={cn(
                                                        "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2",
                                                        report.status === 'critical' ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                                                        report.status === 'verified' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                                                        "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                                    )}>
                                                        <div className={cn(
                                                            "w-1.5 h-1.5 rounded-full animate-pulse",
                                                            report.status === 'critical' ? "bg-red-500" :
                                                            report.status === 'verified' ? "bg-emerald-500" :
                                                            "bg-blue-500"
                                                        )} />
                                                        {report.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Tactical Sidebar (Map Components) */}
                {viewMode === 'map' && (
                    <>
                        <div className="absolute left-8 bottom-8 w-80 pointer-events-auto animate-in slide-in-from-left-8 duration-700">
                             <Card className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-[32px] p-6 shadow-2xl shadow-slate-900/10">
                                 <div className="flex items-center gap-3 mb-6">
                                     <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#33375D] text-white">
                                         <Satellite size={20} />
                                     </div>
                                     <div>
                                         <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Active Context</h3>
                                         <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Satellite Surveillance</p>
                                     </div>
                                 </div>
                                 <div className="space-y-4">
                                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Signal Strength</p>
                                          <div className="flex items-center gap-2">
                                              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                  <div className="h-full bg-emerald-500 w-[92%]" />
                                              </div>
                                              <span className="text-[10px] font-black text-slate-900">92%</span>
                                          </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                           <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">FPS</p>
                                                <p className="text-lg font-black text-slate-800">60</p>
                                           </div>
                                           <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">PING</p>
                                                <p className="text-lg font-black text-slate-800">12ms</p>
                                           </div>
                                      </div>
                                 </div>
                             </Card>
                        </div>

                        <div className="absolute right-8 bottom-8 w-80 pointer-events-auto animate-in slide-in-from-right-8 duration-700">
                             <Card className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-[32px] p-6 shadow-2xl shadow-slate-900/10">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Tactical Overlay</h3>
                                    <div className="h-1.5 w-6 rounded-full bg-[#33375D] shadow-lg shadow-[#33375D]/25" />
                                </div>
                                <div className="space-y-3">
                                     {[
                                        { icon: Shield, label: 'Safe Zones', count: 14, color: 'text-emerald-500' },
                                        { icon: AlertTriangle, label: 'High Threat', count: 6, color: 'text-red-500' },
                                        { icon: Navigation, label: 'Unit Locations', count: 45, color: 'text-blue-500' }
                                     ].map((item, i) => (
                                         <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all group">
                                             <div className="flex items-center gap-3">
                                                 <item.icon className={cn("w-4 h-4", item.color)} />
                                                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-900 transition-colors">{item.label}</span>
                                             </div>
                                             <span className="text-xs font-black text-slate-900 opacity-40 group-hover:opacity-100">{item.count}</span>
                                         </div>
                                     ))}
                                </div>
                             </Card>
                        </div>
                    </>
                )}
            </div>

            <GISEOCActivatedModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
            <SendCommunityAlertModal isOpen={isAlertModalOpen} onClose={() => setIsAlertModalOpen(false)} />
            
            {/* Multi-Channel Dispatch Trigger */}
            <div className="absolute right-8 top-32 z-20 animate-in slide-in-from-right-8 duration-1000">
                <Button 
                    onClick={() => setIsAlertModalOpen(true)}
                    className="h-20 w-20 rounded-[32px] bg-red-600 hover:bg-red-700 text-white shadow-2xl shadow-red-600/30 flex flex-col items-center justify-center gap-2 group transition-all hover:scale-110 active:scale-95 border-none"
                >
                    <Zap size={24} className="fill-white group-hover:animate-pulse transition-all" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-center leading-tight">Dispatch<br/>Global</span>
                </Button>
            </div>
        </main>
    )
}

