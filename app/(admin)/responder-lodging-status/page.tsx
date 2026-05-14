'use client'

import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageShell } from '@/components/admin-page-shell'
import { HotelAvailabilitySection } from '@/components/responder/hotel-availability-section'
import { ResponderInfoBar } from '@/components/responder/responder-info-bar'

export default function ResponderLodgingStatusPage() {
  return (
    <AdminPageShell>
      <AdminPageHeader
        title="Lodging availability"
        titleUppercase={false}
        description="Shelter and hotel room posture for EOC coordination. Mock data for demo."
      />
      <ResponderInfoBar>
        Room counts are mock; integrate with PMS or shelter registry APIs when available.
      </ResponderInfoBar>
      <HotelAvailabilitySection />
    </AdminPageShell>
  )
}
