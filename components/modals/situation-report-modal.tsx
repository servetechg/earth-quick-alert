'use client'

import { X, FileText, AlertCircle, TrendingUp, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SituationReportModalProps {
    isOpen: boolean
    onClose: () => void
}

export function SituationReportModal({ isOpen, onClose }: SituationReportModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-500">
                <div className="bg-slate-50 p-6 text-slate-900 flex items-center justify-between border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-blue-400" />
                        <div>
                            <h2 className="text-2xl font-bold">Situation Report</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Report ID: R2G-2026-0423-01</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-900">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
                    {/* Executive Summary */}
                    <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 flex gap-4">
                        <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
                        <div>
                            <h3 className="font-bold text-blue-900 mb-1">AI Executive Summary</h3>
                            <p className="text-sm text-blue-800 leading-relaxed font-medium">
                                Current atmospheric conditions indicate rapid stabilization in Zone A. Responders have contained 85% of primary debris zones. Citizen safe check-ins are at 92%, with primary focus shifting to utility restoration in Western District.
                            </p>
                        </div>
                    </div>

                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3 mb-3 text-slate-500">
                                <Users className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">Citizen Status</span>
                            </div>
                            <p className="text-2xl font-black text-slate-900">12,457 <span className="text-sm font-bold text-green-500">+4%</span></p>
                            <p className="text-xs font-medium text-slate-400 mt-1">Check-ins increase since last hour</p>
                        </div>
                        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3 mb-3 text-slate-500">
                                <TrendingUp className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">Containment</span>
                            </div>
                            <p className="text-2xl font-black text-slate-900">85%</p>
                            <p className="text-xs font-medium text-slate-400 mt-1">Progress towards full containment</p>
                        </div>
                    </div>

                    {/* Detailed Observations */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <div className="w-2 h-6 bg-blue-500 rounded-full" />
                            Detailed Observations
                        </h3>
                        <div className="space-y-3">
                            {[
                                { label: 'Public Sentiment', value: 'Cautiously Optimistic (AI Analysis)' },
                                { label: 'Resource Efficiency', value: 'High - Tier 1 Protocols' },
                                { label: 'Communications Delay', value: '0.4s (Optimal)' },
                            ].map((obs, idx) => (
                                <div key={idx} className="flex items-center justify-between py-3 border-b border-slate-100">
                                    <span className="text-sm font-medium text-slate-500">{obs.label}</span>
                                    <span className="text-sm font-bold text-slate-900">{obs.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <Button variant="outline" className="flex-1 py-6 rounded-xl font-bold border-2 border-slate-200 hover:bg-slate-50">
                            Download PDF
                        </Button>
                        <Button className="flex-1 rounded-xl bg-[#33375D] py-6 font-bold text-white shadow-lg shadow-[#33375D]/25 transition-all hover:bg-[#2B2F50] active:scale-95">
                            Distribute to Agencies
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
