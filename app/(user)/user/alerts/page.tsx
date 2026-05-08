'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Cloud, MapPin, Loader2, ShieldAlert, Zap, RefreshCw, Share2 } from 'lucide-react'
import { useAPIAlerts } from '@/lib/hooks/use-api-alerts'
import { Alert, AlertSeverity, AlertSource } from '@/lib/types/api-alerts'
import { cn } from '@/lib/utils'

export default function UserAlertsPage() {
  const alertOptions = useMemo(() => ({
    autoRefresh: false,
    filters: {
      source: [AlertSource.ADMIN_MANUAL, AlertSource.SOCIAL_MEDIA, AlertSource.WEATHER_API, AlertSource.EARTHQUAKE_API]
    }
  }), [])

  const { alerts: myAlerts, loading: myAlertsLoading, refresh } = useAPIAlerts(alertOptions)

  const getSeverityStyles = (severity: AlertSeverity) => {
    switch (severity) {
      case AlertSeverity.EXTREME: return 'border-red-600 bg-red-600/5 text-red-600'
      case AlertSeverity.SEVERE: return 'border-orange-500 bg-orange-500/5 text-orange-600'
      case AlertSeverity.HIGH: return 'border-amber-500 bg-amber-500/5 text-amber-600'
      case AlertSeverity.MODERATE: return 'border-blue-500 bg-blue-500/5 text-blue-600'
      default: return 'border-slate-400 bg-slate-400/5 text-slate-600'
    }
  }

  const getAlertIcon = (source: AlertSource) => {
    switch (source) {
      case AlertSource.WEATHER_API: return Cloud
      case AlertSource.EARTHQUAKE_API: return Zap
      case AlertSource.SOCIAL_MEDIA: return Share2
      default: return AlertTriangle
    }
  }

  const AlertCard = ({ alert, locationLabel }: { alert: Alert, locationLabel?: string }) => {
    const Icon = getAlertIcon(alert.source)
    const severityStyles = getSeverityStyles(alert.severity)
    const isWeather = alert.source === AlertSource.WEATHER_API
    const weatherData = isWeather ? (alert as any) : null
    const isAdmin = alert.source === AlertSource.ADMIN_MANUAL
    const adminData = isAdmin ? (alert as any) : null
    const isSocial = alert.source === AlertSource.SOCIAL_MEDIA
    const socialData = isSocial ? (alert as any) : null

    return (
      <Card className={cn("p-6 border-l-4 border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-white group relative overflow-hidden")}>
        <div className={cn("absolute left-0 top-0 bottom-0 w-1", severityStyles.split(' ')[0])} />
        <div className="flex items-start gap-6">
          <div className={cn("p-4 rounded-2xl flex-shrink-0 transition-transform group-hover:scale-105 shadow-sm", severityStyles.split(' ').slice(1).join(' '))}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className={cn("px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg", severityStyles.split(' ').slice(1).join(' '))}>
                {alert.severity}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {isAdmin && (
                <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-md uppercase tracking-widest">
                  Official Communication
                </span>
              )}
              {isSocial && (
                <span className={cn(
                  "text-[10px] font-black text-white px-2 py-0.5 rounded-md uppercase tracking-widest",
                  socialData.platform === 'X' ? "bg-slate-900" : 
                  socialData.platform === 'Facebook' ? "bg-blue-600" : "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500"
                )}>
                  {socialData.platform} Report
                </span>
              )}
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-1 leading-tight tracking-tight uppercase">{alert.title}</h3>
            <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              {isAdmin ? `Zones: ${alert.affectedAreas?.join(', ') || 'All'}` : (locationLabel || alert.affectedAreas?.[0] || 'Unknown Location')}
            </div>
            <p className="text-sm text-slate-500 leading-relaxed mb-4 font-medium whitespace-pre-wrap">
              {alert.description}
            </p>

            {isWeather && (
              <div className="flex flex-wrap gap-2">
                {weatherData.windSpeed !== undefined && <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2.5 py-1.5 bg-slate-50 rounded-lg">💨 {weatherData.windSpeed} km/h</div>}
                {weatherData.humidity !== undefined && <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2.5 py-1.5 bg-slate-50 rounded-lg">💧 {weatherData.humidity}% humidity</div>}
              </div>
            )}

            {isAdmin && adminData?.adminName && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[8px] font-black text-slate-400">
                  {adminData.adminName.charAt(0)}
                </div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Authorized by {adminData.adminName}</span>
              </div>
            )}
          </div>
          <Button variant="outline" className="hidden sm:flex rounded-xl font-bold text-[10px] h-10 px-4 gap-2 border-slate-100 hover:bg-slate-50 uppercase tracking-widest">
            Details
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-12 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#33375D] shadow-lg shadow-[#33375D]/20">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">Status & Alerts</h1>
            </div>
            <p className="text-slate-500 font-bold max-w-md">Real-time situational awareness for your safety network.</p>
          </div>
          <Button
            onClick={() => refresh()}
            className="bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-2xl h-12 px-6 font-bold uppercase tracking-widest text-[10px] shadow-sm gap-2"
          >
            {myAlertsLoading ? <RefreshCw className="h-4 w-4 animate-spin text-[#33375D]" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </header>

        <section className="space-y-12">
          {/* Your Coverage */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 rounded-lg">
                <MapPin className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Safety Signals (Official & Public)</h2>
            </div>

            <div className="space-y-4">
              {myAlertsLoading ? (
                <div className="p-16 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100">
                  <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[#33375D]" />
                  <p className="font-bold text-xs text-slate-400 uppercase tracking-widest">Scanning your area...</p>
                </div>
              ) : myAlerts.length === 0 ? (
                <div className="p-8 bg-green-50/30 rounded-[2.5rem] border border-green-100/50 flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-green-500">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 uppercase tracking-tight">Everything is Clear</p>
                    <p className="text-xs font-bold text-green-700 uppercase tracking-widest">No active alerts reported.</p>
                  </div>
                </div>
              ) : (
                myAlerts.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))
              )}
            </div>
          </div>

        </section>
      </div>
    </main>
  )
}
