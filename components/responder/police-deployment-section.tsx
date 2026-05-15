'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Car, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PoliceDeploymentPayload } from '@/lib/services/responder'
import { RESPONDER_PANEL_CARD, RESPONDER_STAT_CARD } from '@/components/responder/responder-panel-styles'

type Props = { compact?: boolean }

export function PoliceDeploymentSection({ compact }: Props) {
  const [data, setData] = useState<PoliceDeploymentPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/responder/police/deployment')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load')
      }
      setData(await res.json())
    } catch (e: any) {
      toast.error(e.message || 'Load failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!data) return
    setSaving(true)
    try {
      const res = await fetch('/api/responder/police/deployment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Save failed')
      }
      setData(await res.json())
      toast.success('Deployment updated (mock)')
    } catch (e: any) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center gap-2 py-20 font-medium text-slate-500 ${RESPONDER_PANEL_CARD}`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-[#33375D]" />
        Loading deployment…
      </div>
    )
  }

  if (!data) {
    return (
      <Card className={`border-amber-200 bg-amber-50/80 ${RESPONDER_PANEL_CARD}`}>
        <CardHeader>
          <CardTitle className="text-amber-900">Field deployment</CardTitle>
          <CardDescription>Unable to load data for this account vertical.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Vehicles deployed</h3>
            <Car className="text-[#33375D]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#33375D] tabular-nums">
              {data.vehiclesDeployed}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Units</span>
          </div>
        </Card>
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Personnel on duty</h3>
            <Users className="text-[#F59E0B]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#F59E0B] tabular-nums">
              {data.personnelOnDuty}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Officers</span>
          </div>
        </Card>
      </div>

      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{data.agencyName}</CardTitle>
            <CardDescription>
              Source: <span className="font-semibold uppercase">{data.source}</span> ·{' '}
              {new Date(data.updatedAt).toLocaleString()}
            </CardDescription>
          </div>
          {!compact && (
            <Button type="button" className="gap-2 rounded-xl bg-[#33375D]" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {!compact && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Agency</label>
                  <Input
                    value={data.agencyName}
                    onChange={(e) => setData({ ...data, agencyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vehicles</label>
                  <Input
                    type="number"
                    min={0}
                    value={data.vehiclesDeployed}
                    onChange={(e) =>
                      setData({ ...data, vehiclesDeployed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Personnel</label>
                  <Input
                    type="number"
                    min={0}
                    value={data.personnelOnDuty}
                    onChange={(e) =>
                      setData({ ...data, personnelOnDuty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Commander notes</label>
                <Textarea
                  rows={3}
                  value={data.commanderNotes || ''}
                  onChange={(e) => setData({ ...data, commanderNotes: e.target.value })}
                />
              </div>
            </>
          )}

          <div>
            <h4 className="text-sm font-bold mb-2">Staging areas</h4>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {data.stagingAreas.map((s, i) => (
                <div key={s.id} className="p-3 grid gap-3 sm:grid-cols-4 sm:items-center">
                  {compact ? (
                    <>
                      <div className="font-medium sm:col-span-2">{s.name}</div>
                      <div className="text-muted-foreground text-sm">{s.address}</div>
                      <div className="tabular-nums">{s.units} units</div>
                    </>
                  ) : (
                    <>
                      <Input
                        value={s.name}
                        onChange={(e) => {
                          const stagingAreas = [...data.stagingAreas]
                          stagingAreas[i] = { ...s, name: e.target.value }
                          setData({ ...data, stagingAreas })
                        }}
                      />
                      <Input
                        className="sm:col-span-2"
                        value={s.address}
                        onChange={(e) => {
                          const stagingAreas = [...data.stagingAreas]
                          stagingAreas[i] = { ...s, address: e.target.value }
                          setData({ ...data, stagingAreas })
                        }}
                      />
                      <Input
                        type="number"
                        min={0}
                        value={s.units}
                        onChange={(e) => {
                          const stagingAreas = [...data.stagingAreas]
                          stagingAreas[i] = { ...s, units: Math.max(0, Math.floor(Number(e.target.value) || 0)) }
                          setData({ ...data, stagingAreas })
                        }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold mb-2">Active beats</h4>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {data.activeBeats.map((b, i) => (
                <div key={b.id} className="p-3 grid gap-3 sm:grid-cols-2 sm:items-center">
                  {compact ? (
                    <>
                      <div className="font-medium">{b.label}</div>
                      <div className="text-sm capitalize text-muted-foreground">{b.status}</div>
                    </>
                  ) : (
                    <>
                      <Input
                        value={b.label}
                        onChange={(e) => {
                          const activeBeats = [...data.activeBeats]
                          activeBeats[i] = { ...b, label: e.target.value }
                          setData({ ...data, activeBeats })
                        }}
                      />
                      <Select
                        value={b.status}
                        onValueChange={(val: 'routine' | 'elevated' | 'critical') => {
                          const activeBeats = [...data.activeBeats]
                          activeBeats[i] = { ...b, status: val }
                          setData({ ...data, activeBeats })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="routine">Routine</SelectItem>
                          <SelectItem value="elevated">Elevated</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {compact && (
            <Button type="button" variant="outline" className="rounded-xl border-slate-200 font-bold" asChild>
              <Link href="/responder-field-status">Open full deployment editor</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
