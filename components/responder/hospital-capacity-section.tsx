'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, BedDouble, Users, CircleCheck, Stethoscope, Trash2, Edit, Download, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { HospitalCapacityPayload, HospitalUnitRow } from '@/lib/services/responder'
import { RESPONDER_PANEL_CARD, RESPONDER_STAT_CARD } from '@/components/responder/responder-panel-styles'

type Props = {
  compact?: boolean
}

export function HospitalCapacitySection({ compact }: Props) {
  const [data, setData] = useState<HospitalCapacityPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editCapacity, setEditCapacity] = useState('')
  const [editOccupied, setEditOccupied] = useState('')

  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/responder/hospital/capacity')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to load')
      }
      setData(await res.json())
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Load failed'
      toast.error(message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const persistUnits = async (units: HospitalUnitRow[]) => {
    if (!data) return false
    setSaving(true)
    try {
      const res = await fetch('/api/responder/hospital/capacity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityName: data.facilityName,
          notes: data.notes,
          units,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Save failed')
      }
      setData(await res.json())
      toast.success('Bed grid updated.')
      return true
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Save failed'
      toast.error(message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (!data) return
    await persistUnits(data.units)
  }

  const openEdit = (index: number) => {
    if (!data) return
    const u = data.units[index]
    if (!u) return
    setEditIndex(index)
    setEditName(u.name)
    setEditCapacity(String(u.capacity))
    setEditOccupied(String(u.occupied))
    setEditOpen(true)
  }

  const closeEdit = () => {
    setEditOpen(false)
    setEditIndex(null)
  }

  const saveEdit = async () => {
    if (!data || editIndex === null) return
    const name = editName.trim() || 'Unit'
    const capacity = Math.max(0, Math.floor(Number(editCapacity) || 0))
    const occupied = Math.max(0, Math.floor(Number(editOccupied) || 0))
    if (occupied > capacity) {
      toast.error('Occupied cannot exceed capacity.')
      return
    }
    let units = [...data.units]
    if (editIndex === -1) {
      units.push({
        id: `u-${Date.now()}`,
        name: name.slice(0, 120),
        capacity,
        occupied
      })
    } else {
      units = units.map((u, i) =>
        i === editIndex
          ? { ...u, name: name.slice(0, 120), capacity, occupied }
          : u,
      )
    }
    const ok = await persistUnits(units)
    if (ok) closeEdit()
  }

  const confirmDelete = async () => {
    if (!data || deleteIndex === null) return
    const units = data.units.filter((_, i) => i !== deleteIndex)
    const ok = await persistUnits(units)
    if (ok) setDeleteIndex(null)
  }

  const openAdd = () => {
    setEditIndex(-1)
    setEditName('')
    setEditCapacity('0')
    setEditOccupied('0')
    setEditOpen(true)
  }



  const editAvailable = Math.max(0, (Number(editCapacity) || 0) - (Number(editOccupied) || 0))

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center gap-2 py-20 font-medium text-slate-500 ${RESPONDER_PANEL_CARD}`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-[#33375D]" />
        Loading hospital data…
      </div>
    )
  }

  if (!data) {
    return (
      <Card className={`border-amber-200 bg-amber-50/80 ${RESPONDER_PANEL_CARD}`}>
        <CardHeader>
          <CardTitle className="text-amber-900">Hospital capacity</CardTitle>
          <CardDescription>Unable to load data for this account vertical.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const { summary } = data
  const deleteTarget = deleteIndex !== null ? data.units[deleteIndex] : null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Total beds</h3>
            <BedDouble className="text-[#33375D]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#33375D] tabular-nums">
              {summary.totalBeds}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Capacity</span>
          </div>
        </Card>
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Occupied</h3>
            <Users className="text-[#F59E0B]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#F59E0B] tabular-nums">
              {summary.occupied}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">In use</span>
          </div>
        </Card>
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Available</h3>
            <CircleCheck className="text-emerald-600" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-emerald-600 tabular-nums">
              {summary.available}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Open beds</span>
          </div>
        </Card>
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">ICU available</h3>
            <Stethoscope className="text-[#DC2626]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#DC2626] tabular-nums">
              {summary.icuAvailable}
              <span className="ml-1 text-2xl font-black tracking-tighter text-slate-400">
                /{summary.icuTotal}
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">ICU unit</span>
          </div>
        </Card>
      </div>

      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{data.facilityName}</CardTitle>
            <CardDescription>
              Last update {new Date(data.updatedAt).toLocaleString()}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="gap-2 rounded-xl" onClick={openAdd} disabled={saving}>
              <Plus className="h-4 w-4" />
              Add unit
            </Button>
            {!compact && (
              <Button type="button" className="gap-2 rounded-xl bg-[#33375D]" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!compact && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Facility name</label>
                  <Input
                    value={data.facilityName}
                    onChange={(e) => setData({ ...data, facilityName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</label>
                <Textarea
                  rows={3}
                  value={data.notes || ''}
                  onChange={(e) => setData({ ...data, notes: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="overflow-x-auto overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm max-h-[560px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Unit
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Capacity
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Occupied
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Available
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.units.map((u, i) => {
                  const available = Math.max(0, u.capacity - u.occupied)
                  return (
                    <tr key={u.id} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-5 font-medium text-slate-900">{u.name}</td>
                      <td className="px-6 py-5 tabular-nums text-slate-700">{u.capacity}</td>
                      <td className="px-6 py-5 tabular-nums text-slate-700">{u.occupied}</td>
                      <td className="px-6 py-5 tabular-nums text-muted-foreground">{available}</td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            title="Edit unit"
                            size="icon"
                            onClick={() => openEdit(i)}
                            disabled={saving}
                            className="h-9 w-9 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors"
                          >
                            <Edit size={15} />
                          </Button>
                          <Button
                            type="button"
                            title="Delete unit"
                            size="icon"
                            disabled={saving}
                            onClick={() => setDeleteIndex(i)}
                            className="h-9 w-9 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors"
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="tracking-tight font-black text-lg text-slate-900">
              {editIndex === -1 ? 'Add bed unit' : 'Edit bed unit'}
              {editIndex !== null && editIndex !== -1 && data.units[editIndex] ? ` — ${data.units[editIndex].name}` : ''}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Update capacity and census for this unit. Changes save to the responder hospital store immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Unit name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="rounded-lg border-slate-200 bg-white text-sm"
                placeholder="e.g. Med/Surg"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Capacity</label>
                <Input
                  type="number"
                  min={0}
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Occupied</label>
                <Input
                  type="number"
                  min={0}
                  value={editOccupied}
                  onChange={(e) => setEditOccupied(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm tabular-nums"
                />
              </div>
            </div>
            <p className="text-[10px] font-medium text-slate-500">
              Available (preview): <span className="tabular-nums text-slate-800">{editAvailable}</span>
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={closeEdit}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={saving}
              className="bg-[#33375D] text-white hover:bg-[#2B2F50]"
              onClick={() => void saveEdit()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteIndex !== null} onOpenChange={(o) => !o && setDeleteIndex(null)}>
        <AlertDialogContent className="border-slate-200 bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black tracking-tight text-slate-900">Remove bed unit?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-sm leading-relaxed">
              This removes <strong className="text-slate-900">{deleteTarget?.name ?? 'this unit'}</strong> from the
              bed grid. You can update counts anytime from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={saving}
              onClick={() => void confirmDelete()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
