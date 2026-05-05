'use client'

import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Plus,
  Save,
  Search,
  Bell,
  MapPin,
  Smartphone,
  ShieldAlert,
  Wind,
  Info,
  ExternalLink,
  ShieldCheck,
  Phone,
  Cloud,
  Flame,
  User,
  Activity,
  Stethoscope,
  Globe,
  Briefcase,
  PlusSquare,
  EyeOff,
  Shield,
  CheckCircle2,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { useEffect, useCallback } from 'react'

interface Guide {
  _id?: string;
  category: string;
  title: string;
  items: string[];
}

export default function PreparednessInformationPage() {
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
  const [editingItem, setEditingItem] = useState<{ category: string, index: number, text: string } | null>(null)
  const [newItemText, setNewItemText] = useState<{ [key: string]: string }>({})

  const fetchGuides = useCallback(async () => {
    try {
      const res = await fetch('/api/preparedness-guides')
      const data = await res.json()
      if (Array.isArray(data)) {
        setGuides(data)
      }
    } catch (error) {
      console.error('Failed to fetch guides:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGuides()
  }, [fetchGuides])

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSaveGuide = async (category: string) => {
    const guide = guides.find(g => g.category === category)
    if (!guide) return

    setSaving(category)
    try {
      const res = await fetch('/api/preparedness-guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guide)
      })
      if (res.ok) {
        // Optional: show toast or success state
      }
    } catch (error) {
      console.error('Failed to save guide:', error)
    } finally {
      setSaving(null)
    }
  }

  const handleDeleteItem = async (category: string, index: number) => {
    const updatedGuides = guides.map(g => {
      if (g.category === category) {
        const newItems = [...g.items]
        newItems.splice(index, 1)
        return { ...g, items: newItems }
      }
      return g
    })
    setGuides(updatedGuides)
  }

  const handleAddItem = (category: string) => {
    const text = newItemText[category]?.trim()
    if (!text) return

    const updatedGuides = guides.map(g => {
      if (g.category === category) {
        return { ...g, items: [...g.items, text] }
      }
      return g
    })
    setGuides(updatedGuides)
    setNewItemText(prev => ({ ...prev, [category]: '' }))
  }

  const handleUpdateItem = () => {
    if (!editingItem) return
    const updatedGuides = guides.map(g => {
      if (g.category === editingItem.category) {
        const newItems = [...g.items]
        newItems[editingItem.index] = editingItem.text
        return { ...g, items: newItems }
      }
      return g
    })
    setGuides(updatedGuides)
    setEditingItem(null)
  }

  const getGuide = (category: string) => guides.find(g => g.category === category)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-[#33375D] animate-spin" />
          <p className="text-slate-500 font-bold animate-pulse">Synchronizing Intelligence...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50/50 pb-20">

      <div className="px-6 lg:px-12 pt-8 space-y-8 max-w-[1800px] mx-auto">
        {/* Main Header Card */}
        <Card className="p-8 border-slate-200 rounded-2xl shadow-sm relative overflow-hidden bg-white group transition-all hover:shadow-md">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#33375D] transition-colors" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Preparedness Information</h1>
              <p className="text-slate-500 font-medium">Guidance for your community on emergencies and safety measures, tailored to your needs.</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
              <Activity size={14} className="text-emerald-500" />
              Live Updates Enabled
            </div>
          </div>
        </Card>

        {/* Red Banner */}
        <div className="bg-gradient-to-r from-red-700 to-rose-600 rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl shadow-red-900/20 group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl transition-all group-hover:bg-white/20" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/30 border border-red-400/30 text-[10px] font-black uppercase tracking-widest mb-4">
                <ShieldCheck size={12} /> Critical Guidance
              </div>
              <h2 className="text-3xl font-black tracking-tight mb-3">Community Preparedness Guide</h2>
              <p className="text-red-50/90 font-medium max-w-2xl leading-relaxed">Stay prepared with actionable guidance for various emergency scenarios. Review these protocols regularly with your family and emergency contacts.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {[
            { category: 'individual_evacuation', title: 'Individual Evacuation', Icon: MapPin, colorClass: 'text-orange-600', bgClass: 'bg-orange-50' },
            { category: 'community_evacuation', title: 'Community Evacuation', Icon: Globe, colorClass: 'text-blue-600', bgClass: 'bg-blue-50' },
            { category: 'shelter_in_place', title: 'General Shelter-in-Place', Icon: MapPin, colorClass: 'text-blue-600', bgClass: 'bg-blue-50' },
            { category: 'active_shooter', title: 'Active Shooter Preparedness', Icon: Flame, colorClass: 'text-red-600', bgClass: 'bg-red-50' },
            { category: 'pets_household', title: 'Planning for Household Pets', Icon: User, colorClass: 'text-purple-600', bgClass: 'bg-purple-50' },
            { category: 'pets_large', title: 'Planning for Large Animals', Icon: Globe, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50' },
            { category: 'identity_theft', title: 'Identity Theft Protection', Icon: ShieldCheck, colorClass: 'text-purple-600', bgClass: 'bg-purple-50' },
            { category: 'choking_first_aid', title: 'Choking First Aid', Icon: CheckCircle2, colorClass: 'text-rose-600', bgClass: 'bg-rose-50' }
          ].map((config) => (
            <Card key={config.category} className="p-8 border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col hover:shadow-md transition-shadow group">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">{getGuide(config.category)?.title || config.title}</h3>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", config.bgClass, config.colorClass)}>
                  <config.Icon size={20} />
                </div>
              </div>
              <div className="space-y-6 flex-1">
                {(getGuide(config.category)?.items || []).map((item, i) => (
                  <EditableItem
                    key={i}
                    label={item}
                    category={config.category}
                    index={i}
                    editingItem={editingItem}
                    setEditingItem={setEditingItem}
                    handleUpdateItem={handleUpdateItem}
                    handleDeleteItem={handleDeleteItem}
                    toggleCheck={toggleCheck}
                    checkedItems={checkedItems}
                  />
                ))}
                <AddItemControl
                  category={config.category}
                  newItemText={newItemText}
                  setNewItemText={setNewItemText}
                  handleAddItem={handleAddItem}
                />
              </div>
              <div className="mt-8 flex items-center justify-end gap-3">
                <Button
                  onClick={() => handleSaveGuide(config.category)}
                  disabled={saving === config.category}
                  className="h-11 px-6 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200 transition-all active:scale-95 disabled:opacity-50"
                >
                  {saving === config.category ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Footer Resources */}
        {/* <div className="pt-20 space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-slate-900 border-l-4 border-blue-600 pl-4">
              <h2 className="text-2xl font-black tracking-tight uppercase tracking-tight">Additional Resources</h2>
            </div>
            <p className="text-xs font-bold text-slate-400">Content verified by Emergency Services on {new Date().toLocaleDateString()}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <ResourceCard icon={Globe} color="blue" title="Ready.gov" desc="Official Federal Preparedness" />
            <ResourceCard icon={ShieldCheck} color="red" title="FEMA" desc="Disaster Assistance Center" />
            <ResourceCard icon={Plus} color="green" title="Red Cross" desc="First Aid & Emergency Training" />
            <ResourceCard icon={User} color="purple" title="IdentityTheft.gov" desc="Official Reporting Portal" />
          </div>
        </div> */}
      </div>
    </main>
  )
}

function EditableItem({
  label,
  category,
  index,
  isCheckbox = true,
  icon: Icon,
  editingItem,
  setEditingItem,
  handleUpdateItem,
  handleDeleteItem,
  toggleCheck,
  checkedItems
}: {
  label: string,
  category: string,
  index: number,
  isCheckbox?: boolean,
  icon?: any,
  editingItem: any,
  setEditingItem: any,
  handleUpdateItem: any,
  handleDeleteItem: any,
  toggleCheck: any,
  checkedItems: any
}) {
  const isEditing = editingItem?.category === category && editingItem?.index === index;

  return (
    <div className="group flex items-start gap-3 relative flex-1">
      {isEditing ? (
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={editingItem.text}
            onChange={(e) => setEditingItem({ ...editingItem, text: e.target.value })}
            className="flex-1 h-9 px-3 rounded-lg border border-blue-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleUpdateItem()}
          />
          <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-600 hover:bg-emerald-50" onClick={handleUpdateItem}><Check size={16} /></Button>
          <Button size="icon" variant="ghost" className="h-9 w-9 text-red-600 hover:bg-red-50" onClick={() => setEditingItem(null)}><X size={16} /></Button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 flex-1">
            {Icon ? <Icon className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />}
            <p className="text-sm font-medium text-slate-600 leading-relaxed transition-colors group-hover:text-slate-900">
              {label}
            </p>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/80 backdrop-blur-sm pl-2">
            <button
              onClick={(e) => { e.stopPropagation(); setEditingItem({ category, index, text: label }) }}
              className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteItem(category, index) }}
              className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AddItemControl({
  category,
  newItemText,
  setNewItemText,
  handleAddItem
}: {
  category: string,
  newItemText: any,
  setNewItemText: any,
  handleAddItem: any
}) {
  return (
    <div className="mt-6 pt-6 border-t border-dashed border-slate-100">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Add new instruction..."
          value={newItemText[category] || ''}
          onChange={(e) => setNewItemText((prev: any) => ({ ...prev, [category]: e.target.value }))}
          className="flex-1 h-10 px-4 rounded-xl bg-slate-50 border-none text-sm font-medium focus:ring-2 focus:ring-blue-500/10 transition-all"
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem(category)}
        />
        <Button
          onClick={() => handleAddItem(category)}
          className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Plus size={18} />
        </Button>
      </div>
    </div>
  )
}

function ResourceCard({ icon: Icon, title, desc, color }: { icon: any, title: string, desc: string, color: 'blue' | 'red' | 'green' | 'purple' }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    red: "bg-red-50 text-red-600 border-red-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100"
  }
  return (
    <Card className={cn(
      "p-6 border rounded-2xl shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer group hover:border-transparent",
      colors[color]
    )}>
      <div className="flex flex-col gap-6">
        <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center transition-transform group-hover:scale-110">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <h4 className="text-sm font-black mb-1 text-slate-900">{title}</h4>
          <p className="text-[11px] font-medium text-slate-500 leading-relaxed">{desc}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
          Visit Site <ExternalLink size={12} />
        </div>
      </div>
    </Card>
  )
}
