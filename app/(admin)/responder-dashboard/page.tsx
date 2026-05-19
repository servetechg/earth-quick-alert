'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageShell } from '@/components/admin-page-shell'
import { HospitalCapacitySection } from '@/components/responder/hospital-capacity-section'
import { PoliceDeploymentSection } from '@/components/responder/police-deployment-section'
import { HotelAvailabilitySection } from '@/components/responder/hotel-availability-section'
import { PharmacyResourceDeploymentSection } from '@/components/responder/pharmacy-resource-deployment-section'
import { TransitResourceDeploymentSection } from '@/components/responder/transit-resource-deployment-section'
import { EnergyResourceDeploymentSection } from '@/components/responder/energy-resource-deployment-section'
import { GasResourceDeploymentSection } from '@/components/responder/gas-resource-deployment-section'
import { ElectricResourceDeploymentSection } from '@/components/responder/electric-resource-deployment-section'
import { WaterResourceDeploymentSection } from '@/components/responder/water-resource-deployment-section'
import { FoodLogisticsResourceDeploymentSection } from '@/components/responder/food-logistics-resource-deployment-section'
import { NationalGuardResourceDeploymentSection } from '@/components/responder/national-guard-resource-deployment-section'
import { NonprofitResourceDeploymentSection } from '@/components/responder/nonprofit-resource-deployment-section'
import { GeneralResponderSection } from '@/components/responder/general-responder-section'
import { PublicOfficialDashboardSection } from '@/components/responder/public-official-dashboard-section'
import { FederalResourceDeploymentSection } from '@/components/responder/federal-resource-deployment-section'
import { ResponderInfoBar } from '@/components/responder/responder-info-bar'
import { RESPONDER_VERTICAL_LABELS, type ResponderVertical, type ResponderDashboardKind } from '@/lib/responder-verticals'
import { stripDemoSuffix } from '@/lib/utils/strip-demo-suffix'
import type {
  GeneralResponderSummary,
  PharmacyResourceDeploymentPayload,
  TransitResourceDeploymentPayload,
  EnergyResourceDeploymentPayload,
  GasResourceDeploymentPayload,
  ElectricResourceDeploymentPayload,
  WaterResourceDeploymentPayload,
  FoodLogisticsResourceDeploymentPayload,
  NationalGuardResourceDeploymentPayload,
} from '@/lib/services/responder'

type Bundle = {
  kind: ResponderDashboardKind
  vertical: string
  responderFunction: string
  hospital: unknown
  police: unknown
  hotel: unknown
  pharmacy: PharmacyResourceDeploymentPayload | null
  transit: TransitResourceDeploymentPayload | null
  energy: EnergyResourceDeploymentPayload | null
  gas: GasResourceDeploymentPayload | null
  electric: ElectricResourceDeploymentPayload | null
  water: WaterResourceDeploymentPayload | null
  foodLogistics: FoodLogisticsResourceDeploymentPayload | null
  nationalGuard: NationalGuardResourceDeploymentPayload | null
  general: GeneralResponderSummary | null
}

function descriptionForKind(bundle: Bundle, vLabel: string): string {
  const role = stripDemoSuffix(bundle.responderFunction || '')
  const fn = role ? ` · ${role}` : ''
  switch (bundle.kind) {
    case 'hospital':
      return `${vLabel}${fn}`
    case 'police':
      return `${vLabel}${fn}. Track incident teams, operations, and staging.`
    case 'pharmacy':
      return `${vLabel}${fn}. Update pop-up pharmacy sites and coordinates for GIS resource deployment.`
    case 'transit':
      return `${vLabel}${fn}. Mass transit locations and vehicles deployed per site.`
    case 'energy':
      return `${vLabel}${fn}. Power outage areas and deployed power crews.`
    case 'gas':
      return `${vLabel}${fn}. Gas leak areas and deployed repair crews.`
    case 'electric':
      return `${vLabel}${fn}. Outage summary, vehicles deployed, and power crews.`
    case 'water':
      return `${vLabel}${fn}. Water crews and resource deployment.`
    case 'food-logistics':
      return `${vLabel}${fn}. Volunteers and distribution network.`
    case 'national-guard':
      return `${vLabel}${fn}. Personnel, vehicles, and staging areas.`
    case 'nonprofit':
      return `${vLabel}${fn}. Disaster response network, volunteers, and shelters.`
    case 'public-official':
      return `${vLabel}${fn}. Read-only executive view of emergency declarations and EOC status.`
    case 'federal':
      return `${vLabel}${fn}. Manage federal personnel deployments and staging areas.`
    case 'hotel':
      return `${vLabel}${fn}. Room availability and EM holds for lodging coordination.`
    default:
      return `${vLabel}${fn}. Shared responder links and checklist until a specialized vertical is assigned.`
  }
}

export default function ResponderDashboardPage() {
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch('/api/responder/dashboard')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to load dashboard')
      }
      setBundle(await res.json())
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error'
      setErr(message)
      setBundle(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const vLabel = bundle?.vertical
    ? RESPONDER_VERTICAL_LABELS[bundle.vertical as ResponderVertical] ?? bundle.vertical
    : ''

  const description = err
    ? `Could not load this dashboard: ${err}`
    : bundle
      ? descriptionForKind(bundle, vLabel)
      : 'Loading your operational summary…'

  return (
    <AdminPageShell>
      <AdminPageHeader
        title="Responder Dashboard"
        titleUppercase={false}
        description={description}
      />
      {bundle && !err && bundle.kind === 'hotel' && (
        <ResponderInfoBar>
          Lodging data is session-scoped until a database layer is added. Other verticals save to your account in
          MongoDB.
        </ResponderInfoBar>
      )}
      {bundle && !err && bundle.kind === 'general' && (
        <ResponderInfoBar>
          Ask your administrator to assign a specialized vertical for tailored operational tools.
        </ResponderInfoBar>
      )}
      {bundle?.kind === 'hospital' && <HospitalCapacitySection compact />}
      {bundle?.kind === 'police' && <PoliceDeploymentSection compact />}
      {bundle?.kind === 'hotel' && <HotelAvailabilitySection compact />}
      {bundle?.kind === 'pharmacy' && <PharmacyResourceDeploymentSection compact />}
      {bundle?.kind === 'transit' && <TransitResourceDeploymentSection compact />}
      {bundle?.kind === 'energy' && <EnergyResourceDeploymentSection compact />}
      {bundle?.kind === 'gas' && <GasResourceDeploymentSection compact />}
      {bundle?.kind === 'electric' && <ElectricResourceDeploymentSection compact />}
      {bundle?.kind === 'water' && <WaterResourceDeploymentSection compact />}
      {bundle?.kind === 'food-logistics' && <FoodLogisticsResourceDeploymentSection compact />}
      {bundle?.kind === 'national-guard' && <NationalGuardResourceDeploymentSection compact />}
      {bundle?.kind === 'nonprofit' && <NonprofitResourceDeploymentSection compact />}
      {bundle?.kind === 'federal' && <FederalResourceDeploymentSection compact />}
      {bundle?.kind === 'public-official' && <PublicOfficialDashboardSection />}
      {bundle?.kind === 'general' && bundle.general && <GeneralResponderSection general={bundle.general} />}
    </AdminPageShell>
  )
}
