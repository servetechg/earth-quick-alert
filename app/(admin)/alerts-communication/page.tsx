'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageShell } from '@/components/admin-page-shell'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertTriangle,
  Zap,
  CloudRain,
  Smartphone,
  MessageSquare,
  Mail,
  Info,
  Search,
  Bell,
  Clock,
  ShieldCheck,
  Flag,
  ShieldAlert,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Check,
  ExternalLink,
  ArrowRight,
  X,
  Send,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useUser } from '@/lib/store/user-store'
import Image from 'next/image'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  normalizeUnifiedEventAlertCards,
  type UnifiedEventAlertCardView,
} from '@/lib/unified-event/client-card'
import { ALL_NWS_ALERT_FILTER_CATEGORIES } from '@/lib/constants/nws-alert-filter-categories'
import { Input } from '@/components/ui/input'

const SOURCE_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  nws: { label: 'NWS', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  usgs: { label: 'USGS', className: 'border-amber-300 bg-amber-50 text-amber-700' },
  firms: { label: 'FIRMS', className: 'border-orange-300 bg-orange-50 text-orange-700' },
  inciweb: { label: 'InciWeb', className: 'border-red-300 bg-red-50 text-red-700' },
  nwps: { label: 'NWPS', className: 'border-sky-300 bg-sky-50 text-sky-700' },
  fema: { label: 'FEMA', className: 'border-violet-300 bg-violet-50 text-violet-700' },
  earthquake: { label: 'USGS EQ', className: 'border-rose-300 bg-rose-50 text-rose-800' },
  wfigs: { label: 'WFIGS', className: 'border-orange-200 bg-orange-50 text-orange-900' },
  manual: { label: 'Manual', className: 'border-slate-300 bg-slate-50 text-slate-700' },
  seed: { label: 'Seed', className: 'border-zinc-300 bg-zinc-50 text-zinc-700' },
}

function formatPropertyValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((v) => formatPropertyValue(v)).join(', ')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').trim()}: ${formatPropertyValue(v)}`)
      .join(' · ')
  }
  return String(value)
}

function formatAlertProperties(properties: Record<string, unknown>): string[] {
  const lines: string[] = []
  for (const [blockKey, blockVal] of Object.entries(properties)) {
    if (blockKey === 'demo' && blockVal && typeof blockVal === 'object') {
      const demo = blockVal as Record<string, unknown>
      if (demo.rating && typeof demo.rating === 'object') {
        lines.push(`Rating: ${formatPropertyValue(demo.rating)}`)
      }
      if (demo.impacts && typeof demo.impacts === 'object') {
        lines.push(`Impacts: ${formatPropertyValue(demo.impacts)}`)
      }
      if (demo.meteorology && typeof demo.meteorology === 'object') {
        lines.push(`Meteorology: ${formatPropertyValue(demo.meteorology)}`)
      }
      if (Array.isArray(demo.affectedAreas)) {
        lines.push(`Affected areas: ${(demo.affectedAreas as string[]).join(', ')}`)
      }
      continue
    }
    if (blockVal && typeof blockVal === 'object' && !Array.isArray(blockVal)) {
      for (const [k, v] of Object.entries(blockVal as Record<string, unknown>)) {
        const label = `${blockKey} · ${k.replace(/([A-Z])/g, ' $1').trim()}`
        lines.push(`${label}: ${formatPropertyValue(v)}`)
      }
    } else {
      lines.push(`${blockKey}: ${formatPropertyValue(blockVal)}`)
    }
  }
  return lines
}

