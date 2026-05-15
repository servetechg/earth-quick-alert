'use client'

import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageShell } from '@/components/admin-page-shell'
import { PoliceDeploymentSection } from '@/components/responder/police-deployment-section'
import { ResponderInfoBar } from '@/components/responder/responder-info-bar'

export default function ResponderFieldStatusPage() {
  return (
    <AdminPageShell>
      <AdminPageHeader
        title="Field deployment"
        titleUppercase={false}
        description="HQ view: incident teams committed, operation summaries, staging areas, and active beats. Same mock store as the responder dashboard; edit rows here for the full layout."
      />
      <ResponderInfoBar>
        Incident deployment rows are headquarters-maintained in demo; wire to CAD / RMS when available.
      </ResponderInfoBar>
      <PoliceDeploymentSection />
    </AdminPageShell>
  )
}
