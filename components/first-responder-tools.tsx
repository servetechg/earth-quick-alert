'use client'

import React, { useState } from 'react'
import { FileText, ListTodo, Building2, ShieldCheck, Zap, Activity, Shield, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SituationReportModal } from '@/components/modals/situation-report-modal'
import { NotifyLeadersModal } from '@/components/modals/notify-leaders-modal'
import { GISEOCActivatedModal } from '@/components/modals/gis-eoc-activated-modal'
import { SendCommunityAlertModal } from '@/components/modals/send-community-alert-modal'

export function FirstResponderTools() {
    const [modals, setModals] = useState({
        sitRep: false,
        assignTask: false,
        infrastructure: false,
        resource: false
    });

    const toggleModal = (key: keyof typeof modals, value: boolean) => {
        setModals(prev => ({ ...prev, [key]: value }));
    };

    const tools = [
        {
            icon: Building2,
            label: 'Infrastructure Status',
            sub: 'Critical Assets',
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            badge: '03 Pending',
            onClick: () => toggleModal('infrastructure', true)
        },
        {
            icon: Activity,
            label: 'Real-Time SitRep',
            sub: 'Operational Logic',
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            badge: 'AI Active',
            onClick: () => toggleModal('sitRep', true)
        },
        {
            icon: Shield,
            label: 'Authorize Resource',
            sub: 'FEMA Pipeline',
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            badge: 'Encrypted',
            onClick: () => toggleModal('resource', true)
        },
        {
            icon: Terminal,
            label: 'Command Dispatch',
            sub: 'Unit Coordination',
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            badge: 'Locked',
            onClick: () => toggleModal('assignTask', true)
        }
    ]

    return (
        <div className="bg-white border border-slate-100 rounded-[40px] p-8 h-full relative overflow-hidden group shadow-xl shadow-slate-200/50">
            {/* Background Artifact */}
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                <ShieldCheck size={140} className="rotate-12" />
            </div>

            <div className="relative z-10 flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#33375D] rounded-2xl flex items-center justify-center text-white">
                        <Terminal size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Field Command Tools</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Responder-Grade Tactical Utilities</p>
                    </div>
                </div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                {tools.map((tool, index) => (
                    <button
                        key={index}
                        onClick={tool.onClick}
                        className={cn(
                            "flex flex-col items-start gap-4 p-6 rounded-[32px] transition-all hover:bg-slate-50/50 active:scale-[0.98] border border-slate-100 group/btn shadow-sm",
                            tool.bg.replace('500/10', '50/50')
                        )}
                    >
                        <div className="flex items-center justify-between w-full">
                            <div className={cn("w-10 h-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-sm group-hover/btn:scale-110 transition-transform", tool.color.replace('400', '600'))}>
                                <tool.icon size={20} />
                            </div>
                            {tool.badge && (
                                <span className="px-3 py-1 rounded-full bg-slate-50 text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 border border-slate-100 group-hover/btn:text-slate-900 transition-colors">
                                    {tool.badge}
                                </span>
                            )}
                        </div>
                        <div className="space-y-1">
                            <span className="text-[14px] font-black text-slate-900 uppercase tracking-tight text-left block">
                                {tool.label}
                            </span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left block group-hover/btn:text-slate-600 transition-colors">
                                {tool.sub}
                            </span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Modals Integration */}
            <SituationReportModal
                isOpen={modals.sitRep}
                onClose={() => toggleModal('sitRep', false)}
            />
            <NotifyLeadersModal
                isOpen={modals.assignTask}
                onClose={() => toggleModal('assignTask', false)}
            />
            <GISEOCActivatedModal
                isOpen={modals.infrastructure}
                onClose={() => toggleModal('infrastructure', false)}
            />
            <SendCommunityAlertModal
                isOpen={modals.resource}
                onClose={() => toggleModal('resource', false)}
            />
        </div>
    )
}
