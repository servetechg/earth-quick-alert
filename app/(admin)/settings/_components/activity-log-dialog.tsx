'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

export type ActivityLogEntry = {
  id: string
  action: string
  label: string
  meta: Record<string, unknown>
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  'profile.update': 'Profile',
  'notification_preferences.update': 'Notifications',
  'dispatch_config.save': 'Dispatch',
  'security.settings_update': 'Security',
  'security.password_change': 'Security',
  'risk_assessment.ai_report': 'AI risk report',
  'ai.alert_message': 'AI alert',
  'alert.country_broadcast': 'Alert broadcast',
}

function yn(value: unknown): string {
  return value === true ? 'Yes' : value === false ? 'No' : '—'
}

function titleCaseRegion(region: string): string {
  const r = region.toLowerCase()
  const map: Record<string, string> = {
    western: 'Western',
    central: 'Central',
    eastern: 'Eastern',
    national: 'National',
  }
  return map[r] ?? region.charAt(0).toUpperCase() + region.slice(1)
}

function channelLabel(ch: string): string {
  const c = ch.toLowerCase()
  const map: Record<string, string> = {
    all: 'All channels',
    sms: 'SMS',
    email: 'Email',
    push: 'Push',
  }
  return map[c] ?? ch
}

const NOTIFY_LABELS: Record<string, string> = {
  majorAlerts: 'Major alerts',
  minorAlerts: 'Minor alerts',
  aiReports: 'AI risk reports',
  emailDigest: 'Daily email digest',
  smsAlerts: 'SMS alerts',
  pushAlerts: 'Push notifications',
}

function ActivityMetaDetails({ action, meta }: { action: string; meta: Record<string, unknown> }) {
  if (!meta || Object.keys(meta).length === 0) return null

  let body: ReactNode = null

  switch (action) {
    case 'login': {
      const email = typeof meta.email === 'string' ? meta.email : null
      body = email ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Account: {email}</p>
      ) : null
      break
    }
    case 'profile.update': {
      if (meta.updatedPhone === true) {
        body = (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Phone number was updated.</p>
        )
      }
      break
    }
    case 'security.settings_update':
      body = (
        <ul className="mt-2 list-none space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="text-foreground/80">Two-factor preference:</span>{' '}
            {typeof meta.twoFactorEnabled === 'boolean'
              ? meta.twoFactorEnabled
                ? 'On'
                : 'Off'
              : '—'}
          </li>
          <li>
            <span className="text-foreground/80">Session timeout (idle sign-out):</span>{' '}
            {meta.sessionTimeoutEnabled !== false ? 'On' : 'Off'}
          </li>
        </ul>
      )
      break
    case 'dispatch_config.save': {
      const region = typeof meta.region === 'string' ? meta.region : ''
      const ch = typeof meta.defaultChannel === 'string' ? meta.defaultChannel : ''
      body = (
        <ul className="mt-2 list-none space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="text-foreground/80">Region:</span> {region ? titleCaseRegion(region) : '—'}
          </li>
          <li>
            <span className="text-foreground/80">Default channel:</span>{' '}
            {ch ? channelLabel(ch) : '—'}
          </li>
          <li>
            <span className="text-foreground/80">Auto-dispatch major alerts:</span>{' '}
            {yn(meta.autoDispatchMajor)}
          </li>
        </ul>
      )
      break
    }
    case 'notification_preferences.update': {
      const preferences =
        meta.preferences && typeof meta.preferences === 'object' && meta.preferences !== null
          ? (meta.preferences as Record<string, unknown>)
          : null
      const panel =
        meta.notifyPanel && typeof meta.notifyPanel === 'object' && meta.notifyPanel !== null
          ? (meta.notifyPanel as Record<string, unknown>)
          : null
      const panelResolved = panel ?? preferences

      const channelsRaw =
        meta.channels && typeof meta.channels === 'object' && meta.channels !== null
          ? (meta.channels as Record<string, unknown>)
          : null
      const channels =
        channelsRaw ??
        (preferences
          ? {
              push: preferences.push === true,
              sms: preferences.sms === true,
              email: preferences.email === true,
            }
          : null)

      const notifyLines =
        panelResolved &&
        Object.entries(NOTIFY_LABELS)
          .map(([key, label]) => {
            const on = panelResolved[key] === true
            return (
              <li key={key}>
                <span className="text-foreground/80">{label}:</span> {on ? 'On' : 'Off'}
              </li>
            )
          })

      const deliveryParts: string[] = []
      if (channels) {
        if (channels.push === true) deliveryParts.push('Push')
        if (channels.sms === true) deliveryParts.push('SMS')
        if (channels.email === true) deliveryParts.push('Email')
      }

      body = (
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
          {deliveryParts.length > 0 ? (
            <p>
              <span className="text-foreground/80">Delivery channels:</span>{' '}
              {deliveryParts.join(' · ')}
            </p>
          ) : null}
          {notifyLines ? (
            <ul className="list-none space-y-1">{notifyLines}</ul>
          ) : null}
        </div>
      )
      if (!deliveryParts.length && !notifyLines) body = null
      break
    }
    case 'risk_assessment.ai_report':
      body = (
        <ul className="mt-2 list-none space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="text-foreground/80">Scope:</span>{' '}
            {meta.nationwide === false ? 'Regional / focused' : 'Nationwide'}
          </li>
          {typeof meta.ingestScope === 'string' ? (
            <li>
              <span className="text-foreground/80">Ingest:</span> {meta.ingestScope}
            </li>
          ) : null}
          {typeof meta.totalSignals === 'number' ? (
            <li>
              <span className="text-foreground/80">Signals processed:</span> {meta.totalSignals}
            </li>
          ) : null}
        </ul>
      )
      break
    case 'ai.alert_message':
      body =
        typeof meta.alertType === 'string' ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground/80">Alert type:</span> {meta.alertType}
          </p>
        ) : null
      break
    case 'alert.country_broadcast':
      body = (
        <ul className="mt-2 list-none space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          {typeof meta.country === 'string' ? (
            <li>
              <span className="text-foreground/80">Country:</span> {meta.country}
            </li>
          ) : null}
          {typeof meta.recipients === 'number' ? (
            <li>
              <span className="text-foreground/80">Recipients:</span> {meta.recipients}
            </li>
          ) : null}
          {typeof meta.title === 'string' ? (
            <li>
              <span className="text-foreground/80">Title:</span> {meta.title}
            </li>
          ) : null}
        </ul>
      )
      break
    default:
      body = <GenericMetaDetails meta={meta} />
  }

  return body
}

function humanizeFlatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

function formatScalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—'
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 157)}…` : value
  if (value === null || value === undefined) return '—'
  return String(value)
}

/** Fallback for unknown actions: readable lines instead of raw JSON. */
function GenericMetaDetails({ meta }: { meta: Record<string, unknown> }) {
  const entries = Object.entries(meta).filter(([_, v]) => v !== undefined && v !== null)
  if (entries.length === 0) return null

    const lines = entries.map(([key, value]) => {
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim()

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = Object.entries(value as Record<string, unknown>).filter(
        ([, v]) => v !== undefined && v !== null,
      )
      return (
        <li key={key}>
          <span className="text-foreground/80">{label}</span>
          <ul className="mt-1 list-none space-y-0.5 border-l border-border/60 pl-3">
            {nested.map(([nk, nv]) => (
              <li key={nk} className="text-muted-foreground">
                <span className="text-foreground/70">{humanizeFlatKey(nk)}:</span>{' '}
                {formatScalar(nv)}
              </li>
            ))}
          </ul>
        </li>
      )
    }

    return (
      <li key={key}>
        <span className="text-foreground/80">{label}:</span> {formatScalar(value)}
      </li>
    )
  })

  return (
    <ul className="mt-2 list-none space-y-1 text-xs leading-relaxed text-muted-foreground">{lines}</ul>
  )
}

type ActivityLogDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ActivityLogDialog({ open, onOpenChange }: ActivityLogDialogProps) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ActivityLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/user/activity-log?limit=100', { credentials: 'same-origin' })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok || !payload?.success) {
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load activity log')
        }
        if (!cancelled) setItems(Array.isArray(payload.data) ? payload.data : [])
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load activity log')
          setItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  const emptyMessage = useMemo(
    () =>
      'No activity recorded yet. Actions such as sign-in, dispatch saves, security updates, and alerts will appear here after you use those features.',
    [],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Activity log</DialogTitle>
          <DialogDescription>
            Recent actions tied to your signed-in account (most recent first).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[min(70vh,420px)] px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-[#33375D]" />
              <span>Loading…</span>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <ul className="flex flex-col gap-3 pr-2">
              {items.map((row) => {
                const badge = ACTION_LABELS[row.action] ?? row.action.replace(/\./g, ' · ')
                const metaDetails = (
                  <ActivityMetaDetails action={row.action} meta={row.meta ?? {}} />
                )
                let when = row.createdAt
                try {
                  when = new Date(row.createdAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                } catch {
                  /* keep raw */
                }

                return (
                  <li
                    key={row.id}
                    className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">
                        {badge}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{when}</span>
                    </div>
                    <p className="mt-1.5 font-medium text-foreground">{row.label}</p>
                    {metaDetails}
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