export default function AlertsCommunicationPage() {
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({
    push: true,
    sms: true,
    email: false,
  })

  const [alerts, setAlerts] = useState<UnifiedEventAlertCardView[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [expandedLocations, setExpandedLocations] = useState<Record<string, boolean>>({})


  // Unified Channel Selection States
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false)
  const [modalChannels, setModalChannels] = useState<string[]>(['push', 'sms'])
  const [isDispatching, setIsDispatching] = useState(false)
  const [pendingDispatch, setPendingDispatch] = useState<{
    type: 'monitoring',
    alertType?: string,
    message?: string
  } | null>(null)

  const [isActionModalOpen, setIsActionModalOpen] = useState(false)
  const [currentActionAlert, setCurrentActionAlert] = useState<any>(null)



  const fetchDynamicAlerts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/alerts-communication')
      if (res.ok) {
        const data = await res.json()
        const formattedAlerts = normalizeUnifiedEventAlertCards(data)
        setAlerts(formattedAlerts)

        setSelectedAlertId(prev => prev ?? formattedAlerts[0]?.id ?? null)
      }
    } catch (err) {
      console.error('Failed to fetch emergency alerts', err)
    } finally {
      setLoading(false)
    }
  }, [])


  useEffect(() => {
    fetchDynamicAlerts()
    const interval = setInterval(fetchDynamicAlerts, 60000)
    return () => clearInterval(interval)
  }, [fetchDynamicAlerts])


  const handleConfirmUnifiedDispatch = async () => {
    if (!pendingDispatch) return

    try {
      setIsDispatching(true)

      const payload = {
        alertType: pendingDispatch.alertType,
        message: pendingDispatch.message,
        channels: modalChannels,
        target: 'Regional'
      }

      const res = await fetch('/api/admin/national-alert-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success('Dispatch Successful', {
          description: `Alert sent via ${modalChannels.join(', ')} to ${payload.target}.`
        })
        setIsChannelModalOpen(false)
      } else {
        toast.error('Dispatch Failed')
      }
    } catch (err) {
      toast.error('System Error')
    } finally {
      setIsDispatching(false)
    }
  }

  const handleStatusChange = async (alert: UnifiedEventAlertCardView) => {
    try {
      const newStatus = alert.status === 'Take Action' ? 'Get Prepared' : 'Take Action'
      const res = await fetch('/api/alerts-communication', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id, status: newStatus })
      })

      if (res.ok) {
        toast.success('Status Updated', {
          description: `Alert status changed to ${newStatus}.`
        })
        fetchDynamicAlerts()
        setIsActionModalOpen(false)
      }
    } catch (err) {
      toast.error('Failed to update status')
    }
  }



  const handleMonitoringDispatch = () => {
    if (alerts.length === 0) {
      toast.error('No Live Alerts', { description: 'Cannot dispatch from empty feed.' })
      return
    }
    const latest = alerts[0]
    setPendingDispatch({
      type: 'monitoring',
      alertType: latest.name,
      message: latest.description
    })
    setIsChannelModalOpen(true)
  }

  const handleFeedDispatch = (alert: UnifiedEventAlertCardView) => {
    setCurrentActionAlert(alert)
    setAlertMessage('') // Reset message for the new alert
    setIsActionModalOpen(true)
  }


  const toggleNotification = (key: string) => {
    setNotificationPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const selectedAlert = alerts.find(a => a.id === selectedAlertId)

  const displayLocation = (alert: UnifiedEventAlertCardView) =>
    (alert?.locationSummary ?? alert?.location ?? '').toString()

  // AI Alert State
  const [alertMessage, setAlertMessage] = useState('')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [isSendingAlert, setIsSendingAlert] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [alertTypeSearch, setAlertTypeSearch] = useState('')

  const filteredAlertTypeCategories = useMemo(() => {
    const q = alertTypeSearch.trim().toLowerCase()
    if (!q) return ALL_NWS_ALERT_FILTER_CATEGORIES
    return ALL_NWS_ALERT_FILTER_CATEGORIES.filter((cat) => cat.name.toLowerCase().includes(q))
  }, [alertTypeSearch])

  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => !filterCategory || alert.name === filterCategory),
    [alerts, filterCategory],
  )

  const eventCount = alerts.length
  const visibleEventCount = filteredAlerts.length

  const handleGenerateAIMessage = async (alert: UnifiedEventAlertCardView) => {
    setIsGeneratingAI(true)
    try {
      const response = await fetch('/api/ai/generate-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertType: alert.name,
          context: alert.description
        })
      })
      const data = await response.json()
      if (data.message) {
        setAlertMessage(data.message)
      } else {
        toast.error("Failed to generate message")
      }
    } catch (error) {
      toast.error("Error connecting to AI service")
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleSendOfficialAlert = async (alert: UnifiedEventAlertCardView) => {
    setIsSendingAlert(true)
    // Simulate API call to send alert
    await new Promise(resolve => setTimeout(resolve, 1500))
    handleStatusChange(alert)
    setIsSendingAlert(false)
    setIsActionModalOpen(false)
    toast.success("Official Alert Dispatched Successfully")
  }

  return (
    <AdminPageShell>
        <AdminPageHeader
          title="Alerts & Communication"
          titleUppercase={false}
          description="Stay informed and prepared with real-time emergency alerts delivered directly from the National Weather Service. This system checks for updates every minute, ensuring you receive the most current weather watches and warnings as they happen."
        />



        {/* Status Bar */}
        <div className="bg-[#EEF2FF] border border-[#6366F1]/10 p-3 rounded-xl flex items-center justify-between text-[#4338CA] mb-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white shadow-sm">
              <Info size={14} />
            </div>
            <div className="flex items-center gap-1.5 text-[12px] font-bold">
              <span className="text-[#3730A3]">Real-time monitoring:</span>
              <span className="font-medium text-[#4338CA]/80">
                {loading
                  ? 'Loading unified events…'
                  : eventCount > 0
                    ? `${visibleEventCount} active event${visibleEventCount === 1 ? '' : 's'} in your sector${
                        filterCategory ? ` (filtered from ${eventCount})` : ''
                      }. Latest: ${displayLocation(alerts[0])}.`
                    : 'Polling unified feeds every minute for the latest events.'}
              </span>
            </div>
          </div>
        </div>

        {/* Channel Selection Modal */}
        <Dialog open={isChannelModalOpen} onOpenChange={setIsChannelModalOpen}>
          <DialogContent className="sm:max-w-md bg-white rounded-[32px] border-slate-100 p-8">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">How to send this alert?</DialogTitle>
              <DialogDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select up to 3 communication channels</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {[
                { id: 'push', label: 'Push Notification', icon: <Smartphone size={18} /> },
                { id: 'sms', label: 'SMS (Text)', icon: <MessageSquare size={18} /> },
                { id: 'email', label: 'Email', icon: <Mail size={18} /> },
              ].map((ch) => (
                <div
                  key={ch.id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer",
                    modalChannels.includes(ch.id) ? "border-indigo-500 bg-indigo-50/50" : "border-slate-50 bg-slate-50"
                  )}
                  onClick={() => {
                    if (modalChannels.includes(ch.id)) {
                      setModalChannels(modalChannels.filter(c => c !== ch.id))
                    } else {
                      setModalChannels([...modalChannels, ch.id])
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", modalChannels.includes(ch.id) ? "bg-indigo-600 text-white" : "bg-white text-slate-400")}>
                      {ch.icon}
                    </div>
                    <span className="text-sm font-black text-slate-700">{ch.label}</span>
                  </div>
                  <Switch
                    checked={modalChannels.includes(ch.id)}
                    onCheckedChange={() => { }}
                    className="data-[state=checked]:bg-indigo-600"
                  />
                </div>
              ))}
            </div>
            <div className="pt-4 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsChannelModalOpen(false)}
                className="flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest text-slate-400 border-slate-100"
              >
                Abort
              </Button>
              <Button
                onClick={handleConfirmUnifiedDispatch}
                disabled={modalChannels.length === 0 || isDispatching}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-12 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 gap-2"
              >
                {isDispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send size={14} /> Confirm Dispatch</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Alerts Feed */}
          <div className="lg:col-span-8 space-y-6">
            {loading ? (
              <div className="p-20 text-center bg-white rounded-3xl border border-slate-200">
                <p className="text-sm font-bold text-slate-400">Loading dynamic alerts...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-20 text-center bg-white rounded-[48px] border border-slate-200 shadow-sm">
                <div className="w-20 h-20 bg-blue-50 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner shadow-blue-500/5">
                  <CloudRain className="w-10 h-10 text-blue-500" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2 leading-none">Sector Nominal</h3>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">No active alerts detected in your sector logic.</p>
              </div>
            ) : (
              filteredAlerts.map((alert) => {
                const isSelected = selectedAlertId === alert.id;
                const sourceKey = String(alert.source || 'manual').toLowerCase()
                const sourceMeta = SOURCE_BADGE_STYLES[sourceKey] ?? {
                  label: sourceKey.toUpperCase(),
                  className: 'border-slate-300 bg-slate-50 text-slate-700'
                }

                const sevNorm = String(alert.severity ?? '').trim().toLowerCase()
                const isHighLike = sevNorm === 'high' || sevNorm === 'severe' || sevNorm === 'extreme'
                const isModerateLike = sevNorm === 'moderate' || sevNorm === 'medium'

                const badgeColor = isHighLike
                  ? 'bg-red-50 text-red-600 border-red-100'
                  : isModerateLike
                    ? 'bg-yellow-50 text-amber-600 border-amber-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200'

                const iconAccent = isHighLike ? 'text-red-500' : isModerateLike ? 'text-amber-500' : 'text-slate-500'
                let icon = <AlertTriangle className={cn('w-5 h-5', iconAccent)} />;
                if (alert.iconType === 'lightning') icon = <Zap className={cn('w-5 h-5', iconAccent)} />;
                if (alert.iconType === 'cloud') icon = <CloudRain className={cn('w-5 h-5', iconAccent)} />;

                const isTakeAction = alert.status === 'Take Action';

                const buttonColor = isTakeAction ? 'bg-[#EF4444] hover:bg-red-600' : 'bg-[#22C55E] cursor-default';
                const buttonText = isTakeAction ? 'Take Action' : 'Alert Sent';
                const isLocExpanded = !!expandedLocations[alert.id]
                const hasManyLocations = Array.isArray(alert.locations) && alert.locations.length > 1

                return (
                  <Card
                    key={alert.id}
                    onClick={() => setSelectedAlertId(alert.id)}
                    className={cn(
                      "bg-white border-slate-200 rounded-2xl p-6 hover:shadow-md transition-all relative overflow-hidden",
                      isSelected ? "ring-2 ring-[#33375D] shadow-[0_10px_30px_rgba(51,55,93,0.12  )]" : "border-slate-200"
                    )}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <span className={cn("px-3 py-1 rounded-md text-[11px] font-bold uppercase border", badgeColor)}>
                          {alert.severity}
                        </span>
                        {icon}
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border",
                            sourceMeta.className
                          )}
                        >
                          Source: {sourceMeta.label}
                        </span>
                      </div>
                      <span className="text-slate-400 text-[11px] font-bold">
                        Issued {alert.issuedAt}
                      </span>
                    </div>

                    <div className="space-y-0.5 mb-4">
                      <h2 className="text-[22px] font-black text-slate-900 tracking-tight leading-tight">{alert.name}</h2>
                      <div className="text-slate-500 text-[13px] font-bold">
                        <p className="inline">{displayLocation(alert)}</p>
                        {hasManyLocations && (
                          <button
                            className="ml-2 text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-700"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedLocations((prev) => ({ ...prev, [alert.id]: !prev[alert.id] }))
                            }}
                            type="button"
                          >
                            {isLocExpanded ? 'Hide' : `View all (${alert.locationCount ?? alert.locations?.length ?? 0})`}
                          </button>
                        )}
                        {hasManyLocations && isLocExpanded && (
                          <div className="mt-2 text-[12px] font-bold text-slate-500">
                            {(alert.locations ?? []).join(', ')}
                          </div>
                        )}
                      </div>
                      {alert.description && (
                        <p className="text-[13px] font-medium text-slate-600 leading-relaxed mt-3 line-clamp-3">
                          {alert.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Clock size={14} />
                        <span className="text-[11px] font-black uppercase tracking-wider">Expires: {alert.expiresAt}</span>
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isTakeAction) handleFeedDispatch(alert)
                        }}
                        className={cn("rounded-lg px-8 py-5 font-black text-white transition-all shadow-sm text-[14px]", buttonColor)}
                      >
                        {buttonText}
                      </Button>
                    </div>
                  </Card>
                );
              })


            )}
          </div>

          {/* Sidebars */}
          <div className="lg:col-span-4">
            <div className="sticky top-8 space-y-6 h-fit">
              {/* Alert Type Filter Legend */}
              <Card className="bg-white border-slate-200 rounded-[28px] p-6 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />

                <div className="flex items-center justify-between mb-4 relative">
                  <div className="space-y-0.5">
                    <h3 className="text-[15px] font-black text-slate-900 leading-none uppercase tracking-tight">Filter by Alert</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NWS Official Color Logic</p>
                  </div>
                  {filterCategory && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilterCategory(null)}
                      className="h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#EF4444] hover:bg-red-50 transition-all border border-red-100/50"
                    >
                      Clear Filter
                    </Button>
                  )}
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <Input
                    value={alertTypeSearch}
                    onChange={(e) => setAlertTypeSearch(e.target.value)}
                    placeholder="Search alert types (e.g. hurricane, tropical)…"
                    className="pl-9 h-10 rounded-xl border-slate-200 bg-slate-50/80 text-[13px] font-semibold placeholder:text-slate-400 focus-visible:ring-[#4338CA]/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar relative">
                  {filteredAlertTypeCategories.length === 0 ? (
                    <p className="col-span-2 text-[12px] font-bold text-slate-400 py-4 text-center">
                      No alert types match “{alertTypeSearch.trim()}”
                    </p>
                  ) : (
                    filteredAlertTypeCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setFilterCategory(filterCategory === cat.name ? null : cat.name)}
                        className={cn(
                          "flex items-center gap-2.5 group transition-all p-1.5 rounded-xl border",
                          filterCategory === cat.name
                            ? "bg-slate-900 border-slate-900 shadow-lg shadow-slate-900/10"
                            : "hover:bg-slate-50 border-transparent"
                        )}
                      >
                        <div
                          className="w-3.5 h-3.5 rounded-md shrink-0 shadow-sm border border-black/5"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-tight text-left leading-tight transition-colors truncate",
                          filterCategory === cat.name ? "text-white" : "text-slate-600 group-hover:text-slate-900"
                        )}>
                          {cat.name}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </Card>

              {/* Alert detail — selected feed item or NWS info fallback */}
              <Card className="bg-white border-slate-100 rounded-[24px] p-6 shadow-sm">
                <h3 className="text-[20px] font-black text-slate-900 mb-5">
                  {selectedAlert ? 'Selected Alert' : 'Alerts Details'}
                </h3>

                {selectedAlert ? (
                  <div className="space-y-5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Event</p>
                      <p className="text-[16px] font-black text-slate-900 leading-tight">{selectedAlert.name}</p>
                      <p className="text-[12px] font-bold text-slate-500 mt-1">{displayLocation(selectedAlert)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase border bg-slate-50 text-slate-700 border-slate-200">
                        {selectedAlert.severity}
                      </span>
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase border bg-slate-50 text-slate-700 border-slate-200">
                        {selectedAlert.type}
                      </span>
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase border bg-slate-50 text-slate-700 border-slate-200">
                        {selectedAlert.status}
                      </span>
                    </div>

                    {selectedAlert.description && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Description</p>
                        <p className="text-[13px] font-bold text-slate-700 leading-relaxed">{selectedAlert.description}</p>
                      </div>
                    )}

                    {selectedAlert.instructions && selectedAlert.instructions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Instructions</p>
                        <ul className="space-y-2">
                          {selectedAlert.instructions.map((inst, idx) => (
                            <li key={idx} className="flex gap-2 items-start text-[13px] font-bold text-slate-700 leading-snug">
                              <span className="text-slate-400 shrink-0">{idx + 1}.</span>
                              <span>{inst}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedAlert.properties && Object.keys(selectedAlert.properties).length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Event Data</p>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar">
                          {formatAlertProperties(selectedAlert.properties).map((line, idx) => (
                            <p key={idx} className="text-[12px] font-bold text-slate-600 leading-snug">{line}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-slate-400 pt-2 border-t border-slate-100">
                      <Clock size={12} />
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        Issued {selectedAlert.issuedAt} · Expires {selectedAlert.expiresAt}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#F0F4FF] rounded-[20px] p-6 space-y-6">
                    <div className="flex items-center gap-4">
                      <h4 className="text-[17px] font-black text-slate-900 leading-tight">National Weather Service</h4>
                    </div>

                    <ul className="space-y-4">
                      {[
                        "Official, government-issued weather alerts",
                        "Real-time updates during active weather events",
                        "Timely watches, warnings, and advisories for your area",
                        "Reliable information designed to support quick decision-making"
                      ].map((point, idx) => (
                        <li key={idx} className="flex gap-3 items-start group">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-1.5 shrink-0" />
                          <p className="text-[14px] font-bold text-slate-700 leading-snug tracking-tight">
                            {point}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {/* Notification Preferences Sidepanel */}
              <Card className="bg-white border-slate-200 rounded-3xl p-8 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Notification Preferences</h3>
                <div className="space-y-6">
                  {[
                    { id: 'push', label: 'Push Notifications', icon: <Smartphone size={18} /> },
                    { id: 'sms', label: 'SMS Alerts', icon: <MessageSquare size={18} /> },
                    { id: 'email', label: 'Email Alerts', icon: <Mail size={18} /> },
                  ].map((pref) => (
                    <div key={pref.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-slate-700">
                        {pref.icon}
                        <span className="text-sm font-bold">{pref.label}</span>
                      </div>
                      <Switch
                        checked={notificationPrefs[pref.id]}
                        onCheckedChange={() => toggleNotification(pref.id)}
                        className="data-[state=checked]:bg-[#4338CA]"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* Action Required Modal */}
        <Dialog open={isActionModalOpen} onOpenChange={setIsActionModalOpen}>
          <DialogContent className="max-w-[480px] p-0 overflow-hidden border-none rounded-[24px] bg-white shadow-2xl flex flex-col max-h-[95vh] my-auto">
            {currentActionAlert && (
              <>
                {/* Header - Fixed */}
                <div className="bg-[#EF4444] p-6 pt-10 text-white relative shrink-0">

                  <div className="space-y-1 mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white/90">Action Required</p>
                    <DialogTitle className="text-[28px] font-black tracking-tight leading-tight text-white">
                      {currentActionAlert.name}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      Emergency alert details and required actions for {currentActionAlert.name}.
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-bold text-white/90">
                    <p>{displayLocation(currentActionAlert)}</p>
                    <div className="w-1 h-1 rounded-full bg-white/40 shrink-0" />
                    <p className="shrink-0">Issued {currentActionAlert.issuedAt}</p>
                    <div className="w-1 h-1 rounded-full bg-white/40 shrink-0" />
                    <p className="shrink-0">Expires: {currentActionAlert.expiresAt}</p>
                  </div>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  <div className="space-y-2">
                    <h3 className="text-[15px] font-black text-slate-900 tracking-tight">What This Means</h3>
                    <p className="text-slate-600 font-medium leading-relaxed text-[13px]">
                      {currentActionAlert.description}
                    </p>
                  </div>

                  <div className="bg-[#FFEDEC] rounded-[16px] p-5 space-y-4">
                    <h3 className="text-[14px] font-black text-slate-900 tracking-tight">What You Need To Do Now</h3>
                    <div className="space-y-3">
                      {currentActionAlert.instructions?.map((inst: string, idx: number) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <Check size={14} className="text-slate-900 shrink-0 mt-0.5" strokeWidth={4} />
                          <p className="text-slate-900 font-bold text-[13px] tracking-tight leading-snug">{inst}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <Label className="text-[15px] font-black text-slate-900 tracking-tight">Broadcast Message</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGenerateAIMessage(currentActionAlert)}
                        disabled={isGeneratingAI}
                        className="text-[#6366F1] hover:text-[#4F46E5] hover:bg-indigo-50 font-black text-[11px] uppercase tracking-widest gap-2"
                      >
                        {isGeneratingAI ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Drafting...
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            AI Auto-Draft
                          </>
                        )}
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Enter the official emergency broadcast message..."
                      value={alertMessage}
                      onChange={(e) => setAlertMessage(e.target.value)}
                      className="min-h-[120px] rounded-2xl border-slate-200 focus:ring-[#EF4444]/10 focus:border-[#EF4444] font-medium text-[13px] transition-all resize-none bg-slate-50/50"
                    />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Recommended: Keep under 160 characters for SMS compatibility.
                    </p>
                  </div>
                </div>

                {/* Footer - Fixed Action Button */}
                <div className="p-6 border-t border-slate-100 bg-white shrink-0">
                  <Button
                    disabled={!alertMessage || isSendingAlert}
                    onClick={() => handleSendOfficialAlert(currentActionAlert)}
                    className="w-full bg-[#EF4444] hover:bg-[#DC2626] text-white font-black h-14 rounded-2xl text-[14px] uppercase tracking-widest transition-all active:scale-[0.98] shadow-xl shadow-red-500/20 gap-3"
                  >
                    {isSendingAlert ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Dispatching Communications...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send Official Alert
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
    </AdminPageShell>
  );
}

