'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
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
  Globe,
  ShieldCheck,
  Flag,
  ShieldAlert,
  ChevronRight,
  Wand2,
  AlertCircle,
  CheckCircle2,
  Check,
  ExternalLink,
  ArrowRight,
  X,
  Send,
  Loader2,
  Sparkles,
  Search as SearchIcon
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { AlertSeverity, AlertSource } from '@/lib/types/api-alerts'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

const ALERT_CATEGORIES = [
  { name: 'Tornado Warning', color: '#FF0000' },
  { name: 'Tornado Watch', color: '#FFFF00' },
  { name: 'Flash Flood Warning', color: '#8B0000' },
  { name: 'Special Marine Warning', color: '#FFA500' },
  { name: 'Winter Storm Warning', color: '#FF69B4' },
  { name: 'High Wind Warning', color: '#DAA520' },
  { name: 'Flood Warning', color: '#00FF00' },
  { name: 'Gale Warning', color: '#DDA0DD' },
  { name: 'Red Flag Warning', color: '#FF1493' },
  { name: 'Winter Weather Advisory', color: '#7B68EE' },
  { name: 'Flood Advisory', color: '#00FA9A' },
  { name: 'Coastal Flood Advisory', color: '#ADFF2F' },
  { name: 'High Surf Advisory', color: '#BA55D3' },
  { name: 'Small Craft Advisory', color: '#D8BFD8' },
  { name: 'Brisk Wind Advisory', color: '#D8BFD8' },
  { name: 'Hazardous Seas Warning', color: '#D8BFD8' },
  { name: 'Lake Wind Advisory', color: '#D2B48C' },
  { name: 'Wind Advisory', color: '#D2B48C' },
  { name: 'Winter Storm Watch', color: '#4682B4' },
  { name: 'Rip Current Statement', color: '#40E0D0' },
  { name: 'Flood Watch', color: '#2E8B57' },
  { name: 'High Wind Watch', color: '#B8860B' },
  { name: 'Freeze Watch', color: '#00FFFF' },
  { name: 'Fire Weather Watch', color: '#FFE4B5' },
  { name: 'Special Weather Statement', color: '#FFE4B5' },
  { name: 'Marine Weather Statement', color: '#FFE4B5' },
  { name: 'Air Quality Alert', color: '#696969' },
]

