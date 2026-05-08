'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  MapPin, 
  Activity, 
  Phone, 
  MoreVertical,
  Siren,
  Truck,
  Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Responder {
  _id: string
  name: string
  type: string
  status: string
  location: string
  city: string
  availability: boolean
  contact: string
}

interface ResponderTableProps {
  responders: Responder[]
  loading?: boolean
}

export function ResponderTable({ responders, loading }: ResponderTableProps) {
  return (
    <Card className="border border-slate-200 rounded-[32px] overflow-hidden bg-white shadow-sm h-full flex flex-col">
      <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#33375D] text-white shadow-lg shadow-[#33375D]/25 transition-transform hover:scale-105">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Responders Directory</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mt-1">
              <Plus size={10} className="text-blue-500" /> Live Personnel Tracking
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl border border-emerald-100 flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-700">
             <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
             <span className="text-[10px] font-black uppercase tracking-widest">System Online</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Unit Name</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Deployment</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Location</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
              <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-8 py-6 h-16 bg-slate-50/20" />
                </tr>
              ))
            ) : responders.length > 0 ? (
              responders.map((responder) => (
                <tr key={responder._id} className="group hover:bg-slate-50/50 transition-all duration-200">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                        responder.type === 'Fire' ? 'bg-red-50 text-red-600 border border-red-100' :
                        responder.type === 'Police' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                        'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      )}>
                        {responder.type === 'Fire' ? <Truck size={18} /> : 
                         responder.type === 'Police' ? <Siren size={18} /> : 
                         <Activity size={18} />}
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{responder.name}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{responder.type} Unit</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-600 uppercase">
                        <MapPin size={10} className="text-slate-400" /> {responder.city}
                      </div>
                      <div className="text-[9px] font-bold text-slate-400 italic">Sector: {responder.location}</div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-[10px] font-black text-slate-600 uppercase tracking-tight">
                       {responder.location}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <Badge className={cn(
                      "font-black px-3 py-1 rounded-full text-[9px] uppercase tracking-widest border-none shadow-sm",
                      responder.status === 'Active' ? 'bg-emerald-50 text-emerald-600' :
                      responder.status === 'Standby' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    )}>
                      {responder.status}
                    </Badge>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors border border-transparent hover:border-blue-100">
                          <Phone size={14} />
                       </button>
                       <button className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                          <MoreVertical size={14} />
                       </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-8 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px] italic">
                   No responders found in current database
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="p-6 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic leading-none">
          Showing {responders.length} units deployed in field
        </p>
        <div className="flex gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
           <div className="w-1.5 h-1.5 rounded-full bg-blue-300" />
           <div className="w-1.5 h-1.5 rounded-full bg-blue-100" />
        </div>
      </div>
    </Card>
  )
}
