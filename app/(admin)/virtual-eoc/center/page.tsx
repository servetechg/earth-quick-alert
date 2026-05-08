'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
    Crosshair, 
    Map as MapIcon, 
    Users, 
    Phone, 
    Zap, 
    Shield, 
    ChevronRight, 
    Activity,
    Target,
    ArrowUpRight,
    Search,
    Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const CENTER_DATA = [
  {
    name: 'Sector 4 Response Hub',
    location: '44 Harbor Way, Marina Dist.',
    status: 'Operational',
    team: 'Alpha Response (12 members)',
    power: 'Grid / Generator Backup',
    critical: 'Yes',
  },
  {
    name: 'Metropolitan Triage Center',
    location: 'Central Plaza Park Bldg.',
    status: 'Critical Loading',
    team: 'Medical Unit 7 (22 members)',
    power: 'Generator Only',
    critical: 'Extreme',
  },
  {
    name: 'Zonal Logistics Depot',
    location: 'Industrial Rd. Warehouse C',
    status: 'Paused',
    team: 'Transport Group B (8 members)',
    power: 'Offline',
    critical: 'No',
  }
]

export default function CenterPage() {
  return (
    <main className="min-h-screen bg-[#0A0B10] p-8 lg:p-12 space-y-12 overflow-hidden relative">
      {/* Background Glows */}
      <div className="pointer-events-none absolute top-0 right-0 h-[600px] w-[600px] rounded-full bg-[#33375D]/5 blur-[150px]" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header Section */}
      <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-white/5">
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#33375D] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-[#33375D]/25">
                    <Crosshair size={24} />
                </div>
                <div>
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Response Centers</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Tactical Hub Oversight & Asset Matrix</p>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="text-right pr-6 border-r border-white/10">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Active Hubs</p>
                <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-white tracking-tight">12/15</span>
                    <Badge className="bg-emerald-600/20 text-emerald-500 border-none text-[8px] uppercase font-black">Online</Badge>
                </div>
            </div>
            <Button className="h-14 gap-3 rounded-2xl bg-[#33375D] px-8 font-black text-[10px] uppercase tracking-widest text-white shadow-2xl shadow-[#33375D]/25 hover:bg-[#2B2F50]">
                 <Plus size={16} /> Dispatch Order
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
        {/* Hub List Area */}
        <div className="lg:col-span-12 lg:xl:col-span-8 space-y-8">
            <div className="flex items-center justify-between px-4">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Active Command Hubs</h2>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Real-time terminal status from regional sectors</p>
                </div>
                <div className="relative group">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-blue-500 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="Search Hub Identity..."
                        className="h-12 pl-12 pr-6 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-white placeholder:text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all w-64"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {CENTER_DATA.map((center, idx) => (
                    <Card key={idx} className="p-8 bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[40px] shadow-2xl group hover:bg-white/[0.02] transition-all flex flex-col justify-between cursor-pointer overflow-hidden relative h-full">
                        <div className={cn(
                            "absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-10 transition-all transform scale-150 rotate-12",
                            center.status === 'Operational' ? 'text-emerald-500' : 'text-rose-500'
                        )}>
                            <Shield size={100} />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-6">
                                    <div className={cn(
                                        "w-16 h-16 rounded-[24px] flex items-center justify-center shadow-2xl transition-all group-hover:scale-110",
                                        center.status === 'Operational' ? 'bg-emerald-600/10 text-emerald-500 border border-emerald-500/20' : 
                                        center.status === 'Critical Loading' ? 'bg-rose-600/10 text-rose-500 border border-rose-500/20' : 
                                        'bg-slate-700/10 text-slate-400 border border-slate-500/20'
                                    )}>
                                        <Shield size={32} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-none mb-2">{center.name}</h3>
                                        <div className="flex items-center gap-2">
                                            <MapIcon size={12} className="text-slate-500" />
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{center.location}</p>
                                        </div>
                                    </div>
                                </div>
                                <Badge className={cn(
                                    "border-none py-1.5 px-4 font-black uppercase text-[9px] tracking-widest rounded-lg shadow-2xl",
                                    center.status === 'Operational' ? "bg-emerald-600 text-white" : 
                                    center.status === 'Critical Loading' ? "bg-rose-600 text-white" : 
                                    "bg-slate-700 text-white"
                                )}>
                                    {center.status}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Deployed Personnel</p>
                                    <p className="text-[11px] font-black text-white uppercase tracking-tight">{center.team}</p>
                                </div>
                                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Signal Status</p>
                                    <div className="flex items-center gap-2">
                                        <Zap size={10} className={center.power.includes('Grid') ? 'text-emerald-500 animate-pulse' : 'text-amber-500'} />
                                        <p className="text-[11px] font-black text-white uppercase tracking-tight">{center.status === 'Paused' ? 'SYSTEM OFFLINE' : center.power}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-6 border-t border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="flex -space-x-2">
                                    {[1,2,3].map(i => (
                                        <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0A0B10] bg-slate-800 flex items-center justify-center text-[8px] font-black">U{i}</div>
                                    ))}
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0A0B10] bg-[#33375D] text-[8px] font-black text-white">+4</div>
                                </div>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Units</span>
                            </div>
                            <Button className="h-10 rounded-xl border border-white/10 bg-white/5 px-6 font-black text-[9px] uppercase tracking-widest text-white transition-all hover:bg-[#33375D]">
                                Open Terminal
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>

        {/* Tactical Map Sidebar */}
        <div className="lg:col-span-12 lg:xl:col-span-4 space-y-8">
             <div className="px-4">
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">Geospatial Intelligence</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Satellite uplink & regional hub distribution</p>
            </div>

            <Card className="bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-[48px] overflow-hidden shadow-2xl h-[400px] lg:h-[600px] relative group border-t border-t-white/20">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?q=80&w=800&auto=format&fit=crop')] bg-cover bg-center grayscale opacity-20 group-hover:opacity-40 transition-opacity duration-1000" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B10] via-transparent to-transparent" />
                
                <div className="absolute top-8 left-8 z-10 space-y-3">
                    <Badge className="rounded-full border-none bg-[#33375D] px-4 py-1.5 font-black text-[10px] uppercase tracking-[0.2em] text-white shadow-2xl">
                        AERIAL FEED: L6-ACTIVE
                    </Badge>
                    <div className="flex items-center gap-3 py-2 px-4 bg-[#0A0B10]/80 backdrop-blur-md rounded-2xl border border-white/5">
                        <Activity size={12} className="text-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Low Latency Connection</span>
                    </div>
                </div>

                <div className="absolute bottom-8 left-8 right-8 z-10">
                     <div className="p-6 bg-white/[0.03] backdrop-blur-xl rounded-[32px] border border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">Signal Optimization</p>
                            <span className="text-xs font-black text-[#8B92C9]">94.2%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#33375D]" style={{ width: '94%' }} />
                        </div>
                     </div>
                </div>

                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full border border-blue-500/30 animate-ping" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Target className="text-blue-500" size={48} />
                        </div>
                    </div>
                </div>
            </Card>
        </div>
      </div>
    </main>
  )
}