const NWS_NATIONAL_ALERTS = [
  // Severe Weather
  { id: 'tornado_warning', name: 'Tornado Warning', severity: 'Extreme', category: 'Severe', icon: <AlertTriangle className="text-red-600" size={16} /> },
  { id: 'tornado_watch', name: 'Tornado Watch', severity: 'High', category: 'Severe', icon: <AlertTriangle className="text-red-400" size={16} /> },
  { id: 'severe_thunderstorm_warning', name: 'Severe Thunderstorm Warning', severity: 'Severe', category: 'Severe', icon: <Zap className="text-amber-500" size={16} /> },
  { id: 'severe_thunderstorm_watch', name: 'Severe Thunderstorm Watch', severity: 'High', category: 'Severe', icon: <Zap className="text-amber-300" size={16} /> },
  { id: 'flash_flood_warning', name: 'Flash Flood Warning', severity: 'Severe', category: 'Severe', icon: <CloudRain className="text-blue-600" size={16} /> },
  { id: 'flash_flood_watch', name: 'Flash Flood Watch', severity: 'High', category: 'Severe', icon: <CloudRain className="text-blue-400" size={16} /> },
  { id: 'flood_warning', name: 'Flood Warning', severity: 'Moderate', category: 'Severe', icon: <CloudRain className="text-blue-300" size={16} /> },

  // Winter Hazards
  { id: 'blizzard_warning', name: 'Blizzard Warning', severity: 'Extreme', category: 'Winter', icon: <CloudRain className="text-indigo-500" size={16} /> },
  { id: 'winter_storm_warning', name: 'Winter Storm Warning', severity: 'High', category: 'Winter', icon: <CloudRain className="text-slate-500" size={16} /> },
  { id: 'winter_storm_watch', name: 'Winter Storm Watch', severity: 'Moderate', category: 'Winter', icon: <CloudRain className="text-slate-400" size={16} /> },
  { id: 'ice_storm_warning', name: 'Ice Storm Warning', severity: 'High', category: 'Winter', icon: <Zap className="text-cyan-500" size={16} /> },
  { id: 'extreme_cold_warning', name: 'Extreme Cold Warning', severity: 'High', category: 'Winter', icon: <Smartphone className="text-blue-700" size={16} /> },

  // Coastal & Marine
  { id: 'hurricane_warning', name: 'Hurricane Warning', severity: 'Extreme', category: 'Coastal', icon: <Zap className="text-red-700" size={16} /> },
  { id: 'hurricane_watch', name: 'Hurricane Watch', severity: 'High', category: 'Coastal', icon: <Zap className="text-red-500" size={16} /> },
  { id: 'tropical_storm_warning', name: 'Tropical Storm Warning', severity: 'High', category: 'Coastal', icon: <Zap className="text-orange-500" size={16} /> },
  { id: 'tsunami_warning', name: 'Tsunami Warning', severity: 'Extreme', category: 'Coastal', icon: <AlertTriangle className="text-red-800" size={16} /> },
  { id: 'coastal_flood_warning', name: 'Coastal Flood Warning', severity: 'High', category: 'Coastal', icon: <CloudRain className="text-blue-800" size={16} /> },

  // Fire & Heat
  { id: 'fire_weather_warning', name: 'Fire Weather Warning (Red Flag)', severity: 'High', category: 'Fire/Heat', icon: <AlertTriangle className="text-orange-600" size={16} /> },
  { id: 'excessive_heat_warning', name: 'Excessive Heat Warning', severity: 'Extreme', category: 'Fire/Heat', icon: <Info className="text-red-500" size={16} /> },
  { id: 'heat_advisory', name: 'Heat Advisory', severity: 'Moderate', category: 'Fire/Heat', icon: <Info className="text-orange-400" size={16} /> },

  // Others
  { id: 'high_wind_warning', name: 'High Wind Warning', severity: 'High', category: 'Other', icon: <Zap className="text-blue-400" size={16} /> },
  { id: 'dust_storm_warning', name: 'Dust Storm Warning', severity: 'High', category: 'Other', icon: <AlertTriangle className="text-yellow-700" size={16} /> },
  { id: 'air_stagnation_advisory', name: 'Air Stagnation Advisory', severity: 'Low', category: 'Other', icon: <Info className="text-slate-400" size={16} /> },
  { id: 'special_marine_warning', name: 'Special Marine Warning', severity: 'High', category: 'Other', icon: <AlertTriangle className="text-indigo-600" size={16} /> },
];

