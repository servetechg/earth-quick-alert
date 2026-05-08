'use client'

import React, { useState, useEffect } from 'react'
import { DashboardStats } from '@/components/dashboard-stats'
import { GISMap } from '@/components/gis-map'
import { CommunicationsCenter } from '@/components/communications-center'
import { QuickActionButtons } from '@/components/quick-action-buttons'
import { SendCommunityAlertModal } from '@/components/modals/send-community-alert-modal'
import { ActiveEmergencyEventsModal } from '@/components/modals/active-emergency-events-modal'
import { ThreatMonitoring } from '@/components/threat-monitoring'
import { VirtualEOCOperations } from '@/components/virtual-eoc-operations'
import { PreparednessTasks } from '@/components/preparedness-tasks'
import { FirstResponderTools } from '@/components/first-responder-tools'
import { SetupWizard } from '@/components/setup-wizard'
import { Shield, Activity, Radio, Command, Terminal, Cpu } from 'lucide-react'

export default function Dashboard() {
  const [showSendAlertModal, setShowSendAlertModal] = useState(false)
  const [showEventsModal, setShowEventsModal] = useState(false)

  // Setup Status Logic
  const [checkingSetup, setCheckingSetup] = useState(true)
  const [requiresSetup, setRequiresSetup] = useState(false)
  const [isOrphan, setIsOrphan] = useState(false)
  const [licenseData, setLicenseData] = useState({ id: '', orgName: '' })

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const res = await fetch('/api/admin/eoc-setup-status')
      const data = await res.json()

      if (data.requiresSetup) {
        setRequiresSetup(true)
        if (data.orphan) {
          setIsOrphan(true)
        } else {
          setLicenseData({ id: data.licenseId, orgName: data.organizationName })
        }
      }
    } catch (err) {
      console.error("Setup Check Failed", err)
    } finally {
      setCheckingSetup(false)
    }
  }

  if (checkingSetup) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Cpu className="w-12 h-12 text-[#33375D] animate-spin" />
          <div className="text-[#33375D] font-black text-xs uppercase tracking-[0.5em] animate-pulse">Initializing Command Terminal...</div>
        </div>
      </div>
    )
  }

  if (requiresSetup && !isOrphan) {
    return (
      <div className="flex-1 relative bg-white">
        <SetupWizard
          licenseId={licenseData.id}
          organizationName={licenseData.orgName}
          onComplete={() => setRequiresSetup(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50 selection:bg-[#33375D]/15">
      <main className="p-10 space-y-12 max-w-[1800px] mx-auto relative">
        {/* Decorative elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-[#33375D]/10 blur-[120px] rounded-full pointer-events-none" />

        {/* Dashboard Header */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-10 border-b border-slate-200">
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-[#33375D] rounded-[28px] flex items-center justify-center shadow-2xl shadow-[#33375D]/25 group hover:scale-110 transition-transform cursor-pointer">
                <Command size={32} className="text-white group-hover:rotate-90 transition-transform duration-500" />
              </div>
              <div className="space-y-1">
                <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase leading-none">Emergency Operations Dashboard</h1>
                <div className="flex items-center gap-4">
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Operational Node Alpha-9</p>
                  <div className="h-1 w-1 rounded-full bg-slate-700" />
                  <div className="text-[#33375D] text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#33375D] animate-pulse" />
                    Live System Link
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-6 py-3 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 group hover:bg-slate-50 transition-colors cursor-pointer shadow-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-900 transition-colors">Global Connectivity Active</span>
            </div>
          </div>
        </div>

        {/* Tactical Alert Grid */}
        <section className="space-y-8 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-1 bg-[#33375D] rounded-full shadow-[0_0_10px_rgba(51,55,93,0.45)]" />
            <h2 className="text-[12px] font-black text-slate-500 uppercase tracking-[0.4em]">Tactical Alert Matrix</h2>
          </div>
          <DashboardStats />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10">
          {/* Main Map Area */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <div className="w-10 h-1 bg-[#33375D] rounded-full" />
                <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-3">
                  <Radio size={14} className="text-[#33375D]" /> GIS Strategic Map
                </h2>
              </div>
              <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest italic">Live Multi-Vector Overlay</span>
            </div>
            <GISMap />
          </div>

          {/* Side Threat Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="flex items-center gap-4 px-2">
              <div className="w-10 h-1 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-3">
                <Shield size={14} className="text-amber-500" /> Signal Monitoring
              </h2>
            </div>
            <ThreatMonitoring />
          </div>

          {/* Operational Tools Grid */}
          <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-10 pt-6">
            <FirstResponderTools />
            <VirtualEOCOperations />
          </div>

          {/* Task Management */}
          <div className="lg:col-span-12 space-y-8 pt-6">
            <div className="flex items-center gap-4 px-2">
              <div className="w-12 h-1 bg-emerald-500 rounded-full" />
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em]">Post-Event & Recovery Logic</h2>
            </div>
            <PreparednessTasks />
          </div>

          {/* Quick Command Interface */}
          <div className="lg:col-span-12 pt-6">
            <QuickActionButtons
              onSendAlert={() => setShowSendAlertModal(true)}
              onOpenEvents={() => setShowEventsModal(true)}
            />
          </div>
        </div>

        {/* Footer Info */}
        <div className="pt-20 pb-10 flex flex-col items-center justify-center gap-4 opacity-30 group">
          <Terminal size={24} className="text-slate-500 group-hover:text-[#33375D] transition-colors" />
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.5em] text-center max-w-[600px] leading-relaxed">
            Official Operational Monitoring Platform • Security Level 4 • All Session Activities Are Logged Under Readiness Resilience Protocol v4.0.01
          </p>
        </div>
      </main>

      <SendCommunityAlertModal isOpen={showSendAlertModal} onClose={() => setShowSendAlertModal(false)} />
      <ActiveEmergencyEventsModal isOpen={showEventsModal} onClose={() => setShowEventsModal(false)} />
    </div>
  )
}
