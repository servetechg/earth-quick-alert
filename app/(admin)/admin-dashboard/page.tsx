'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { SetupWizard } from '@/components/setup-wizard'
import { AdminPageLoader } from '@/components/admin-page-loader'
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
  DashboardSnapshotExport,
} from '@/components/admin-dashboard'
import { useUser } from '@/lib/store/user-store'
import type { RiskReport } from '@/lib/types/risk-assessment'
import {
  buildIncidentOverviewFromReport,
  buildRiskAnalyzeRequestBody,
  getRiskAnalyzeContextFromBrowser,
  mapOverallRiskToGaugeLabel,
} from '@/lib/risk-assessment/client-analyze-context'

const DASHBOARD_RISK_CACHE_KEY = 'admin-dashboard-risk-snapshot-v1'
const DASHBOARD_RISK_CACHE_MS = 3 * 60 * 1000

export default function Dashboard() {
  const { me } = useUser()
  const [checkingSetup, setCheckingSetup] = useState(true)
  const [requiresSetup, setRequiresSetup] = useState(false)
  const [isOrphan, setIsOrphan] = useState(false)
  const [licenseData, setLicenseData] = useState({ id: '', orgName: '' })
  const [gisSelectedLocation, setGisSelectedLocation] = useState<string>('All')
  const [gisFocusState, setGisFocusState] = useState<string | undefined>(undefined)

  const [riskLoading, setRiskLoading] = useState(true)
  const [riskReport, setRiskReport] = useState<RiskReport | null>(null)
  const [riskIngestMeta, setRiskIngestMeta] = useState<{
    ingestScope?: string
    stateCd?: string
  } | null>(null)

  const riskCtx = useMemo(() => getRiskAnalyzeContextFromBrowser(me), [me?.role, me?.state])

  const loadLiveRiskSnapshot = useCallback(async () => {
    setRiskLoading(true)
    try {
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem(DASHBOARD_RISK_CACHE_KEY)
        if (raw) {
          try {
            const { t, report, ingest } = JSON.parse(raw) as {
              t: number
              report: RiskReport
              ingest?: { ingestScope?: string; stateCd?: string }
            }
            if (Number.isFinite(t) && Date.now() - t < DASHBOARD_RISK_CACHE_MS && report) {
              setRiskReport(report)
              setRiskIngestMeta(ingest ?? null)
              setRiskLoading(false)
              return
            }
          } catch {
            /* ignore bad cache */
          }
        }
      }

      const body = buildRiskAnalyzeRequestBody(riskCtx, { recordActivity: false })
      const res = await fetch('/api/risk-assessment/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.report) {
        setRiskReport(null)
        setRiskIngestMeta(null)
        return
      }
      const report = data.report as RiskReport
      const ingest = data.ingest as { ingestScope?: string; stateCd?: string } | undefined
      setRiskReport(report)
      setRiskIngestMeta(ingest ?? null)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          DASHBOARD_RISK_CACHE_KEY,
          JSON.stringify({ t: Date.now(), report, ingest }),
        )
      }
    } catch {
      setRiskReport(null)
      setRiskIngestMeta(null)
    } finally {
      setRiskLoading(false)
    }
  }, [riskCtx])

  useEffect(() => {
    if (checkingSetup) return
    if (requiresSetup && !isOrphan) return
    void loadLiveRiskSnapshot()
  }, [checkingSetup, requiresSetup, isOrphan, loadLiveRiskSnapshot])

  useEffect(() => {
    checkSetupStatus()
  }, [])

  useEffect(() => {
    const role = (
      me?.role ||
      (typeof window !== 'undefined' ? localStorage.getItem('userRole') : null) ||
      ''
    )
      .toString()
      .toLowerCase()

    if (role !== 'sub-admin') {
      setGisSelectedLocation('All')
      setGisFocusState(undefined)
      return
    }

    const name = (me?.name || (typeof window !== 'undefined' ? localStorage.getItem('userName') : null) || '')
      .toString()
      .trim()
    const st = (me?.state || (typeof window !== 'undefined' ? localStorage.getItem('userState') : null) || '')
      .toString()
      .trim()

    setGisSelectedLocation(name || 'All')
    setGisFocusState(st || undefined)
  }, [me?.role, me?.name, me?.state])

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
    return <AdminPageLoader />
  }

  const incidentLive = riskReport
    ? buildIncidentOverviewFromReport(riskReport, {
        ingestScope: riskIngestMeta?.ingestScope,
        stateCd: riskIngestMeta?.stateCd,
      })
    : null

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
      <div className="flex justify-end dashboard-export-ignore">
        <DashboardSnapshotExport
          subAdminRecipientPicker
          snapshotTitle="Sub-Admin Situational Dashboard"
          summaryLine={
            incidentLive?.description
              ? incidentLive.description
              : gisFocusState
                ? `Coverage: ${gisFocusState}`
                : undefined
          }
        />
      </div>

      <div id="dashboard-export-root" className="space-y-4 w-full">
      <div className="flex flex-col xl:flex-row gap-4 items-stretch">
        {/* Main left section */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Top 4 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            <IncidentOverviewCard loading={false} />
            <AIRiskPredictionCard
              loading={false}
              score={riskReport?.ai_confidence}
              riskLabel={
                riskReport ? mapOverallRiskToGaugeLabel(riskReport.overall_risk_level) : undefined
              }
            />
            <KeyImpactsCard />
            <IncidentTimelineCard />
          </div>

          {/* Live Situational Map — same Google Map as super-admin, with Map Layers overlay */}
          <GISMap
            title="Live Situational Map"
            showLayersPanel
            showDisasterZones
            showCriticalInfraLayers
            stateScoped
            visibleTabs={['Citizens', 'Responders']}
            selectedLocation={gisSelectedLocation}
            focusState={gisFocusState}
            scopeState={gisFocusState}
          />
        </div>

        {/* Right column — fixed compact width on xl+ screens */}
        <div className="flex flex-col gap-4 xl:w-[220px] xl:shrink-0">
          <RealTimeResourcesPanel />
          <CitizenActivityFeed />
        </div>
      </div>

      {/* Bottom 4 cards — spans the full dashboard width (under both columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <ShelterStatusCard />
        <HospitalCapacityCard />
        <PowerOutageSummaryCard />
        <ResourceDeploymentCard />
      </div>
      </div>
    </AdminPageShell>
  )
}
