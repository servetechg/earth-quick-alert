'use client'

import {
  X,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  UserX,
  MapPin,
  Phone,
  MessageSquare,
  Navigation,
  Plus,
  Trash2,
  Users,
  Search,
  Cloud,
  Activity,
  Wind
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSafety, SafetyStatus, FamilyMember } from '@/lib/context/safety-context'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface SafeCheckInModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SafeCheckInModal({ isOpen, onClose }: SafeCheckInModalProps) {
  const {
    myStatus,
    familyMembers,
    loading,
    updateMyStatus,
    addFamilyMember,
    removeFamilyMember
  } = useSafety()

  const [message, setMessage] = useState('')
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [newMember, setNewMember] = useState({ name: '', relationship: '', location: '' })
  const [isProcessing, setIsProcessing] = useState(false)

  if (!isOpen) return null

  const handleUpdateMyStatus = async (status: SafetyStatus) => {
    setIsProcessing(true)
    await updateMyStatus(status)
    setIsProcessing(false)
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMember.name || !newMember.relationship) return

    setIsProcessing(true)
    await addFamilyMember(newMember)
    setNewMember({ name: '', relationship: '', location: '' })
    setIsAddingMember(false)
    setIsProcessing(false)
  }

  const handleRemoveMember = async (id: string) => {
    if (confirm('Are you sure you want to remove this family member?')) {
      setIsProcessing(true)
      await removeFamilyMember(id)
      setIsProcessing(false)
    }
  }

  // Helper to get status color
  const getStatusColor = (status: SafetyStatus) => {
    switch (status) {
      case 'SAFE': return 'bg-green-100 text-green-700 border-green-200'
      case 'DANGER': return 'bg-red-100 text-red-700 border-red-200'
      case 'PENDING': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      default: return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  // Helper to get status icon
  const getStatusIcon = (status: SafetyStatus) => {
    switch (status) {
      case 'SAFE': return <UserCheck className="w-5 h-5" />
      case 'DANGER': return <UserX className="w-5 h-5" />
      default: return <ShieldCheck className="w-5 h-5" />
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-[#34385E] text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-green-400" />
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Are We Safe?</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Family & Group Safety Check-in</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-0 overflow-y-auto max-h-[80vh]">

          {/* My Status Section */}
          <div className="p-6 bg-slate-50 border-b border-slate-200">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Update Your Status</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => handleUpdateMyStatus('SAFE')}
                disabled={isProcessing}
                className={cn(
                  "flex items-center justify-between p-5 rounded-2xl border-2 transition-all active:scale-[0.98]",
                  myStatus === 'SAFE'
                    ? "bg-green-50 border-green-500 ring-4 ring-green-100 shadow-lg"
                    : "bg-white border-slate-200 hover:border-green-300 hover:bg-green-50/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-2.5 rounded-xl", myStatus === 'SAFE' ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400")}>
                    <UserCheck className="w-7 h-7" />
                  </div>
                  <div className="text-left">
                    <span className={cn("block font-black uppercase tracking-tight text-lg leading-none", myStatus === 'SAFE' ? "text-green-900" : "text-slate-700")}>I Am Safe</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Share location</span>
                  </div>
                </div>
                {myStatus === 'SAFE' && <div className="w-4 h-4 bg-green-500 rounded-full shadow-inner shadow-black/20" />}
              </button>

              <button
                onClick={() => handleUpdateMyStatus('DANGER')}
                disabled={isProcessing}
                className={cn(
                  "flex items-center justify-between p-5 rounded-2xl border-2 transition-all active:scale-[0.98]",
                  myStatus === 'DANGER'
                    ? "bg-red-50 border-red-500 ring-4 ring-red-100 shadow-lg"
                    : "bg-white border-slate-200 hover:border-red-300 hover:bg-red-50/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-2.5 rounded-xl", myStatus === 'DANGER' ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400")}>
                    <AlertTriangle className="w-7 h-7" />
                  </div>
                  <div className="text-left">
                    <span className={cn("block font-black uppercase tracking-tight text-lg leading-none", myStatus === 'DANGER' ? "text-red-900" : "text-slate-700")}>I Need Help</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alert contacts</span>
                  </div>
                </div>
                {myStatus === 'DANGER' && <div className="w-4 h-4 bg-red-500 rounded-full animate-ping" />}
              </button>
            </div>
          </div>

          {/* Family Status Section */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Family & Group Status</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-600 font-black text-xs hover:bg-blue-50 gap-1 rounded-full px-4"
                onClick={() => setIsAddingMember(!isAddingMember)}
              >
                <Plus className="w-4 h-4" />
                {isAddingMember ? 'HIDE FORM' : 'ADD FAMILY'}
              </Button>
            </div>
            {isAddingMember && (
              <Card className="mb-6 p-6 border-blue-100 bg-blue-50/30 rounded-2xl animate-in slide-in-from-top-4 duration-300">
                <form onSubmit={handleAddMember} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</Label>
                      <Input
                        value={newMember.name}
                        onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                        placeholder="e.g. Sarah Smith"
                        className="rounded-xl border-slate-200 font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Relationship</Label>
                      <Input
                        value={newMember.relationship}
                        onChange={e => setNewMember({ ...newMember, relationship: e.target.value })}
                        placeholder="e.g. Daughter"
                        className="rounded-xl border-slate-200 font-bold"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Current Location (Optional)</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        value={newMember.location}
                        onChange={e => setNewMember({ ...newMember, location: e.target.value })}
                        placeholder="Search location (e.g. School, Downtown)"
                        className="rounded-xl border-slate-200 font-bold pl-10"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full rounded-xl bg-[#33375D] py-6 font-black text-white transition-all hover:bg-[#2B2F50]"
                  >
                    {isProcessing ? 'ADDING...' : 'CONFIRM ADDITION'}
                  </Button>
                </form>
              </Card>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#33375D]" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading family data...</p>
              </div>
            ) : familyMembers.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-500 font-bold">No family members added yet.</p>
                <button
                  onClick={() => setIsAddingMember(true)}
                  className="text-blue-600 text-xs font-black uppercase mt-2 hover:underline"
                >
                  Add your first contact
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {familyMembers.map((member) => (
                  <div
                    key={member._id}
                    className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shadow-sm",
                        member.status === 'DANGER' ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"
                      )}>
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-slate-900 leading-none">{member.name}</h4>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">({member.relationship})</span>
                        </div>
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[10px] px-2.5 py-1 rounded-full font-black border flex items-center gap-1 uppercase tracking-wider whitespace-nowrap", getStatusColor(member.status))}>
                              {getStatusIcon(member.status)}
                              {member.status === 'SAFE' ? 'SAFE' : member.status === 'DANGER' ? 'NOT SAFE' : 'NO UPDATE'}
                            </span>
                            {member.location && (
                              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 truncate max-w-[150px]">
                                <MapPin className="w-3 h-3" />
                                {member.location}
                              </span>
                            )}
                          </div>


                          <div className="flex items-center gap-3">
                            <span className="text-[9px] font-bold text-slate-500 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                              <Cloud className="w-3 h-3 text-blue-400" />
                              72°F Partly Cloudy
                            </span>
                            <span className="text-[9px] font-bold text-slate-500 flex items-center gap-1 bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-100">
                              <Activity className="w-3 h-3 text-orange-400" />
                              No Seismic Activity
                            </span>
                          </div>
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                          Updated {new Date(member.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-xl w-10 h-10 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleRemoveMember(member._id)}
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                      {member.status === 'DANGER' && (
                        <Button size="icon" className="h-10 w-10 rounded-xl bg-[#33375D] text-white shadow-lg shadow-[#33375D]/25 hover:bg-[#2B2F50]">
                          <Phone className="w-5 h-5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Check-in Trigger */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Safety System Active</span>
              <Button
                variant="outline"
                className="text-blue-600 border-blue-200 hover:bg-blue-50 font-black text-xs h-10 px-6 rounded-full"
                onClick={() => alert('Feature coming soon: Request check-in will send notifications to all group members.')}
              >
                REQUEST GROUP CHECK-IN
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
