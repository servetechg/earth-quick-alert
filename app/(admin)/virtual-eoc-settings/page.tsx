'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { 
    Settings, 
    Shield, 
    Zap, 
    Globe, 
    Bell, 
    User, 
    Lock, 
    Database, 
    CloudLightning,
    Activity,
    Cpu,
    Radio,
    Terminal,
    Sparkles,
    Target,
    ChevronRight,
    Save
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-8 lg:p-12 space-y-12 overflow-hidden relative selection:bg-[#33375D]/15">
      <div className="pointer-events-none absolute top-0 right-0 h-[600px] w-[600px] rounded-full bg-[#33375D]/5 blur-[150px]" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-white/5">
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[#33375D] shadow-sm">
                    <Settings size={24} />
                </div>
                <div>
                    <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Command Settings</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Operational Profile & Terminal Configuration</p>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <Button 
                className="h-14 gap-3 rounded-2xl bg-[#33375D] px-8 font-black text-[10px] uppercase tracking-widest text-white shadow-lg shadow-[#33375D]/25 hover:bg-[#2B2F50]"
            >
                 <Save size={16} /> Save Configurations
            </Button>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
        
        {/* Navigation Sidebar */}
        <div className="lg:col-span-3 space-y-4">
            {[
                { icon: Shield, label: 'Security & Access', active: true },
                { icon: Bell, label: 'Alert Protocols', active: false },
                { icon: Radio, label: 'Signal Broadcast', active: false },
                { icon: Cpu, label: 'AI Core Logic', active: false },
                { icon: Database, label: 'Data Retention', active: false },
                { icon: Globe, label: 'Regional Focus', active: false },
            ].map((item, i) => (
                <button 
                    key={i}
                    className={cn(
                        "w-full flex items-center justify-between p-6 rounded-[24px] transition-all group",
                        item.active 
                            ? "bg-[#33375D] text-white shadow-xl shadow-[#33375D]/25" 
                            : "bg-white border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
                    )}
                >
                    <div className="flex items-center gap-4">
                        <item.icon size={20} />
                        <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
                    </div>
                    <ChevronRight size={16} className={cn("transition-transform", item.active ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
                </button>
            ))}
        </div>

        {/* Main Settings Area */}
        <div className="lg:col-span-9 space-y-8">
            <Card className="bg-white border border-slate-100 rounded-[48px] p-10 shadow-xl shadow-slate-200/50 space-y-12">
                
                {/* Section 1: Core Automation */}
                <div className="space-y-8">
                    <div className="flex items-center gap-4 px-2">
                        <div className="h-6 w-1.5 rounded-full bg-[#33375D] shadow-[0_0_10px_rgba(51,55,93,0.35)]" />
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Automation Engine</h3>
                    </div>

                    <div className="space-y-4">
                        {[
                            { title: 'Auto-Activate EOC', sub: 'Engage operational mode when high-tier signals are detected', icon: Zap },
                            { title: 'Predictive Resource Staging', sub: 'Enable AI to pre-allocate assets based on storm pathing', icon: CloudLightning },
                            { title: 'Autonomous Civilian Ping', sub: 'Send safety checks without manual authorization', icon: Activity }
                        ].map((setting, i) => (
                            <div key={i} className="bg-slate-50 border border-slate-100 rounded-[32px] p-8 flex items-center justify-between group hover:bg-slate-100/50 transition-all shadow-sm">
                                <div className="flex items-center gap-6">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[#33375D] shadow-sm">
                                        <setting.icon size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{setting.title}</h4>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{setting.sub}</p>
                                    </div>
                                </div>
                                <Switch className="data-[state=checked]:bg-[#33375D]" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Section 2: National Alert Subscription (Sarah's Picklist) */}
                <div className="space-y-8">
                    <div className="flex items-center gap-4 px-2">
                        <div className="w-1.5 h-6 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]" />
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">National Alert Subscription</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            { name: 'Hurricane Protocol', sub: 'Watch/Warning Tracking', icon: CloudLightning, color: 'text-blue-600' },
                            { name: 'Blizzard Signal', sub: 'Winter Storm Monitoring', icon: Sparkles, color: 'text-slate-400' },
                            { name: 'Severe Thunderstorm', sub: 'Automatic Live Vectoring', icon: Zap, color: 'text-amber-500' },
                            { name: 'Flash Flood Signal', sub: 'Hydrological Response', icon: Activity, color: 'text-emerald-600' },
                            { name: 'Tornado Protocol', sub: 'Critical (Factory Setting)', icon: Target, color: 'text-red-500', locked: true },
                            { name: 'Hazmat Watch', sub: 'Chemical Detection Flow', icon: Shield, color: 'text-purple-600' }
                        ].map((alert, i) => (
                            <div key={i} className="bg-slate-50 border border-slate-100 rounded-[32px] p-6 flex flex-col justify-between group hover:bg-slate-100/50 transition-all relative overflow-hidden shadow-sm">
                                {alert.locked && <div className="absolute top-4 right-6 text-[8px] font-black text-red-500 uppercase tracking-widest border border-red-500/20 px-2 py-0.5 rounded-full">Primary Node</div>}
                                <div className="space-y-4">
                                    <div className={cn("w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm", alert.color)}>
                                        <alert.icon size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-tight">{alert.name}</h4>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{alert.sub}</p>
                                    </div>
                                </div>
                                <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">{alert.locked ? 'Mandatory' : 'Active'}</span>
                                    <Switch defaultChecked={alert.locked} disabled={alert.locked} className="data-[state=checked]:bg-[#33375D]" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Section 3: Terminal Customization */}
                <div className="space-y-8">
                    <div className="flex items-center gap-4 px-2">
                        <div className="w-1.5 h-6 bg-purple-600 rounded-full shadow-[0_0_10px_rgba(147,51,234,0.3)]" />
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Terminal Interface</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-50 border border-slate-100 rounded-[32px] p-8 space-y-6">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Signal Highlighting</h4>
                            <div className="flex flex-wrap gap-3">
                                {['Neon Blue', 'Emerald', 'Amber', 'Matrix Green'].map((color, i) => (
                                    <button key={i} className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-[9px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
                                        {color}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-[32px] p-8 space-y-6">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Alert Soundscape</h4>
                            <div className="flex flex-wrap gap-3">
                                {['Tactical', 'Ambient', 'High Alert', 'Silent'].map((sound, i) => (
                                    <button key={i} className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-[9px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
                                        {sound}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Danger Zone */}
            <Card className="bg-red-50 border border-red-100 rounded-[40px] p-10 flex flex-col md:flex-row items-center justify-between gap-8 group shadow-xl shadow-red-900/5">
                <div className="flex items-center gap-8">
                    <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-600/20 group-hover:scale-110 transition-transform">
                        <Terminal size={32} />
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Emergency Purge</h4>
                        <p className="text-[10px] font-black text-red-600/60 uppercase tracking-widest mt-1">Wipe all operational logs and cache instantly</p>
                    </div>
                </div>
                <Button variant="destructive" className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[10px]">
                    Initiate Purge
                </Button>
            </Card>
        </div>
      </div>
    </main>
  )
}
