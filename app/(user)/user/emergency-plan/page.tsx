'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Plus,
  Trash2,
  Phone,
  MapPin,
  BriefcaseMedical,
  Info,
  ShieldCheck,
  Navigation,
  Loader2,
  Shield,
  Video,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Package,
  Edit2,
  RefreshCw
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useEvents } from '@/lib/store/event-store'

type Contact = { _id?: string; name: string; phone: string; relation: string }
type Supply = { _id?: string; item: string; checked: boolean }
type MeetingPoint = { _id?: string; name: string; address: string; description: string; isPrimary: boolean }

export default function EmergencyPlanPage() {
  const [activeTab, setActiveTab] = useState('contacts')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [meetingPoints, setMeetingPoints] = useState<MeetingPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const { getActiveEvents } = useEvents()
  const activeEvents = getActiveEvents()

  // Modals state
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [isSupplyModalOpen, setIsSupplyModalOpen] = useState(false)
  const [newContact, setNewContact] = useState<Contact>({ name: '', phone: '', relation: '' })
  const [newSupplyItem, setNewSupplyItem] = useState('')

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/user/emergency-plan')
      if (res.ok) {
        const data = await res.json()
        setContacts(data.emergencyContacts || [])
        setSupplies(data.supplyKit || [])
        setMeetingPoints(data.meetingPoints || [])
      }
    } catch (error) {
      console.error('Fetch error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (tab === 'contacts' || tab === 'kit' || tab === 'meeting') {
      setActiveTab(tab)
    }
  }, [])

  const saveData = async (type: 'contacts' | 'kit' | 'meeting', data: any) => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/user/emergency-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data })
      })
      if (res.ok) {
        const updated = await res.json()
        if (type === 'contacts') setContacts(updated.emergencyContacts)
        if (type === 'kit') setSupplies(updated.supplyKit)
        if (type === 'meeting') setMeetingPoints(updated.meetingPoints)
      }
    } catch (error) {
      console.error('Save error:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddContact = () => {
    if (!newContact.name.trim()) return
    const updated = [...contacts, newContact]
    saveData('contacts', updated)
    setNewContact({ name: '', phone: '', relation: '' })
    setIsContactModalOpen(false)
  }

  const handleDeleteContact = (index: number) => {
    const updated = contacts.filter((_, i) => i !== index)
    saveData('contacts', updated)
  }

  const toggleSupply = (index: number) => {
    const updated = supplies.map((s, i) => i === index ? { ...s, checked: !s.checked } : s)
    saveData('kit', updated)
  }

  const handleAddSupply = () => {
    if (!newSupplyItem.trim()) return
    const updated = [...supplies, { item: newSupplyItem, checked: false }]
    saveData('kit', updated)
    setNewSupplyItem('')
    setIsSupplyModalOpen(false)
  }

  const handleDeleteSupply = (index: number) => {
    const updated = supplies.filter((_, i) => i !== index)
    saveData('kit', updated)
  }

  const handleDeleteMeeting = (index: number) => {
    const updated = meetingPoints.filter((_, i) => i !== index)
    saveData('meeting', updated)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <Loader2 className="w-12 h-12 animate-spin text-[#33375D]" />
        <p className="font-bold text-slate-400">Loading Protocol Data...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50/50 pb-24 relative">
      {isSaving && (
        <div className="fixed top-24 right-6 z-50 flex items-center gap-2 rounded-full border-none bg-white px-4 py-2 text-[10px] font-black uppercase text-[#33375D] shadow-2xl animate-in fade-in slide-in-from-right duration-300">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#33375D]" />
          Synchronizing Nexus...
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        <header className="flex flex-col gap-1 mb-6">
          <h1 className="text-[2.2rem] font-black tracking-tight text-slate-900">My Emergency Plan</h1>
          <p className="text-slate-500 font-medium text-base">Prepare yourself and your family for any situation.</p>
        </header>


        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center mb-12">
            <TabsList className="bg-slate-50 p-1.5 rounded-full border border-slate-100 w-full max-w-3xl flex h-14">
              <TabsTrigger value="contacts" className="flex-1 gap-2 rounded-full font-bold text-sm text-slate-700 py-2.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all h-full">
                <Phone className="w-4 h-4" /> Contacts
              </TabsTrigger>
              <TabsTrigger value="kit" className="flex-1 gap-2 rounded-full font-bold text-sm text-slate-700 py-2.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all h-full">
                <Package className="w-4 h-4" /> Supply Kit
              </TabsTrigger>
              <TabsTrigger value="meeting" className="flex-1 gap-2 rounded-full font-bold text-sm text-slate-700 py-2.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all h-full">
                <MapPin className="w-4 h-4" /> Meeting Points
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="contacts" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Emergency Contacts</h2>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contacts.map((contact, i) => (
                <Card key={contact._id || i} className="p-4 flex items-center gap-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 relative group overflow-hidden">
                  <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-700 flex items-center justify-center font-black text-lg border border-slate-100 shrink-0">
                    {contact.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0 pr-12">
                    <h3 className="font-bold text-slate-900 text-base truncate">{contact.name}</h3>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{contact.relation}</p>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-blue-600">
                      <Phone className="w-3.5 h-3.5" /> {contact.phone}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-slate-300 hover:text-red-500 hover:bg-slate-50 absolute right-4 opacity-0 md:opacity-0 group-hover:opacity-100 transition-all focus:opacity-100" onClick={() => handleDeleteContact(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </Card>
              ))}

              <Card
                onClick={() => setIsContactModalOpen(true)}
                className="group p-4 flex items-center gap-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all duration-300 cursor-pointer min-h-[80px]"
              >
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100 group-hover:bg-slate-900 transition-colors shrink-0">
                  <Plus className="w-5 h-5 text-slate-400 group-hover:text-white" />
                </div>
                <div>
                  <span className="font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Add New Contact</span>
                  <p className="text-xs font-medium text-slate-400 mt-0.5">Register a family member or friend</p>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="kit" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Supply Kit</h2>
              <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold px-4 tracking-wide h-10" onClick={() => setIsSupplyModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Add Item
              </Button>
            </div>

            <Card className="divide-y divide-slate-100 border border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
              {supplies.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Package className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium text-sm mb-6">Your checklist is empty</p>
                  <Button
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg h-10 px-6"
                    onClick={() => saveData('kit', [
                      { item: 'Water (3-day supply)', checked: false },
                      { item: 'Non-perishable food', checked: false },
                      { item: 'First aid kit', checked: false },
                      { item: 'Flashlight & batteries', checked: false },
                      { item: 'Dust masks (N95)', checked: false },
                      { item: 'Backup battery/power bank', checked: false }
                    ])}
                  >
                    Initialize Basic Kit
                  </Button>
                </div>
              ) : supplies.map((supply, i) => (
                <div key={supply._id || i} className="p-5 flex items-center gap-4 group hover:bg-slate-50 transition-colors">
                  <Checkbox
                    id={`supply-${i}`}
                    checked={supply.checked}
                    onCheckedChange={() => toggleSupply(i)}
                    className="h-5 w-5 rounded-md border-slate-300 data-[state=checked]:border-[#33375D] data-[state=checked]:bg-[#33375D]"
                  />
                  <Label
                    htmlFor={`supply-${i}`}
                    className={cn(
                      "flex-1 cursor-pointer text-base font-medium transition-all",
                      supply.checked ? "text-slate-400 line-through" : "text-slate-700"
                    )}
                  >
                    {supply.item}
                  </Label>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-300 hover:text-red-500 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteSupply(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </Card>
          </TabsContent>

          <TabsContent value="meeting" className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Active Emergency Events Section */}
            {activeEvents.length > 0 && (
              <section className="animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center border border-red-100 shadow-sm shadow-red-50">
                    <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Active Emergency Events</h2>
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Immediate Situational Awareness Required</p>
                  </div>
                </div>

                <Card className="border border-slate-100 bg-white shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-50">
                          <th className="text-left py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Incident</th>
                          <th className="text-left py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type / Severity</th>
                          <th className="text-left py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                          <th className="text-right py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {activeEvents.map((event) => (
                          <tr key={event.id || (event as any)._id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-6 px-8">
                              <div className="flex flex-col">
                                <span className="font-black text-slate-900 text-sm uppercase tracking-tight">{event.title}</span>
                                <span className="text-[10px] font-bold text-slate-400 mt-1 line-clamp-1">{event.description}</span>
                              </div>
                            </td>
                            <td className="py-6 px-8">
                              <div className="flex flex-col">
                                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{event.type.replace(/-/g, ' ')}</span>
                                <span className={cn(
                                  "text-[9px] font-black uppercase tracking-widest mt-1",
                                  event.severity === 'critical' || event.severity === 'extreme' ? 'text-red-500' : 'text-orange-500'
                                )}>
                                  {event.severity}
                                </span>
                              </div>
                            </td>
                            <td className="py-6 px-8">
                              <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px]">
                                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                                {event.location.address}
                              </div>
                            </td>
                            <td className="py-6 px-8 text-right">
                              <Badge className="bg-red-100 text-red-700 text-[8px] font-black uppercase border-none px-2 py-0.5 rounded-md">
                                {event.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>
            )}

            <div className="space-y-6">
              {/* <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">Meeting Points</h2>
              </div>

              <Card className="border border-slate-200 shadow-sm rounded-[2rem] overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Designation</th>
                        <th className="text-left py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Address</th>
                        <th className="text-left py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="text-right py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Operation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {meetingPoints.length > 0 ? (
                        meetingPoints.map((point, i) => (
                          <tr key={point._id || i} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-6 px-8">
                              <span className="font-black text-slate-900 text-sm uppercase tracking-tight">{point.name}</span>
                            </td>
                            <td className="py-6 px-8">
                              <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px]">
                                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                                {point.address}
                              </div>
                            </td>
                            <td className="py-6 px-8">
                              <Badge className={cn(
                                "text-[8px] font-black uppercase tracking-tighter border-none px-2 py-0.5 rounded-md",
                                point.isPrimary ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'
                              )}>
                                {point.isPrimary ? 'Primary Protocol' : 'Reserve Site'}
                              </Badge>
                            </td>
                            <td className="py-6 px-8 text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50">
                                  <Navigation className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all font-bold"
                                  onClick={() => handleDeleteMeeting(i)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-20 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <MapPin className="w-12 h-12 text-slate-100" />
                              <p className="text-slate-400 font-black text-xs uppercase tracking-widest">No Meeting Points Established</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card> */}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isContactModalOpen} onOpenChange={setIsContactModalOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem] p-8 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight uppercase text-slate-900 mb-2">Register Contact</DialogTitle>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Add a node to your emergency network</p>
          </DialogHeader>
          <div className="grid gap-6 py-6 font-bold">
            <div className="space-y-2">
              <Label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</Label>
              <Input value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} placeholder="Contact Name" className="h-12 rounded-xl border-slate-100 bg-slate-50 font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Kinship / Relationship</Label>
              <Input value={newContact.relation} onChange={e => setNewContact({ ...newContact, relation: e.target.value })} placeholder="e.g. Sister, Neighbor" className="h-12 rounded-xl border-slate-100 bg-slate-50 font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Communication Line</Label>
              <Input value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} placeholder="(555) 000-0000" className="h-12 rounded-xl border-slate-100 bg-slate-50 font-bold" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddContact} className="h-12 w-full rounded-xl bg-[#33375D] font-bold uppercase tracking-tight text-white shadow-xl shadow-[#33375D]/15 hover:bg-[#2B2F50]">Establish Protocol</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSupplyModalOpen} onOpenChange={setIsSupplyModalOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem] p-8 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight uppercase text-slate-900 mb-2">Add Supply Node</DialogTitle>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enhance your survival kit</p>
          </DialogHeader>
          <div className="py-6 font-bold">
            <div className="space-y-2">
              <Label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Item Title</Label>
              <Input
                value={newSupplyItem}
                onChange={e => setNewSupplyItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSupply()}
                placeholder="e.g. Iodine Tablets"
                className="h-12 rounded-xl border-slate-100 bg-slate-50 font-bold"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddSupply} className="h-12 w-full rounded-xl bg-[#33375D] font-bold uppercase tracking-tight text-white shadow-xl shadow-[#33375D]/15 hover:bg-[#2B2F50]">Register Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main >
  )
}

function ProtocolSheet({ type }: { type: 'communication' | 'supplies' }) {
  const info = {
    communication: {
      title: 'Communication Protocol',
      icon: Phone,
      points: [
        'SMS preferred over voice when lines are congested.',
        'Established a designated out-of-area contact.',
        'Phone chargers kept in emergency kits and vehicles.'
      ]
    },
    supplies: {
      title: 'Kit Maintenance',
      icon: Package,
      points: [
        'Replace expired food and water every 6 months.',
        'Check battery levels quarterly.',
        'Review first-aid kit and restock items after use.'
      ]
    }
  }[type]

  const Icon = info.icon

  return (
    <Card className="p-8 border-2 border-dashed border-blue-100 bg-blue-50/20 rounded-[2rem]">
      <div className="flex items-start gap-5">
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <Icon className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h3 className="text-xl font-black text-blue-900 uppercase tracking-tight mb-4">{info.title}</h3>
          <ul className="space-y-3">
            {info.points.map((point, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span className="text-sm font-bold text-blue-900/60 leading-snug">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}
