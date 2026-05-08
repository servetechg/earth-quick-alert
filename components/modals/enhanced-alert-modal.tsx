'use client'

import { useState, useMemo } from 'react'
import { X, ChevronDown, AlertTriangle, Send, Shield, MapPin, Sparkles, Zap, Activity, Info, Upload, Mail, FileText, CheckCircle2, UserPlus, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface EnhancedAlertModalProps {
  isOpen: boolean
  onClose: () => void
}

interface TargetedUser {
    id: string
    name: string
    email: string
    postalCode: string
    status: string
}

export function EnhancedAlertModal({ isOpen, onClose }: EnhancedAlertModalProps) {
  const [step, setStep] = useState(1)
  const [isSending, setIsSending] = useState(false)
  
  // Alert Details
  const [alertType, setAlertType] = useState('severe-weather')
  const [severity, setSeverity] = useState('warning')
  const [title, setTitle] = useState('Tactical Emergency Alert')
  const [message, setMessage] = useState('')
  
  // Targeting
  const [targetMode, setTargetMode] = useState<'broadcast' | 'targeted'>('broadcast')
  const [postalCode, setPostalCode] = useState('')
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [targetedUsers, setTargetedUsers] = useState<TargetedUser[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  
  // Email Outreach
  const [manualEmail, setManualEmail] = useState('')
  const [externalEmails, setExternalEmails] = useState<string[]>([])
  
  // Attachments
  const [attachments, setAttachments] = useState<File[]>([])

  if (!isOpen) return null

  const handleSearchUsers = async () => {
    if (!postalCode) {
        toast.error('Enter a postal code first')
        return
    }
    setSearchingUsers(true)
    try {
        const res = await fetch(`/api/admin/users/search?postalCode=${postalCode}`)
        const data = await res.json()
        if (data.success) {
            setTargetedUsers(data.users)
            toast.success(`Found ${data.users.length} users in ${postalCode}`)
        }
    } catch (err) {
        toast.error('Search failed')
    } finally {
        setSearchingUsers(false)
    }
  }

  const handleAddEmail = () => {
    if (manualEmail && manualEmail.includes('@')) {
        setExternalEmails([...externalEmails, manualEmail])
        setManualEmail('')
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        setAttachments([...attachments, ...Array.from(e.target.files)])
    }
  }

  const handleSendDispatch = async () => {
    setIsSending(true)
    // Simulate complex dispatch logic
    await new Promise(resolve => setTimeout(resolve, 2000))
    toast.success('Enhanced Alert Dispatched', {
        description: `Sent to ${targetMode === 'broadcast' ? 'All Users' : selectedUserIds.length + ' targeted users'} and ${externalEmails.length} external recipients.`
    })
    setIsSending(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[40px] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-slate-200 relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#33375D] shadow-lg shadow-[#33375D]/25">
              <Zap className="text-white w-7 h-7 fill-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Enhanced Dispatch Terminal</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Targeting & Outreach Protocol v2.0
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-xl transition-all text-slate-400 hover:text-slate-900 border border-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation */}
        <div className="flex items-center gap-2 p-4 bg-white border-b border-slate-50 px-8">
            {[1, 2, 3].map((s) => (
                <button 
                  key={s} 
                  onClick={() => setStep(s)}
                  className={cn(
                    "flex-1 h-1.5 rounded-full transition-all duration-500",
                    step >= s ? "bg-[#33375D]" : "bg-slate-100"
                  )}
                />
            ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Context Group</label>
                        <select 
                            value={alertType}
                            onChange={(e) => setAlertType(e.target.value)}
                            className="w-full h-14 pl-6 pr-12 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 appearance-none focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                        >
                            <option value="severe-weather">Severe Weather</option>
                            <option value="earthquake">Earthquake</option>
                            <option value="wildfire">Wildfire</option>
                            <option value="other">Tectonic Shift</option>
                        </select>
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Priority Level</label>
                        <select 
                            value={severity}
                            onChange={(e) => setSeverity(e.target.value)}
                            className="w-full h-14 pl-6 pr-12 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 appearance-none focus:outline-none focus:ring-4 focus:ring-red-500/5 transition-all"
                        >
                            <option value="critical">Critical (Impact Immediate)</option>
                            <option value="warning">Tactical Warning</option>
                            <option value="watch">Observation Alert</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Dispatch Message</label>
                    <Textarea 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="min-h-[160px] p-8 bg-slate-50 border border-slate-100 rounded-[32px] text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/5 resize-none shadow-inner"
                        placeholder="Enter strategic command message..."
                    />
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Documents & PDF Attachments</label>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Supports PDF (Max 20MB)</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="relative group">
                            <input 
                                type="file" 
                                accept="application/pdf"
                                multiple
                                onChange={handleFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="h-20 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-3 bg-slate-50 group-hover:bg-white group-hover:border-blue-400 transition-all">
                                <FileText className="text-slate-400 group-hover:text-blue-500" size={20} />
                                <span className="text-xs font-bold text-slate-400 group-hover:text-slate-700">Drag or Upload PDF documents</span>
                            </div>
                        </div>
                        {attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {attachments.map((file, i) => (
                                    <Badge key={i} variant="outline" className="bg-blue-50 text-blue-600 border-blue-100 py-1.5 px-3 rounded-lg gap-2 text-[10px] font-bold uppercase">
                                        <FileText size={12} /> {file.name}
                                        <X size={10} className="cursor-pointer" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} />
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                    <button 
                        onClick={() => setTargetMode('broadcast')}
                        className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", targetMode === 'broadcast' ? "bg-[#33375D] text-white shadow-lg" : "text-slate-500 hover:bg-white")}
                    >
                        Regional Broadcast
                    </button>
                    <button 
                        onClick={() => setTargetMode('targeted')}
                        className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", targetMode === 'targeted' ? "bg-[#33375D] text-white shadow-lg" : "text-slate-500 hover:bg-white")}
                    >
                        Targeted Selection
                    </button>
                </div>

                {targetMode === 'broadcast' ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                            <Activity className="animate-pulse" size={32} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-black text-slate-900 uppercase">Universal regional Push</h3>
                            <p className="text-xs font-bold text-slate-400 max-w-sm">This alert will reach all activated Dashboard C users within your designated jurisdictional boundaries.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                            <div className="md:col-span-8 relative">
                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <Input 
                                    placeholder="Enter Postal Code (e.g. 90210)"
                                    value={postalCode}
                                    onChange={(e) => setPostalCode(e.target.value)}
                                    className="h-14 pl-12 rounded-2xl bg-slate-50 border-slate-100 text-sm font-bold"
                                />
                            </div>
                            <Button 
                                onClick={handleSearchUsers}
                                disabled={searchingUsers}
                                className="md:col-span-4 h-14 bg-slate-900 rounded-2xl font-black uppercase tracking-widest text-[10px]"
                            >
                                {searchingUsers ? <Loader2 className="animate-spin text-[#33375D]" /> : <Search className="mr-2" size={14} />}
                                Fetch Residents
                            </Button>
                        </div>

                        {targetedUsers.length > 0 && (
                            <div className="border border-slate-100 rounded-3xl overflow-hidden bg-white">
                                <div className="p-4 bg-slate-50 border-b border-slate-100 font-black text-[10px] uppercase tracking-widest flex justify-between">
                                    <span>User Name (Dashboard C)</span>
                                    <span>Select</span>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-50">
                                    {targetedUsers.map(u => (
                                        <div key={u.id} className="p-4 flex justify-between items-center group hover:bg-blue-50/30 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] font-black">
                                                    {u.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-900">{u.name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400">{u.email}</p>
                                                </div>
                                            </div>
                                            <input 
                                                type="checkbox"
                                                checked={selectedUserIds.includes(u.id)}
                                                onChange={(e) => e.target.checked ? setSelectedUserIds([...selectedUserIds, u.id]) : setSelectedUserIds(selectedUserIds.filter(id => id !== u.id))}
                                                className="w-5 h-5 rounded-lg border-2 border-slate-200 text-blue-600 focus:ring-blue-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <Mail className="text-blue-500" size={20} />
                        <h3 className="text-lg font-black text-slate-900 uppercase">External Outreach</h3>
                    </div>
                    
                    <div className="p-8 bg-blue-50 border-2 border-dashed border-blue-200 rounded-[32px] space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Bulk Email Ingestion (CSV)</label>
                            <label className="flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-slate-200 border-dashed rounded-[24px] cursor-pointer hover:border-blue-400 hover:bg-blue-50/50">
                                <div className="flex flex-col items-center space-y-2">
                                    <Upload className="w-8 h-8 text-blue-500" />
                                    <span className="text-xs font-bold text-slate-500 tracking-tight uppercase">Upload Bulk CSV Distribution List</span>
                                </div>
                                <input type="file" accept=".csv" className="hidden" />
                            </label>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Individual Recipients</label>
                            <div className="flex gap-3">
                                <Input 
                                    placeholder="Enter custom email address..."
                                    value={manualEmail}
                                    onChange={(e) => setManualEmail(e.target.value)}
                                    className="h-12 rounded-xl bg-white border-slate-200 text-xs font-bold"
                                />
                                <Button onClick={handleAddEmail} className="flex h-12 items-center gap-2 rounded-xl bg-[#33375D] px-6 font-black uppercase tracking-widest text-[9px] text-white hover:bg-[#2B2F50]">
                                    <Plus size={14} /> Add
                                </Button>
                            </div>
                        </div>

                        {externalEmails.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {externalEmails.map((email, i) => (
                                    <Badge key={i} className="bg-white text-slate-900 border border-slate-200 py-1.5 px-3 rounded-lg flex items-center gap-2 shadow-sm text-[10px] font-black uppercase">
                                        {email}
                                        <X size={10} className="cursor-pointer text-slate-400" onClick={() => setExternalEmails(externalEmails.filter((_, idx) => idx !== i))} />
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-[28px] flex gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
                            <Info size={20} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-900 uppercase">Invitation Protocol Active</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">
                                System will automatically cross-reference emails. Unactivated users will receive a secure app download link. Alert will be delivered upon account activation.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex gap-4">
            {step > 1 && (
                <Button 
                    variant="outline" 
                    onClick={() => setStep(step - 1)}
                    className="h-14 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest border-slate-200 hover:bg-white"
                >
                    Back to Selection
                </Button>
            )}
          </div>
          <div className="flex items-center gap-6">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ready for tactical transmission</span>
            {step < 3 ? (
                <Button 
                    onClick={() => setStep(step + 1)}
                    className="h-14 px-10 rounded-2xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-xl"
                >
                    Proceed To Next Step
                </Button>
            ) : (
                <Button 
                    onClick={handleSendDispatch}
                    disabled={isSending}
                    className="h-14 px-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-red-600/20 gap-3"
                >
                    {isSending ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <><Send size={18} /> Execute Multi-Channel Dispatch</>}
                </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
