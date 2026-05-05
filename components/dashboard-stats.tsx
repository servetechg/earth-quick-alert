'use client'

import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { AlertTriangle, Radio, Users, Shield, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DashboardStats() {
  const [statsData, setStatsData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/stats')
        const data = await res.json()
        if (data.success) {
          setStatsData(data.data)
        }
      } catch (err) {
        console.error('Failed to fetch stats', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const stats = [
    {
      title: 'Active Emergencies',
      value: loading ? '...' : (statsData?.quakeCount + statsData?.weatherCount + statsData?.totalIncidents) || 0,
      unit: 'Events',
      icon: AlertTriangle,
      iconColor: 'fill-red-500',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      details: [
        { label: 'Weather Alerts', sub: statsData?.weatherCount || 0, active: !!statsData?.weatherCount },
        { label: 'Incident Reports', sub: statsData?.totalIncidents || 0, active: !!statsData?.totalIncidents }
      ]
    },
    {
      title: 'Total Community (C)',
      value: loading ? '...' : statsData?.totalUsers?.toLocaleString() || '0',
      unit: 'Downloads',
      icon: Users,
      color: 'text-amber-500',
      iconColor: 'fill-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      details: [
        { label: 'Safe Verified (C)', sub: statsData?.safeUsers || 0, active: false }
      ]
    },
    {
      title: 'Pending Access (B)',
      value: loading ? '...' : statsData?.pendingSubAdmins || 0,
      unit: 'Adm. Requests',
      icon: Radio,
      color: 'text-blue-500',
      iconColor: 'fill-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      details: [
        { label: 'Auth Pipeline', sub: 'Ready for Review', active: !!statsData?.pendingSubAdmins }
      ]
    },
    {
      title: 'Approved SubAdmins',
      value: loading ? '...' : statsData?.approvedSubAdmins || 0,
      unit: 'Admin Nodes',
      icon: Shield,
      color: 'text-emerald-500',
      iconColor: 'fill-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      details: [
        { label: 'Authorized (B)', sub: 'Operational', active: false },
        { label: 'Super Admins', sub: statsData?.superAdmins || 0, active: false }
      ]
    }
  ]

  const iconBox = (stat: (typeof stats)[number]) =>
    cn(
      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xl transition-all group-hover:scale-110',
      stat.bg,
    )

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-white border border-slate-200 border-l-4 border-l-[#33375D] rounded-[32px] p-8 shadow-sm flex flex-col items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, i) => (
        <Card key={i} className="bg-white border border-slate-200 border-l-4 border-l-[#33375D] rounded-[32px] p-8 shadow-sm hover:bg-slate-50/50 transition-all group relative overflow-hidden">
          {/* <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
            <stat.icon size={80} />
          </div> */}

          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{stat.title}</h3>
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-none">Global Matrix Scan</p>
            </div>
            <div className={iconBox(stat)}>
              {stat.icon === AlertTriangle ? (
                <AlertTriangle
                  size={20}
                  className={cn(
                    '[&>path:nth-child(1)]:fill-red-500 [&>path:nth-child(1)]:stroke-red-600 [&>path:nth-child(1)]:stroke-[1.25]',
                    '[&>path:nth-child(2)]:fill-none [&>path:nth-child(2)]:stroke-white [&>path:nth-child(2)]:stroke-[2.5]',
                    '[&>path:nth-child(3)]:fill-white [&>path:nth-child(3)]:stroke-white',
                  )}
                  fill="none"
                  strokeWidth={2}
                />
              ) : stat.icon === Radio ? (
                <Radio
                  size={20}
                  className="[&>circle]:fill-blue-500 [&>circle]:stroke-blue-600 [&>path]:stroke-blue-500 [&>path]:fill-none"
                  fill="none"
                  strokeWidth={2.5}
                />
              ) : stat.icon === Users ? (
                <Users
                  size={20}
                  className="[&>path]:fill-amber-500 [&>circle]:fill-amber-500 [&>path]:stroke-amber-600 [&>circle]:stroke-amber-600"
                  strokeWidth={1.75}
                />
              ) : stat.icon === Shield ? (
                <Shield size={20} className="fill-emerald-500" strokeWidth={0} />
              ) : (
                <stat.icon size={20} className={cn(stat.color, stat.iconColor)} fill="currentColor" strokeWidth={2} />
              )}
            </div>
          </div>

          <div className="mb-6 flex items-baseline gap-3">
            <span className={cn("text-5xl font-black tracking-tighter leading-none transition-all", stat.color)}>{stat.value}</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.unit}</span>
          </div>

          <div className="space-y-3 pt-6 border-t border-slate-100">
            {stat.details.map((detail, j) => (
              <div key={j} className="flex items-center justify-between group/detail">
                <div className="flex items-center gap-3">
                  {detail.active && <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]", stat.color === 'text-red-500' ? 'bg-red-500' : 'bg-blue-500')} />}
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight group-hover/detail:text-slate-900 transition-colors">{detail.label}</span>
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">{detail.sub}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
