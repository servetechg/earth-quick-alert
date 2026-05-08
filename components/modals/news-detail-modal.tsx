'use client'

import React from 'react'
import { X, Calendar, Tag, Share2, Activity, Shield, Clock, MapPin, Zap, Target, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface NewsItem {
    tag: string
    title: string
    description: string
    time: string
    fullContent?: string
}

interface NewsDetailModalProps {
    isOpen: boolean
    onClose: () => void
    newsItem: NewsItem | null
}

const getTagStyles = (tag: string) => {
    const t = tag.toLowerCase()
    if (t.includes('emergency')) return { bg: 'bg-rose-600/20', text: 'text-rose-500', border: 'border-rose-500/20' }
    if (t.includes('safety')) return { bg: 'bg-amber-600/20', text: 'text-amber-500', border: 'border-amber-500/20' }
    if (t.includes('community')) return { bg: 'bg-emerald-600/20', text: 'text-emerald-500', border: 'border-emerald-500/20' }
    return { bg: 'bg-blue-600/20', text: 'text-blue-500', border: 'border-blue-500/20' }
}

export function NewsDetailModal({ isOpen, onClose, newsItem }: NewsDetailModalProps) {
    if (!isOpen || !newsItem) return null

    const styles = getTagStyles(newsItem.tag)

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-12 bg-[#0A0B10]/95 backdrop-blur-xl animate-in fade-in duration-300">
            <Card className="w-full max-w-4xl bg-[#0A0B10] border border-white/10 rounded-[48px] shadow-2xl overflow-hidden flex flex-col relative max-h-full">
                {/* Decorative Background */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
                
                {/* Header */}
                <div className="relative p-10 lg:p-14 bg-white/[0.02] border-b border-white/5 group">
                    <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:scale-110 transition-transform duration-1000">
                        <Target size={240} />
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div className="space-y-6 flex-1">
                            <div className="flex items-center gap-4">
                                <span className={cn("px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border", styles.bg, styles.text, styles.border)}>
                                    <Tag className="w-3 h-3 inline mr-2" />
                                    {newsItem.tag}
                                </span>
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <Clock size={12} /> Dispatched {newsItem.time}
                                </div>
                            </div>
                            <h2 className="text-4xl lg:text-5xl font-black text-white uppercase tracking-tighter leading-none">{newsItem.title}</h2>
                        </div>
                        
                        <button
                            onClick={onClose}
                            className="absolute top-0 right-0 md:relative w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:rotate-90 transition-all text-white z-20"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-10 lg:p-14 space-y-12 relative z-10 bg-[#0A0B10]">
                    <div className="space-y-8">
                        <p className="text-xl lg:text-2xl font-medium text-slate-300 leading-relaxed italic border-l-4 border-blue-600 pl-8">
                            {newsItem.description}
                        </p>

                        <div className="prose prose-invert max-w-none">
                            <p className="text-lg text-slate-400 leading-relaxed whitespace-pre-line lowercase first-letter:uppercase">
                                {newsItem.fullContent || "Strategic intelligence summary active. This briefing contains verified operational data regarding ongoing sector activity. All personnel should maintain high-readiness status until signal normalization. \n\nDirectives include maintaining active terminal connection, verifying local life-safety clusters, and synchronizing with the primary EOC broadcast node."}
                            </p>
                        </div>
                    </div>

                    {/* Metadata Matrix */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <Card className="p-8 bg-white/[0.02] border border-white/5 rounded-[40px] shadow-inner space-y-4">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-3">
                                <Activity size={14} className="text-blue-500" /> Dispatch Registry
                            </h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Signal Category</p>
                                    <p className="text-sm font-black text-white uppercase tracking-tight">{newsItem.tag}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Authorization Time</p>
                                    <p className="text-sm font-black text-white uppercase tracking-tight">{newsItem.time}</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-8 bg-white/[0.02] border border-white/5 rounded-[40px] shadow-inner space-y-4">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-3">
                                <Shield size={14} className="text-emerald-500" /> Operational Source
                            </h3>
                            <div className="flex items-center gap-6">
                                <div className="w-12 h-12 bg-emerald-600/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                    <Shield size={24} />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-white uppercase tracking-tighter">Mission Management Core</p>
                                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Verified Tactical Signal</p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-10 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-8">
                        <Button
                            onClick={() => {
                                if (navigator.share) {
                                    navigator.share({
                                        title: newsItem.title,
                                        text: newsItem.description,
                                    })
                                }
                            }}
                            className="h-14 px-8 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all flex items-center gap-3"
                        >
                            <Share2 size={16} /> Broadcast Intel
                        </Button>
                        <Button
                            onClick={onClose}
                            className="flex h-14 items-center gap-3 rounded-2xl bg-[#33375D] px-10 font-black text-[10px] uppercase tracking-widest text-white shadow-2xl shadow-[#33375D]/25 transition-all hover:bg-[#2B2F50] active:scale-95"
                        >
                            Close Briefing <ArrowUpRight size={16} />
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    )
}
