'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { 
    Edit, 
    Loader2, 
    Upload, 
    File, 
    FileText, 
    Trash2, 
    Plus, 
    Folder, 
    Search, 
    Shield, 
    Zap, 
    Info, 
    CheckCircle,
    Download,
    Share2,
    Filter,
    ChevronRight,
    Target,
    Activity,
    Navigation2,
    Sparkles
} from 'lucide-react'

type EmergencyAttachment = {
  fileName: string;
  fileUrl: string;
  size: number;
  uploadedAt: string;
}

type EmergencyPlanDef = {
  id?: string;
  label: string;
  overview: string;
  steps: string[];
  attachments: EmergencyAttachment[];
}

export default function EmergencyPlanPage() {
  const [plans, setPlans] = useState<Record<string, EmergencyPlanDef>>({})
  const [selectedPlan, setSelectedPlan] = useState('facility_continuity')
  const [isLoading, setIsLoading] = useState(true)

  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/admin/emergency-plans')
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          setPlans(data.data)
        }
      }
    } catch (err) {
      console.error("Failed to fetch COOP plans:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-[#0A0B10]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
              <Loader2 className="w-16 h-16 animate-spin text-[#33375D]" />
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-blue-400">PLAN</div>
          </div>
          <p className="font-black text-xs uppercase tracking-[0.4em] text-slate-500 animate-pulse">Synchronizing Planning Database...</p>
        </div>
      </div>
    )
  }

  const documentCategories = [
    { name: 'Response Plans', count: 4, icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { name: 'COOP Protocols', count: 2, icon: Shield, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'Business Continuity', count: 3, icon: Folder, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { name: 'Compliance Vault', count: 1, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ]

  return (
    <main className="min-h-screen bg-[#0A0B10] p-8 lg:p-12 space-y-12 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header Section */}
      <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-white/5">
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#33375D] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-blue-600/20">
                    <Folder size={24} />
                </div>
                <div>
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter">COOP / BC Plans</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Continuity of Operations & Strategic Recovery</p>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <Button 
                onClick={() => toast.info('Selecting strategic source for bulk protocol ingest...')}
                className="h-14 px-8 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all gap-3"
            >
                 <Upload size={16} /> Bulk Import
            </Button>
            <Button 
                onClick={() => toast.success('Initializing New Continuity Framework...')}
                className="h-14 gap-3 rounded-2xl bg-[#33375D] px-8 font-black text-[10px] uppercase tracking-widest text-white shadow-2xl shadow-[#33375D]/25 hover:bg-[#2B2F50]"
            >
                 <Plus size={16} /> New Continuity Plan
            </Button>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
         {documentCategories.map((cat, i) => (
            <Card key={i} className="p-8 bg-white/[0.02] border border-white/5 rounded-[40px] shadow-2xl hover:bg-white/[0.04] transition-all cursor-pointer group relative overflow-hidden">
                <div className={cn("inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-6", cat.bg, cat.color)}>
                    <cat.icon size={28} />
                </div>
                <div className="flex justify-between items-end">
                    <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-tight leading-tight">{cat.name}</h4>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Strategic Files</p>
                    </div>
                    <span className="text-2xl font-black text-white group-hover:text-blue-400 transition-colors">{cat.count}</span>
                </div>
            </Card>
         ))}
      </div>

      {/* Main Content: File Explorer */}
      <Card className="bg-slate-900/40 backdrop-blur-3xl border-white/5 rounded-[48px] shadow-2xl overflow-hidden relative">
         <div className="p-10 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="relative w-full max-w-xl">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <Input 
                   placeholder="SEARCH CONTINUITY PROTOCOLS..." 
                   className="h-16 pl-16 rounded-[24px] bg-white/[0.03] border-white/5 text-white font-black text-xs placeholder:text-slate-600 focus:ring-blue-500/20 focus:border-blue-500/40 uppercase tracking-widest"
                />
            </div>
            <div className="flex items-center gap-4">
                <div className="h-16 px-6 bg-white/[0.03] border border-white/5 rounded-[24px] flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Database Linked</span>
                    </div>
                </div>
            </div>
         </div>

         <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
            <table className="w-full">
                <thead>
                    <tr className="bg-white/[0.02]">
                        <th className="px-10 py-8 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Resource Identifier</th>
                        <th className="px-10 py-8 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">File Matrix</th>
                        <th className="px-10 py-8 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Audit Cycle</th>
                        <th className="px-10 py-8 text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">AI Integrity</th>
                        <th className="px-10 py-8 text-right text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Protocols</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {[
                        { name: 'NY_Operational_COOP_v4.pdf', type: 'PDF', audit: '2 hours ago', status: 'In Sync', color: 'text-emerald-500', bar: 'bg-emerald-500', width: 'w-full' },
                        { name: 'IT_Critical_Systems_Recovery.docx', type: 'DOCX', audit: '12 hours ago', status: 'Reviewing', color: 'text-blue-500', bar: 'bg-blue-500', width: 'w-2/3' },
                        { name: 'Supply_Chain_Resilience_2024.pdf', type: 'PDF', audit: '1 day ago', status: 'In Sync', color: 'text-emerald-500', bar: 'bg-emerald-500', width: 'w-full' },
                        { name: 'Facility_Accessibility_Plan.pdf', type: 'PDF', audit: '3 days ago', status: 'Deviation Found', color: 'text-red-500', bar: 'bg-red-500', width: 'w-1/3' },
                    ].map((doc, i) => (
                        <tr key={i} className="group hover:bg-white/[0.03] transition-all">
                            <td className="px-10 py-8">
                                <div className="flex items-center gap-6">
                                    <div className="w-14 h-14 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-blue-400 group-hover:bg-blue-600/10 transition-all">
                                        <FileText size={24} />
                                    </div>
                                    <div>
                                        <span className="text-sm font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{doc.name}</span>
                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Encrypted Storage</p>
                                    </div>
                                </div>
                            </td>
                            <td className="px-10 py-8">
                                <span className="h-8 px-4 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center w-fit text-[9px] font-black text-slate-500 uppercase tracking-widest">{doc.type}</span>
                            </td>
                            <td className="px-10 py-8 text-sm font-black text-slate-400 uppercase tracking-widest">{doc.audit}</td>
                            <td className="px-10 py-8 text-center min-w-[200px]">
                                <div className="flex flex-col items-center">
                                    <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] mb-3", doc.color)}>{doc.status}</span>
                                    <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full transition-all duration-1000", doc.bar, doc.width)} />
                                    </div>
                                </div>
                            </td>
                            <td className="px-10 py-8 text-right">
                                <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                                    <Button size="icon" className="h-10 w-10 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all"><Zap size={16} /></Button>
                                    <Button size="icon" className="h-10 w-10 bg-white/5 text-slate-400 hover:bg-white/10 rounded-xl transition-all"><Edit size={16} /></Button>
                                    <Button size="icon" className="h-10 w-10 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-all"><Trash2 size={16} /></Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
         </div>
      </Card>

      {/* AI Intelligence Note */}
      <div className="bg-blue-600/5 p-12 rounded-[48px] border border-blue-500/10 flex flex-col lg:flex-row gap-12 relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-12 text-blue-500/5 grayscale group-hover:grayscale-0 transition-all duration-1000">
            <Sparkles size={160} />
         </div>
         <div className="w-20 h-20 bg-blue-600 rounded-[30px] flex items-center justify-center text-white shadow-2xl shadow-blue-600/20 shrink-0 relative z-10">
            <Zap size={40} />
         </div>
         <div className="relative z-10 space-y-4">
            <h4 className="text-2xl font-black text-white uppercase tracking-tighter">AI-Driven Continuity Audit</h4>
            <p className="text-base font-medium text-slate-400 leading-relaxed max-w-5xl">
               Our neural engine proactively maps real-time incident actions against the current COOP/BC protocols. 
               Any structural deviation from established recovery paths is instantly serialized and pushed 
               to the mission commander via the <span className="text-blue-400 font-black cursor-pointer hover:underline uppercase tracking-widest text-xs">Tactical AI Feed</span>.
               <br/><br/>
               <Button variant="link" className="p-0 h-auto text-blue-500 font-black uppercase tracking-[0.2em] text-[10px] hover:text-blue-400 transition-colors">
                  Force Global AI Re-Alignment on Updated Plans
               </Button>
            </p>
         </div>
      </div>
    </main>
  )
}
