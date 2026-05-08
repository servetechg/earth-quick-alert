'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Zap, Activity, ShieldCheck, Radar, Shield, Target, Activity as ActivityIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EOCData {
    insights: string[];
    activities: { label: string; status: string }[];
    metrics: {
        activeEvents: number;
        alertsPerHour: number;
        responseUnits: number;
    }
}

export function VirtualEOCOperations() {
    const [data, setData] = useState<EOCData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/admin/eoc');
                const json = await res.json();
                if (json.success) {
                    setData(json.data);
                }
            } catch (err) {
                console.error('Failed to fetch EOC data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <Card className="bg-white border border-slate-100 rounded-[40px] p-8 h-full relative overflow-hidden group shadow-xl shadow-slate-200/50">
            {/* Background Artifact */}
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                <ActivityIcon size={140} className="animate-pulse" />
            </div>

            <div className="relative z-10 flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#33375D] rounded-2xl flex items-center justify-center text-white shadow-2xl">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Virtual EOC Operations</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Live Multi-Vector Management</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Units</p>
                        <div className="flex items-center gap-2 justify-end">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <p className="text-lg font-black text-slate-900 leading-none">{loading ? '...' : data?.metrics.responseUnits}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                            <Zap size={14} className="text-amber-500" /> AI Insights
                        </h4>
                        <span className="text-[8px] font-black text-slate-400 uppercase italic">NEURAL STATUS: OPTIMAL</span>
                    </div>
                    <div className="space-y-4">
                        {loading ? (
                            [1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl bg-slate-100 border-none" />)
                        ) : (
                            data?.insights.map((insight, idx) => (
                                <div key={idx} className={cn(
                                    "p-5 rounded-2xl border transition-all hover:bg-slate-50",
                                    idx === 1 ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-100"
                                )}>
                                    <p className="text-[12px] font-bold text-slate-700 leading-relaxed uppercase tracking-tight">
                                        {insight}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                            <Target size={14} className="text-[#33375D]" /> Mission Log
                        </h4>
                        <span className="text-[8px] font-black text-emerald-600 uppercase italic">98% COMPLIANCE</span>
                    </div>
                    <div className="space-y-3">
                        {loading ? (
                            [1, 2, 3, 4].map(i => (
                                <div key={i} className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl">
                                    <Skeleton className="h-3 w-32 bg-slate-200" />
                                    <Skeleton className="h-5 w-16 rounded-full bg-slate-200" />
                                </div>
                            ))
                        ) : (
                            data?.activities.map((activity, idx) => (
                                <div key={idx} className="flex items-center justify-between group/activity bg-slate-50 border border-slate-100 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                                    <span className="text-[11px] font-black text-slate-600 group-hover/activity:text-slate-900 uppercase tracking-widest transition-colors">{activity.label}</span>
                                    <div className="flex items-center gap-3 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 shadow-lg shadow-emerald-500/[0.05]">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{activity.status}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="mt-10 pt-8 border-t border-slate-100 space-y-4">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em]">
                            <span className="text-slate-400">Operation Readiness Matrix</span>
                            <span className="text-emerald-500">98% OPTIMAL</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                            <div className="h-full bg-emerald-500 w-[98%] rounded-full shadow-[0_0_15px_rgba(16,185,129,0.2)] animate-pulse" />
                        </div>
                        <p className="text-[7px] font-black text-slate-600 uppercase tracking-[0.4em] text-center mt-2 italic">Systems Scan Positive • No Protocol Violations Detected</p>
                    </div>
                </div>
            </div>
        </Card>
    )
}
