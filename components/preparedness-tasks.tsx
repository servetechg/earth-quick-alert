'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ListChecks, ClipboardCheck, Clock, Shield, Target } from 'lucide-react'

interface Task {
    id: number;
    label: string;
    status: string;
    color: string;
}

export function PreparednessTasks() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTasks = async () => {
            try {
                const res = await fetch('/api/admin/tasks');
                const json = await res.json();
                if (json.success) {
                    setTasks(json.data);
                }
            } catch (err) {
                console.error('Failed to fetch admin tasks:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchTasks();
        const interval = setInterval(fetchTasks, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    return (
        <Card className="bg-white border border-slate-100 rounded-[40px] p-8 h-full relative overflow-hidden group shadow-xl shadow-slate-200/50">
            {/* Background Artifact */}
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity pointer-events-none">
                <ListChecks size={140} className="rotate-12" />
            </div>

            <div className="relative z-10 flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#33375D] rounded-2xl flex items-center justify-center text-white shadow-2xl">
                        <ClipboardCheck size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Mission Checkpoints</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Post-Event & Recovery Queue</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Target size={14} className="text-blue-500" />
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic">{tasks.length} Active</span>
                </div>
            </div>

            <div className="space-y-3 relative z-10">
                {loading ? (
                    [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl bg-slate-50 border border-slate-100" />)
                ) : (
                    tasks.map((task) => (
                        <div key={task.id} className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all group/task">
                            <div className="flex items-center gap-4">
                                <div className={cn("w-1.5 h-1.5 rounded-full", 
                                    task.status === 'Pending' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                                )} />
                                <span className="text-xs font-black text-slate-600 group-hover/task:text-slate-900 uppercase tracking-tight transition-colors">{task.label}</span>
                            </div>
                            <div className={cn("px-3 py-1.5 rounded-xl border flex items-center gap-2 group-hover/task:scale-110 transition-transform", 
                                task.status === 'Pending' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                            )}>
                                <Clock size={10} />
                                <span className="text-[9px] font-black uppercase tracking-widest">{task.status}</span>
                            </div>
                        </div>
                    ))
                )}

                {tasks.length === 0 && !loading && (
                    <div className="py-20 flex flex-col items-center justify-center opacity-20">
                        <Shield size={40} className="text-slate-500 mb-4" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">No Pending Protocols</span>
                    </div>
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.4em] text-center italic">Ready2Go Resilience Protocol v4.0</p>
            </div>
        </Card>
    )
}
