'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageShell } from '@/components/admin-page-shell'
import { HospitalCapacitySection } from '@/components/responder/hospital-capacity-section'
import { PoliceDeploymentSection } from '@/components/responder/police-deployment-section'
import { HotelAvailabilitySection } from '@/components/responder/hotel-availability-section'
import { PharmacyResourceDeploymentSection } from '@/components/responder/pharmacy-resource-deployment-section'
import { TransitResourceDeploymentSection } from '@/components/responder/transit-resource-deployment-section'
import { GeneralResponderSection } from '@/components/responder/general-responder-section'
import { ResponderInfoBar } from '@/components/responder/responder-info-bar'
import { RESPONDER_VERTICAL_LABELS, type ResponderVertical, type ResponderDashboardKind } from '@/lib/responder-verticals'
import type {
  GeneralResponderSummary,
  PharmacyResourceDeploymentPayload,
  TransitResourceDeploymentPayload,
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
  general: GeneralResponderSummary | null
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
    } catch (e: any) {
      setErr(e.message || 'Error')
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
      ? bundle.kind === 'hospital'
        ? `${vLabel}${bundle.responderFunction ? ` · ${bundle.responderFunction}` : ''}`
        : bundle.kind === 'police'
          ? `${vLabel}${bundle.responderFunction ? ` · ${bundle.responderFunction}` : ''}. Track incident teams, operations, and staging.`
          : bundle.kind === 'pharmacy'
            ? `${vLabel}${bundle.responderFunction ? ` · ${bundle.responderFunction}` : ''}. Update pop-up pharmacy sites and coordinates for GIS resource deployment (mock).`
            : bundle.kind === 'transit'
              ? `${vLabel}${bundle.responderFunction ? ` · ${bundle.responderFunction}` : ''}. Mass transit locations and vehicles deployed per site (mock).`
              : `${vLabel}${bundle.responderFunction ? ` · ${bundle.responderFunction}` : ''}. This overview uses the same layout as other admin tools; metrics are mock until external APIs are connected.`
      : 'Loading your operational summary…'

  return (
    <AdminPageShell>
      <AdminPageHeader
        title="Responder Dashboard"
        titleUppercase={false}
        description={description}
      />
      {bundle && !err && bundle.kind !== 'hospital' && bundle.kind !== 'police' && (
        <ResponderInfoBar>
          Figures below refresh from the in-app mock service on save. Connect state or agency feeds when you move past demo.
        </ResponderInfoBar>
      )}
      {bundle?.kind === 'hospital' && <HospitalCapacitySection compact />}
      {bundle?.kind === 'police' && <PoliceDeploymentSection compact />}
      {bundle?.kind === 'hotel' && <HotelAvailabilitySection compact />}
      {bundle?.kind === 'pharmacy' && <PharmacyResourceDeploymentSection compact />}
      {bundle?.kind === 'transit' && <TransitResourceDeploymentSection compact />}
      {bundle?.kind === 'general' && bundle.general && <GeneralResponderSection general={bundle.general} />}
    </AdminPageShell>
  )
}
