'use client'

import React, { useEffect, useState } from 'react'
import { GISMap } from '@/components/gis-map'
import { LicenseRequestList } from '@/components/license-request-list'
import { ThreatMonitoring } from '@/components/threat-monitoring'
import {
  Shield,
  Wifi,
  Users,
  Settings,
  AlertTriangle,
  Radio,
  Target,
  Terminal,
  Activity,
  ArrowUpRight,
  Search,
  Bell,
  MapPin,
  ChevronDown,
  User as UserIcon,
  HardHat
} from 'lucide-react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GenericEmergencyMetric } from '@/lib/types/emergency'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ResponderTable } from '@/components/responder-table'
import { AdminPageShell } from '@/components/admin-page-shell'

export default function SuperAdminDashboard() {
  const [activeEmergencies, setActiveEmergencies] = useState<GenericEmergencyMetric[]>([])
  const [alertsSent, setAlertsSent] = useState<GenericEmergencyMetric[]>([])
  const [impactedUsers, setImpactedUsers] = useState<GenericEmergencyMetric[]>([])
  const [eocStatus, setEocStatus] = useState<GenericEmergencyMetric[]>([])
  const [responders, setResponders] = useState<any[]>([])
  const [licenses, setLicenses] = useState<any[]>([])
  const [subAdminUsers, setSubAdminUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLocation, setSelectedLocation] = useState('All')

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      const fetchMetric = async (url: string, setter: (data: any) => void) => {
        try {
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) setter(data)
          }
        } catch (e) {
          console.error(`Failed to fetch from ${url}:`, e)
        }
      }

      const fetchSubAdminUsers = async () => {
        try {
          const res = await fetch('/api/admin/users?role=sub-admin')
          if (!res.ok) return
          const data = await res.json()
          setSubAdminUsers(Array.isArray(data?.users) ? data.users : [])
        } catch (e) {
          console.error('Failed to fetch sub-admin users:', e)
        }
      }

      await Promise.all([
        fetchMetric('/api/active-emergencies', setActiveEmergencies),
        fetchMetric('/api/alerts-sent-emergencies', setAlertsSent),
        fetchMetric('/api/ready2go-users-impacted', setImpactedUsers),
        fetchMetric('/api/virtual-eoc-status', setEocStatus),
        fetchMetric('/api/responders', setResponders),
        fetchSubAdminUsers(),
      ])

      setLoading(false)
    }

    fetchData()
  }, [])

  const allSubAdmins = Array.from(
    new Set(
      [
        ...subAdminUsers.map((u: any) => (u.name || u.email || '').trim()).filter(Boolean),
        ...activeEmergencies.map((e: any) => e.subAdminName),
        ...alertsSent.map((e: any) => e.subAdminName),
        ...impactedUsers.map((e: any) => e.subAdminName),
        ...eocStatus.map((e: any) => e.subAdminName),
      ].filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  const subAdminKeysForFilter =
    selectedLocation === 'All'
      ? null
      : (() => {
          const u = subAdminUsers.find(
            (x: any) =>
              (typeof x.name === 'string' && x.name === selectedLocation) ||
              (typeof x.email === 'string' && x.email === selectedLocation)
          )
          if (u) {
            return [u.name, u.email].filter((k): k is string => Boolean(k && String(k).trim()))
          }
          return [selectedLocation]
        })()

  const rowMatchesSelectedSubAdmin = (e: { subAdminName?: string }) => {
    if (selectedLocation === 'All') return true
    const name = e?.subAdminName
    if (!name) return false
    return subAdminKeysForFilter!.includes(name)
  }

  const filteredActive = selectedLocation === 'All'
    ? activeEmergencies
    : activeEmergencies.filter((e: any) => rowMatchesSelectedSubAdmin(e))

  const filteredAlerts = selectedLocation === 'All'
    ? alertsSent
    : alertsSent.filter((e: any) => rowMatchesSelectedSubAdmin(e))

  const filteredImpacted = selectedLocation === 'All'
    ? impactedUsers
    : impactedUsers.filter((e: any) => rowMatchesSelectedSubAdmin(e))

  const filteredEOC = selectedLocation === 'All'
    ? eocStatus
    : eocStatus.filter((e: any) => rowMatchesSelectedSubAdmin(e))

  const selectedSubAdmin =
    selectedLocation !== 'All'
      ? subAdminUsers.find(
          (u: any) =>
            (typeof u.name === 'string' && u.name === selectedLocation) ||
            (typeof u.email === 'string' && u.email === selectedLocation)
        )
      : undefined

  const selectedAdminCoords = selectedSubAdmin

  return (
    <AdminPageShell className="selection:bg-[#33375D]/15">
        {/* Title Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full -mr-32 -mt-32 blur-3xl" />
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-16 h-16 bg-[#DC2626] rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-red-200 border-2 border-white group transition-transform hover:scale-105">
              <Shield size={32} className="group-hover:rotate-12 transition-transform" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none mb-2">Emergency Dashboard</h1>
              <div className="flex items-center gap-3">
                <p className="text-slate-500 font-bold text-xs tracking-tight">Live Status</p>
                <div className="w-1 h-1 rounded-full bg-slate-300" />
                <div className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-black uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                  <Activity size={10} /> Live
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 w-full md:w-72">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2 italic text-[#33375D]">Filter by Sub-Admin</p>
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <UserIcon size={16} className="text-[#DC2626] group-focus-within:animate-pulse" />
              </div>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full h-14 pl-12 pr-10 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-black text-xs uppercase tracking-widest appearance-none focus:outline-none focus:ring-4 focus:ring-red-500/5 focus:border-[#DC2626] transition-all cursor-pointer hover:bg-white"
              >
                <option value="All">All admins</option>
                {allSubAdmins.map(admin => (
                  <option key={admin} value={admin}>{admin}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-[#DC2626] transition-colors" size={18} />
            </div>
          </div>
        </div>

        {/* Status Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Active Emergencies */}
          <Card className="p-6 border border-slate-200 border-l-4 border-l-[#33375D] rounded-lg shadow-sm bg-white relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-slate-900 font-bold text-lg leading-tight">Active Emergencies</h3>
              <AlertTriangle className="text-[#DC2626]" size={18} />
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-5xl font-black text-[#DC2626] tracking-tighter">
                {loading ? '00' : filteredActive.length.toString().padStart(2, '0')}
              </span>
              <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Active Now</span>
            </div>
            <div className="space-y-3 pt-4 border-t border-slate-50">
              {filteredActive.map((event: GenericEmergencyMetric, index) => (
                <div key={index} className="flex items-center gap-2 text-[10px] font-black text-slate-600 uppercase tracking-tight">
                  <div className="w-2 h-2 rounded-full bg-[#DC2626] shadow-[0_0_8px_rgba(220,38,38,0.5)]" /> {event.name} – {event.location}
                </div>
              ))}
              {!loading && filteredActive.length === 0 && (
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest italic opacity-60">Nothing here</p>
              )}
            </div>
          </Card>

          {/* Emergencies Sent */}
          <Card className="p-6 border border-slate-200 border-l-4 border-l-[#33375D] rounded-lg shadow-sm bg-white relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-slate-900 font-bold text-lg leading-tight">Alerts</h3>
              <Radio className="text-[#33375D]" size={18} />
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-5xl font-black text-[#33375D] tracking-tighter">
                {loading ? '00' : filteredAlerts.length.toString().padStart(2, '0')}
              </span>
              <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Alerts Sent</span>
            </div>
            <div className="pt-4 border-t border-slate-50">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {filteredAlerts.length > 0 ? filteredAlerts[0].name : 'System Ready'}
              </p>
            </div>
          </Card>

          {/* Impacted Users */}
          <Card className="p-6 border border-slate-200 border-l-4 border-l-[#33375D] rounded-lg shadow-sm bg-white relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-slate-900 font-bold text-lg leading-tight">Ready2Go Users Impacted</h3>
              <Users className="text-[#F59E0B]" size={18} />
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-5xl font-black text-[#F59E0B] tracking-tighter block mb-1">
                {loading ? '00' : filteredImpacted.length.toString().padStart(2, '0')}
              </span>
              <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">People Affected</span>
            </div>
            <div className="pt-4 border-t border-slate-50">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {selectedLocation === 'All'
                  ? 'All areas'
                  : selectedSubAdmin?.state
                    ? `${String(selectedSubAdmin.state).trim()} · Managed by ${selectedLocation}`
                    : `Managed by ${selectedLocation}`}
              </p>
            </div>
          </Card>

          {/* EOC Status */}
          <Card className="p-6 border border-slate-200 border-l-4 border-l-[#33375D] rounded-lg shadow-sm bg-white relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-slate-900 font-bold text-lg leading-tight">Virtual EOC Status</h3>
              <Settings className="text-[#10B981]" size={18} />
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-black text-[#10B981] tracking-tighter">
                  {loading ? '00' : filteredEOC.length.toString().padStart(2, '0')}
                </span>
                <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Centers Open</span>
              </div>
              <Badge className={cn(
                "border-none font-bold px-3 py-1 rounded-full flex items-center gap-2 w-fit text-[9px] uppercase tracking-widest",
                (filteredEOC.length > 0 && filteredEOC[0]?.status === 'active')
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-slate-100 text-slate-500'
              )}>
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  (filteredEOC.length > 0 && filteredEOC[0]?.status === 'active') ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'
                )} />
                {loading ? '...' : (filteredEOC.length > 0 ? filteredEOC[0]?.status : 'Inactive')}
              </Badge>
            </div>
            <div className="pt-4 border-t border-slate-50">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                System tracking.
              </p>
            </div>
          </Card>
        </section>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-10">
          <div className="lg:col-span-2 space-y-8">
            <GISMap
              key={selectedLocation}
              selectedLocation={
                selectedLocation === 'All' ? 'All' : selectedSubAdmin?.name || selectedLocation
              }
              focusState={
                selectedLocation === 'All' || !selectedSubAdmin?.state
                  ? undefined
                  : String(selectedSubAdmin.state).trim() || undefined
              }
            />
          </div>

          <div className="space-y-8">
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <Target size={18} className="text-rose-500" />
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">New License Requests</h2>
                </div>
                <Link
                  href="/admin/licenses"
                  className="flex items-center gap-1.5 text-[9px] font-black text-[#33375D] uppercase tracking-widest hover:text-[#2B2F50] transition-colors group bg-[#33375D]/8 px-3 py-1.5 rounded-lg border border-[#33375D]/15"
                >
                  View All
                  <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
              </div>
              <LicenseRequestList />
            </div>

            <ThreatMonitoring
              key={selectedLocation}
              lat={selectedAdminCoords?.lat}
              lon={selectedAdminCoords?.lng}
              locationName={
                selectedLocation === 'All'
                  ? 'USA'
                  : selectedSubAdmin?.state
                    ? String(selectedSubAdmin.state).trim()
                    : selectedLocation
              }
            />
          </div>
        </div>

        {/* Responders Table Section */}
        {/* <div id="responders-section" className="space-y-6 pb-20">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#33375D]/12 rounded-xl flex items-center justify-center text-[#33375D]">
              <HardHat size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Field Force Command</h2>
          </div>
          <ResponderTable responders={responders} loading={loading} />
        </div> */}

        {/* Footer Info */}
        {/* <div className="pt-10 flex flex-col items-center justify-center gap-4 opacity-40">
          <Terminal size={24} className="text-slate-400" />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] text-center leading-relaxed">
            Ready2Go Access Center • High Security • Stable Connection
          </p>
        </div> */}
    </AdminPageShell>
  )
}
