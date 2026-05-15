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
        description="Staging, beats, and deployment counts for law enforcement and related staging roles. Mock data for demo."
      />
      <ResponderInfoBar>
        Deployment numbers are illustrative; replace with CAD / mutual-aid feeds in production.
      </ResponderInfoBar>
      <PoliceDeploymentSection />
    </AdminPageShell>
  )
}
