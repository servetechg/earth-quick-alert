'use client'

import React, { useState, useEffect } from 'react'
import { Cpu } from 'lucide-react'
import { SetupWizard } from '@/components/setup-wizard'
import { AdminPageShell } from '@/components/admin-page-shell'
import { GISMap } from '@/components/gis-map'
import {
  IncidentOverviewCard,
  AIRiskPredictionCard,
  KeyImpactsCard,
  IncidentTimelineCard,
  RealTimeResourcesPanel,
  CitizenActivityFeed,
  ShelterStatusCard,
  HospitalCapacityCard,
  PowerOutageSummaryCard,
  ResourceDeploymentCard,
} from '@/components/admin-dashboard'

export default function Dashboard() {
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
      console.error('Setup Check Failed', err)
    } finally {
      setCheckingSetup(false)
    }
  }

  if (checkingSetup) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Cpu className="w-12 h-12 text-[#33375D] animate-spin" />
          <div className="text-[#33375D] font-black text-xs uppercase tracking-[0.5em] animate-pulse">
            Initializing Command Terminal...
          </div>
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
    <AdminPageShell className="bg-slate-100/50" innerClassName="space-y-4">
      <div className="flex flex-col xl:flex-row gap-4 items-stretch">
        {/* Main left section */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Top 4 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            <IncidentOverviewCard />
            <AIRiskPredictionCard />
            <KeyImpactsCard />
            <IncidentTimelineCard />
          </div>

          {/* Live Situational Map — same Google Map as super-admin, with Map Layers overlay */}
          <GISMap title="Live Situational Map" hideTabs showLayersPanel />

          {/* Bottom 4 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <ShelterStatusCard />
            <HospitalCapacityCard />
            <PowerOutageSummaryCard />
            <ResourceDeploymentCard />
          </div>
        </div>

        {/* Right column — fixed compact width on xl+ screens */}
        <div className="flex flex-col gap-4 xl:w-[220px] xl:shrink-0">
          <RealTimeResourcesPanel />
          <CitizenActivityFeed />
        </div>
      </div>
    </AdminPageShell>
  )
}
