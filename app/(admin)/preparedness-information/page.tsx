'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import {
  MapPin,
  Globe,
  Flame,
  User,
  ShieldCheck,
  CheckCircle2,
  Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { category: 'individual_evacuation', title: 'Individual Evacuation', Icon: MapPin, colorClass: 'text-orange-600', bgClass: 'bg-orange-50' },
  { category: 'community_evacuation', title: 'Community Evacuation', Icon: Globe, colorClass: 'text-blue-600', bgClass: 'bg-blue-50' },
  { category: 'shelter_in_place', title: 'General Shelter-in-Place', Icon: MapPin, colorClass: 'text-blue-600', bgClass: 'bg-blue-50' },
  { category: 'active_shooter', title: 'Active Shooter Preparedness', Icon: Flame, colorClass: 'text-red-600', bgClass: 'bg-red-50' },
  { category: 'pets_household', title: 'Planning for Household Pets', Icon: User, colorClass: 'text-purple-600', bgClass: 'bg-purple-50' },
  { category: 'pets_large', title: 'Planning for Large Animals', Icon: Globe, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50' },
  { category: 'identity_theft', title: 'Identity Theft Protection', Icon: ShieldCheck, colorClass: 'text-purple-600', bgClass: 'bg-purple-50' },
  { category: 'choking_first_aid', title: 'Choking First Aid', Icon: CheckCircle2, colorClass: 'text-rose-600', bgClass: 'bg-rose-50' },
] as const

export default function PreparednessInformationPage() {
  return (
    <main className="min-h-screen bg-slate-50/50 pb-20">
      <div className="px-6 lg:px-12 pt-8 space-y-8 max-w-[1800px] mx-auto">
        <Card className="p-8 border-slate-200 rounded-2xl shadow-sm relative overflow-hidden bg-white group transition-all hover:shadow-md">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#33375D] transition-colors" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Preparedness Information</h1>
              <p className="text-slate-500 font-medium">
                Preparedness areas (boxes) are defined in the database by category and order. Detailed tasks are managed via the admin task workflows.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
              <Activity size={14} className="text-emerald-500" />
              Reference sections
            </div>
          </div>
        </Card>

        <div className="bg-gradient-to-r from-red-700 to-rose-600 rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl shadow-red-900/20 group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl transition-all group-hover:bg-white/20" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/30 border border-red-400/30 text-[10px] font-black uppercase tracking-widest mb-4">
                <ShieldCheck size={12} /> Critical Guidance
              </div>
              <h2 className="text-3xl font-black tracking-tight mb-3">Community Preparedness Guide</h2>
              <p className="text-red-50/90 font-medium max-w-2xl leading-relaxed">
                Review these protocol areas with your organization. Checklist content previously stored here has been removed from the preparedness guide model in favor of structured tasks.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {SECTIONS.map((config) => (
            <Card
              key={config.category}
              className="p-8 border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">{config.title}</h3>
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', config.bgClass, config.colorClass)}>
                  <config.Icon size={20} />
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Category key: <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{config.category}</span>
              </p>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
