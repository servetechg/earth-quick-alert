'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { GeneralResponderSummary } from '@/lib/services/responder'
import { RESPONDER_PANEL_CARD } from '@/components/responder/responder-panel-styles'

export function GeneralResponderSection({ general }: { general: GeneralResponderSummary }) {
  return (
    <div className="space-y-6">
      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader>
          <CardTitle>{general.title}</CardTitle>
          <CardDescription>{general.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-bold mb-2">Quick checklist</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {general.checklist.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className="font-mono text-xs">{c.done ? '☑' : '☐'}</span>
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-2">Jump links</h4>
            <div className="flex flex-wrap gap-2">
              {general.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm font-semibold text-[#33375D] underline-offset-4 hover:underline"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