export default function AlertsCommunicationPage() {
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({
    push: true,
    sms: true,
    email: false,
  })

  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)


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
        const formattedAlerts = data.map((item: any) => ({
          ...item,
          id: item._id,
          severity: item.severity === 'Extreme' ? AlertSeverity.EXTREME : item.severity === 'High' ? AlertSeverity.SEVERE : AlertSeverity.MODERATE,
          affectedAreas: [item.location]
        }))
        setAlerts(formattedAlerts)

        if (formattedAlerts.length > 0 && !selectedAlertId) {
          setSelectedAlertId(formattedAlerts[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch emergency alerts', err)
    } finally {
      setLoading(false)
    }
  }, [selectedAlertId])


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

  const handleStatusChange = async (alert: any) => {
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

  const handleFeedDispatch = (alert: any) => {
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

  // AI Alert State
  const [alertMessage, setAlertMessage] = useState('')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [isSendingAlert, setIsSendingAlert] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  const handleGenerateAIMessage = async (alert: any) => {
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

  const handleSendOfficialAlert = async (alert: any) => {
    setIsSendingAlert(true)
    // Simulate API call to send alert
    await new Promise(resolve => setTimeout(resolve, 1500))
    handleStatusChange(alert)
    setIsSendingAlert(false)
    setIsActionModalOpen(false)
    toast.success("Official Alert Dispatched Successfully")
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[1800px] mx-auto p-6 lg:p-12 space-y-8">
        {/* Hero Header */}
        <Card className="p-8 lg:p-12 bg-white border-slate-200 rounded-3xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#33375D]" />
          <div className="flex justify-between items-start gap-8">
            <div className="space-y-4 flex-1">
              <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-4">Alerts & Communication</h1>
              <p className="text-slate-600 font-medium text-sm lg:text-base max-w-4xl leading-relaxed">
                Stay informed and prepared with real-time emergency alerts delivered directly from the National Weather Service.
                This system checks for updates every minute, ensuring you receive the most current weather watches and warnings as they happen.
              </p>
            </div>
            {/* <Button
            variant="outline"
            onClick={() => fetchDynamicAlerts()}
            className="mt-2 border-slate-200 text-slate-600 hover:bg-slate-50 gap-2 font-bold"
          >
            <Clock size={16} className="text-blue-500" />
            Check Updates
          </Button> */}
          </div>
        </Card>



        {/* Status Bar */}
        <div className="bg-[#EEF2FF] border border-[#6366F1]/10 p-3 rounded-xl flex items-center justify-between text-[#4338CA] mb-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white shadow-sm">
              <Info size={14} />
            </div>
            <div className="flex items-center gap-1.5 text-[12px] font-bold">
              <span className="text-[#3730A3]">Real-time monitoring:</span>
              <span className="font-medium text-[#4338CA]/80">
                {alerts.length > 0
                  ? `Signals are live: Most recent alert detected in ${alerts[0].affectedAreas[0]}.`
                  : "Polling the National Weather Service every minute for the latest alerts."
                }
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
              alerts.filter(alert => !filterCategory || alert.name === filterCategory).map((alert) => {
                const isWarning = alert.type === 'Warning';
                const isSelected = selectedAlertId === alert.id;

                const badgeColor = isWarning ? 'bg-red-50 text-red-600 border-red-100' : 'bg-yellow-50 text-amber-600 border-amber-100';

                let icon = <AlertTriangle className="w-5 h-5 text-red-500" />;
                if (alert.iconType === 'lightning') icon = <Zap className="w-5 h-5 text-orange-500" />;
                if (alert.iconType === 'cloud') icon = <CloudRain className="w-5 h-5 text-amber-500" />;

                const isTakeAction = alert.status === 'Take Action';
                const isAlertSent = alert.status === 'Get Prepared';

                const buttonColor = isTakeAction ? 'bg-[#EF4444] hover:bg-red-600' : 'bg-[#22C55E] cursor-default';
                const buttonText = isTakeAction ? 'Take Action' : 'Alert Sent';

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
                        <span className={cn("px-3 py-1 rounded-md text-[9px] font-black uppercase border", badgeColor)}>
                          {alert.type}
                        </span>
                        {icon}
                      </div>
                      <span className="text-slate-400 text-[11px] font-bold">
                        Issued {alert.issuedAt}
                      </span>
                    </div>

                    <div className="space-y-0.5 mb-4">
                      <h2 className="text-[22px] font-black text-slate-900 tracking-tight leading-tight">{alert.name}</h2>
                      <p className="text-slate-500 text-[13px] font-bold">{alert.location}</p>
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

                <div className="flex items-center justify-between mb-5 relative">
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

                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar relative">
                  {ALERT_CATEGORIES.map((cat) => (
                    <button
                      key={cat.name}
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
                  ))}
                </div>
              </Card>

              {/* Alerts Details Sidepanel */}
              <Card className="bg-white border-slate-100 rounded-[24px] p-6 shadow-sm">
                <h3 className="text-[20px] font-black text-slate-900 mb-5">Alerts Details</h3>

                <div className="bg-[#F0F4FF] rounded-[20px] p-6 space-y-6">
                  <div className="flex items-center gap-4">
                    {/* <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-blue-50">
                    <Image src="https://www.weather.gov/assets/images/nws_logo.png" alt="NWS" width={32} height={32} />
                  </div> */}
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
                    <p>{currentActionAlert.location}</p>
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
      </div>
    </main>
  );
}

