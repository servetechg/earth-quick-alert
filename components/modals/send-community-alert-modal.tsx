'use client'

import { useState } from 'react'
import { X, ChevronDown, ChevronUp, AlertTriangle, Send, Shield, MapPin, Sparkles, Plus, Zap, Activity, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAlerts } from '@/lib/store/alert-store'
import { AlertType, AlertSeverity } from '@/lib/types/emergency'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface SendCommunityAlertModalProps {
  isOpen: boolean
  onClose: () => void
  initialData?: {
    type: AlertType
    severity: AlertSeverity
    title: string
    message: string
    zones: string[]
    locations: string[]
  }
}

export function SendCommunityAlertModal({ isOpen, onClose, initialData }: SendCommunityAlertModalProps) {
  const { toast } = useToast()
  const { createAlert } = useAlerts()
  const [alertType, setAlertType] = useState<AlertType>(initialData?.type || 'severe-weather')
  const [severity, setSeverity] = useState<AlertSeverity>(initialData?.severity || 'warning')
  const [intensity, setIntensity] = useState(7)
  const [title, setTitle] = useState(initialData?.title || 'Severe Weather Alert')
  const [message, setMessage] = useState(initialData?.message ||
    'A powerful thunderstorm system is approaching the eastern district at approximately 45 mph. Expected arrival time: 3:30 PM. Residents are strongly advised to remain indoors, secure outdoor items, and avoid travel unless absolutely necessary.'
  )
  const [zones, setZones] = useState<string[]>(initialData?.zones || ['A', 'B', 'C'])
  const [locations, setLocations] = useState<string[]>(initialData?.locations || ['San Francisco', 'Oakland', 'Berkeley'])
  const [coordinatorMessage, setCoordinatorMessage] = useState(
    'Emergency shelters are available at Lincoln Community Center and Riverside High School. Transportation assistance is available.'
  )
  const [isSending, setIsSending] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  if (!isOpen) return null

  const handleSendAlert = async () => {
    setIsSending(true)
    try {
      const success = await createAlert({
        type: alertType,
        severity,
        title,
        message: `${message}\n\nCoordination: ${coordinatorMessage}`,
        zones,
        locations,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdBy: 'Admin',
        source: 'admin_manual',
        isPinned,
      })

      if (!success) throw new Error('Failed to synchronize alert')

      toast({ title: 'Alert Dispatched', description: 'Community alert has been broadcasted.' })
      onClose()
    } catch (error) {
       toast({ title: 'Error', description: 'Failed to send alert', variant: 'destructive' })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[48px] w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col border border-slate-200 relative">
        {/* Glow Effects */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-10 border-b border-slate-100 relative shrink-0">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-red-600 rounded-[28px] flex items-center justify-center shadow-xl shadow-red-600/20">
              <Zap className="text-white w-8 h-8 fill-white" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Dispatch Protocol</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Multi-Channel Broadcast Terminal</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center hover:bg-slate-50 rounded-2xl transition-all text-slate-400 hover:text-slate-900 border border-transparent hover:border-slate-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 py-12 space-y-10 custom-scrollbar">
          {/* Grid Selection */}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Context Group</label>
              <div className="relative group">
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value as AlertType)}
                  className="w-full h-16 pl-6 pr-12 bg-slate-50 border border-slate-200 rounded-[22px] text-sm font-bold text-slate-900 appearance-none focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer hover:bg-slate-100"
                >
                  <option value="severe-weather">Severe Weather</option>
                  <option value="earthquake">Earthquake</option>
                  <option value="wildfire">Wildfire</option>
                  <option value="other">Biological Threat</option>
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none w-5 h-5" />
              </div>
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Threat Level</label>
              <div className="relative group">
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as AlertSeverity)}
                  className="w-full h-16 pl-6 pr-12 bg-slate-50 border border-slate-200 rounded-[22px] text-sm font-bold text-slate-900 appearance-none focus:outline-none focus:ring-4 focus:ring-red-500/10 transition-all cursor-pointer hover:bg-slate-100"
                >
                  <option value="critical">Critical (Life Safety)</option>
                  <option value="extreme">Extreme Impact</option>
                  <option value="severe">Severe Risk</option>
                  <option value="warning">Tactical Warning</option>
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Intensity Slider (Modern implementation) */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Expected Intensity Mapping</label>
                <span className="text-xs font-black text-blue-400 uppercase tracking-widest">Level {intensity}/10</span>
            </div>
            <div className="flex gap-2">
                {[1,2,3,4,5,6,7,8,9,10].map((num) => (
                    <button 
                        key={num}
                        onClick={() => setIntensity(num)}
                        className={cn(
                            "flex-1 h-2 rounded-full transition-all duration-300",
                            num <= intensity ? "bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.3)]" : "bg-slate-100"
                        )}
                    />
                ))}
            </div>
          </div>

          {/* AI Core Message */}
          <div className="space-y-4 relative">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">CORE BROADCAST MESSAGE</label>
              <Button variant="ghost" className="h-8 px-3 text-[9px] font-black text-blue-600 hover:text-blue-700 hover:bg-blue-50 tracking-widest gap-2 uppercase border border-blue-200 rounded-xl">
                <Sparkles size={12} className="animate-pulse" /> AI Refine
              </Button>
            </div>
            <div className="relative group">
                <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full p-8 bg-slate-50 border border-slate-200 rounded-[32px] text-sm font-medium leading-relaxed text-slate-800 min-h-[160px] focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all resize-none shadow-inner group-hover:bg-slate-100/50"
                placeholder="Enter tactical message..."
                />
                <div className="absolute right-6 bottom-6 flex items-center gap-2 opacity-40">
                    <Activity size={12} className="text-blue-500" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Real-time Parsing</span>
                </div>
            </div>
          </div>

          {/* Coordination Instructions */}
          <div className="space-y-4">
             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tactical Coordination (EOC Only)</label>
             <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-[28px] flex gap-4">
                 <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                    <Info size={20} />
                 </div>
                 <textarea
                    value={coordinatorMessage}
                    onChange={(e) => setCoordinatorMessage(e.target.value)}
                    className="w-full bg-transparent border-none text-[13px] font-bold text-slate-500 placeholder:text-slate-400 focus:outline-none resize-none"
                    rows={2}
                 />
             </div>
          </div>

          {/* Persistent Toggle */}
          <div className="flex items-center justify-between p-8 bg-slate-50 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-5 relative">
              <div className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors shadow-sm">
                <Shield size={24} />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Strategic Priority Pin</p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-1">Maintenance on primary dashboard view</p>
              </div>
            </div>
            <button
              onClick={() => setIsPinned(!isPinned)}
              className={cn(
                "w-14 h-7 rounded-full transition-all relative flex items-center px-1",
                isPinned ? "bg-blue-600" : "bg-white/10"
              )}
            >
              <div className={cn(
                "w-5 h-5 bg-white rounded-full transition-all shadow-md",
                isPinned ? "translate-x-7" : "translate-x-0"
              )} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-10 bg-slate-50 border-t border-slate-100 flex items-center gap-6 shrink-0">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-18 rounded-[24px] text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] hover:bg-white/5 transition-all h-16"
          >
            Abort Protocol
          </Button>
          <Button
            onClick={handleSendAlert}
            disabled={isSending}
            className="flex-[1.5] h-18 h-16 rounded-[24px] bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-[0.3em] text-[11px] shadow-2xl shadow-red-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] gap-4"
          >
            {isSending ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <><Send size={20} /> Initiate Dispatch</>}
          </Button>
        </div>
      </div>

    </div>
  )
}

function Loader2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

