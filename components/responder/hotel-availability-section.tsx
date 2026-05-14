'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Building2, Users, BookmarkMinus, DoorOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { HotelAvailabilityPayload } from '@/lib/services/responder'
import { RESPONDER_PANEL_CARD, RESPONDER_STAT_CARD } from '@/components/responder/responder-panel-styles'

type Props = { compact?: boolean }

export function HotelAvailabilitySection({ compact }: Props) {
  const [data, setData] = useState<HotelAvailabilityPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/responder/hotel/availability')
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
      const res = await fetch('/api/responder/hotel/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Save failed')
      }
      setData(await res.json())
      toast.success('Lodging updated (mock)')
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
        Loading lodging…
      </div>
    )
  }

  if (!data) {
    return (
      <Card className={`border-amber-200 bg-amber-50/80 ${RESPONDER_PANEL_CARD}`}>
        <CardHeader>
          <CardTitle className="text-amber-900">Lodging availability</CardTitle>
          <CardDescription>Unable to load data for this account vertical.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const open =
    data.roomsTotal - data.roomsOccupied - data.roomsHeldForEm > 0
      ? data.roomsTotal - data.roomsOccupied - data.roomsHeldForEm
      : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Total rooms</h3>
            <Building2 className="text-[#33375D]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#33375D] tabular-nums">
              {data.roomsTotal}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Inventory</span>
          </div>
        </Card>
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Occupied</h3>
            <Users className="text-[#F59E0B]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#F59E0B] tabular-nums">
              {data.roomsOccupied}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Guests</span>
          </div>
        </Card>
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Held for EM</h3>
            <BookmarkMinus className="text-[#DC2626]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#DC2626] tabular-nums">
              {data.roomsHeldForEm}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">EM hold</span>
          </div>
        </Card>
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Open inventory</h3>
            <DoorOpen className="text-emerald-600" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-emerald-600 tabular-nums">{open}</span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Available</span>
          </div>
        </Card>
      </div>

      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{data.propertyName}</CardTitle>
            <CardDescription>
              ADA-flex rooms available: <span className="font-semibold">{data.adaRoomsAvailable}</span> ·{' '}
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
        <CardContent className="space-y-4">
          {!compact && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Property</label>
                  <Input
                    value={data.propertyName}
                    onChange={(e) => setData({ ...data, propertyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total rooms</label>
                  <Input
                    type="number"
                    min={0}
                    value={data.roomsTotal}
                    onChange={(e) =>
                      setData({ ...data, roomsTotal: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Occupied</label>
                  <Input
                    type="number"
                    min={0}
                    value={data.roomsOccupied}
                    onChange={(e) =>
                      setData({ ...data, roomsOccupied: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Held for EM</label>
                  <Input
                    type="number"
                    min={0}
                    value={data.roomsHeldForEm}
                    onChange={(e) =>
                      setData({ ...data, roomsHeldForEm: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ADA available</label>
                  <Input
                    type="number"
                    min={0}
                    value={data.adaRoomsAvailable}
                    onChange={(e) =>
                      setData({ ...data, adaRoomsAvailable: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Check-in / liaison notes</label>
                <Textarea
                  rows={3}
                  value={data.checkInNotes || ''}
                  onChange={(e) => setData({ ...data, checkInNotes: e.target.value })}
                />
              </div>
            </>
          )}
          {compact && (
            <Button type="button" variant="outline" className="rounded-xl border-slate-200 font-bold" asChild>
              <Link href="/responder-lodging-status">Open full lodging editor</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
