'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, MapPin, Shield, Plus, Trash2, Edit, Users, Truck } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  NationalGuardSite,
  NationalGuardResourceDeploymentPayload,
  NationalGuardSiteStatus,
} from '@/lib/services/responder'
import { RESPONDER_PANEL_CARD, RESPONDER_STAT_CARD } from '@/components/responder/responder-panel-styles'
import { stripDemoSuffix } from '@/lib/utils/strip-demo-suffix'

type Props = { compact?: boolean }

function newId() {
  return `ng-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function actionIconButtonClass(kind: 'edit' | 'delete') {
  if (kind === 'edit')
    return 'h-9 w-9 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors'
  return 'h-9 w-9 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors'
}

function statusBadge(status: NationalGuardSiteStatus) {
  switch (status) {
    case 'active':
      return 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
    case 'limited':
      return 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    case 'suspended':
      return 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-rose-50 text-rose-700 ring-1 ring-rose-200'
  }
}

export function NationalGuardResourceDeploymentSection({ compact }: Props) {
  const [data, setData] = useState<NationalGuardResourceDeploymentPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [siteDialogOpen, setSiteDialogOpen] = useState(false)
  const [siteDialogMode, setSiteDialogMode] = useState<'create' | 'edit'>('create')
  const [siteEditIndex, setSiteEditIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  const [fName, setFName] = useState('')
  const [fAddress, setFAddress] = useState('')
  const [fLat, setFLat] = useState('')
  const [fLng, setFLng] = useState('')
  const [fPersonnel, setFPersonnel] = useState('0')
  const [fVehicles, setFVehicles] = useState('0')
  const [fStatus, setFStatus] = useState<NationalGuardSiteStatus>('active')
  const [fNotes, setFNotes] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/responder/national-guard/resource-deployment')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to load')
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

  const persist = async (next: NationalGuardResourceDeploymentPayload) => {
    setSaving(true)
    try {
      const res = await fetch('/api/responder/national-guard/resource-deployment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Save failed')
      }
      setData(await res.json())
      toast.success('National Guard deployment updated (mock)')
      return true
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Save failed'
      toast.error(message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const openCreateSite = () => {
    setFName('')
    setFAddress('')
    setFLat('40.758')
    setFLng('-111.888')
    setFPersonnel('0')
    setFVehicles('0')
    setFStatus('active')
    setFNotes('')
    setFormError('')
    setSiteDialogMode('create')
    setSiteEditIndex(null)
    setSiteDialogOpen(true)
  }

  const openEditSite = (index: number) => {
    if (!data?.sites[index]) return
    const s = data.sites[index]
    setFName(s.name)
    setFAddress(s.address)
    setFLat(String(s.lat))
    setFLng(String(s.lng))
    setFPersonnel(String(s.personnelDeployed))
    setFVehicles(String(s.vehiclesDeployed))
    setFStatus(s.status)
    setFNotes(s.notes || '')
    setFormError('')
    setSiteDialogMode('edit')
    setSiteEditIndex(index)
    setSiteDialogOpen(true)
  }

  const saveSiteDialog = async () => {
    if (!data) return
    setFormError('')
    const lat = Number(fLat)
    const lng = Number(fLng)
    const personnelDeployed = Math.max(0, Math.floor(Number(fPersonnel) || 0))
    const vehiclesDeployed = Math.max(0, Math.floor(Number(fVehicles) || 0))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setFormError('Latitude and Longitude must be valid numbers (e.g. 40.758, -111.888)')
      toast.error('Latitude and longitude must be valid numbers')
      return
    }
    const row: NationalGuardSite = {
      id:
        siteDialogMode === 'edit' && siteEditIndex !== null && data.sites[siteEditIndex]
          ? data.sites[siteEditIndex].id
          : newId(),
      name: fName.trim() || 'Staging area',
      address: fAddress.trim(),
      lat,
      lng,
      personnelDeployed,
      vehiclesDeployed,
      status: fStatus,
      notes: fNotes.trim() || undefined,
    }
    let sites: NationalGuardSite[]
    if (siteDialogMode === 'create') {
      sites = [...data.sites, row]
    } else if (siteEditIndex !== null && data.sites[siteEditIndex]) {
      sites = data.sites.map((x, i) => (i === siteEditIndex ? row : x))
    } else return

    const ok = await persist({ ...data, sites })
    if (ok) setSiteDialogOpen(false)
  }

  const confirmDelete = async () => {
    if (!data || deleteIndex === null) return
    const sites = data.sites.filter((_, i) => i !== deleteIndex)
    const ok = await persist({ ...data, sites })
    if (ok) setDeleteIndex(null)
  }

  const siteCount = data?.sites.length ?? 0
  const personnelTotal = data?.sites.reduce((s, x) => s + x.personnelDeployed, 0) ?? 0
  const vehiclesTotal = data?.sites.reduce((s, x) => s + x.vehiclesDeployed, 0) ?? 0
  const activeCount = data?.sites.filter((s) => s.status === 'active').length ?? 0

  const statCards = data
    ? ([
      {
        id: 'sites',
        title: 'Staging Areas',
        caption: 'Deployed',
        value: siteCount,
        accentClass: 'text-[#33375D]',
        Icon: Shield,
      },
      {
        id: 'personnel',
        title: 'Personnel',
        caption: 'Deployed',
        value: personnelTotal,
        accentClass: 'text-green-700',
        Icon: Users,
      },
      {
        id: 'vehicles',
        title: 'Vehicles / Equipment',
        caption: 'Deployed',
        value: vehiclesTotal,
        accentClass: 'text-blue-600',
        Icon: Truck,
      },
      {
        id: 'active',
        title: 'Active Sites',
        caption: 'Operational',
        value: activeCount,
        accentClass: 'text-emerald-600',
        Icon: MapPin,
      },
    ] as const)
    : []

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center gap-2 py-20 font-medium text-slate-500 ${RESPONDER_PANEL_CARD}`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-[#33375D]" />
        Loading National Guard deployment…
      </div>
    )
  }

  if (!data) {
    return (
      <Card className={`border-amber-200 bg-amber-50/80 ${RESPONDER_PANEL_CARD}`}>
        <CardHeader>
          <CardTitle className="text-amber-900">Resource deployment</CardTitle>
          <CardDescription>Unable to load data for this account vertical.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">National Guard — Resource Deployment</h2>
          <p className="text-sm text-slate-500 mt-1">Personnel, vehicles, and staging area management</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ id, title, caption, value, accentClass, Icon }) => (
          <Card key={id} className={RESPONDER_STAT_CARD}>
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-bold leading-tight text-slate-900">{title}</h3>
              <Icon className={accentClass} size={18} aria-hidden />
            </div>
            <div className="mb-4 flex items-baseline gap-3">
              <span className={`text-5xl font-black tracking-tighter tabular-nums ${accentClass}`}>{value}</span>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{caption}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Main panel */}
      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader className="flex flex-col gap-2 px-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{stripDemoSuffix(data.networkName)}</CardTitle>
            <CardDescription>
              Source: <span className="font-semibold uppercase">{data.source}</span> · Last update{' '}
              {new Date(data.updatedAt).toLocaleString()}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {!compact && (
              <Button
                type="button"
                className="gap-2 rounded-xl bg-[#33375D]"
                onClick={() => void persist(data)}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-8 px-0">
          {!compact && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unit name</label>
                <Input
                  value={data.networkName}
                  onChange={(e) => setData({ ...data, networkName: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Commander notes
                </label>
                <Textarea
                  rows={3}
                  value={data.coordinatorNotes || ''}
                  onChange={(e) => setData({ ...data, coordinatorNotes: e.target.value })}
                />
              </div>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Each row is a staging area or forward operating base with <strong>personnel</strong> and <strong>vehicles/equipment</strong> deployed at that location.
          </p>

          {/* Deployment table */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Deployment locations</h4>
              <Button
                type="button"
                size="sm"
                className="gap-2 rounded-sm bg-[#33375D] hover:bg-[#44496B] shadow-md font-bold"
                disabled={saving}
                onClick={openCreateSite}
              >
                <Plus className="h-4 w-4" />
                Add Detail
              </Button>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Personnel
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Vehicles
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Notes
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.sites.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        No locations yet. Click <strong>&quot;Add Detail&quot;</strong> to add a staging area.
                      </td>
                    </tr>
                  ) : (
                    data.sites.map((r, i) => (
                      <tr key={r.id} className="hover:bg-green-50/30 transition-colors">
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">{r.name}</div>
                          <div className="text-xs text-slate-500">{r.address}</div>
                          <div className="mt-1 font-mono text-[11px] text-slate-600">
                            {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                          </div>
                        </td>
                        <td className="px-4 py-4 tabular-nums font-semibold text-green-700">{r.personnelDeployed}</td>
                        <td className="px-4 py-4 tabular-nums font-semibold text-blue-700">{r.vehiclesDeployed}</td>
                        <td className="px-4 py-4">
                          <span className={statusBadge(r.status)}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-600 max-w-[200px] truncate" title={r.notes || ''}>
                          {r.notes || '—'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="icon"
                              title="Edit"
                              disabled={saving}
                              onClick={() => openEditSite(i)}
                              className={actionIconButtonClass('edit')}
                            >
                              <Edit size={15} />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              title="Delete"
                              disabled={saving}
                              onClick={() => setDeleteIndex(i)}
                              className={actionIconButtonClass('delete')}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={siteDialogOpen} onOpenChange={(o) => !o && setSiteDialogOpen(false)}>
        <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-black text-lg tracking-tight text-slate-900">
              {siteDialogMode === 'create' ? 'Add staging area' : 'Edit staging area'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Set personnel and vehicles deployed at this location; coordinates drive GIS markers.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Name</label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Address</label>
              <Input value={fAddress} onChange={(e) => setFAddress(e.target.value)} className="rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Latitude</label>
                <Input
                  value={fLat}
                  onChange={(e) => { setFLat(e.target.value); setFormError('') }}
                  placeholder="e.g. 40.758"
                  className={`rounded-lg font-mono text-sm ${formError && !Number.isFinite(Number(fLat)) ? 'border-rose-400 ring-1 ring-rose-300' : ''}`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Longitude</label>
                <Input
                  value={fLng}
                  onChange={(e) => { setFLng(e.target.value); setFormError('') }}
                  placeholder="e.g. -111.888"
                  className={`rounded-lg font-mono text-sm ${formError && !Number.isFinite(Number(fLng)) ? 'border-rose-400 ring-1 ring-rose-300' : ''}`}
                />
              </div>
            </div>
            {formError && (
              <p className="text-xs font-bold text-rose-600 -mt-1">{formError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Personnel Deployed
                </label>
                <Input
                  type="number"
                  min={0}
                  value={fPersonnel}
                  onChange={(e) => setFPersonnel(e.target.value)}
                  className="rounded-lg tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Vehicles / Equipment
                </label>
                <Input
                  type="number"
                  min={0}
                  value={fVehicles}
                  onChange={(e) => setFVehicles(e.target.value)}
                  className="rounded-lg tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</label>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v as NationalGuardSiteStatus)}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="limited">Limited</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</label>
              <Textarea rows={3} value={fNotes} onChange={(e) => setFNotes(e.target.value)} className="resize-none rounded-lg text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSiteDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-[#33375D]" disabled={saving} onClick={() => void saveSiteDialog()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={(o) => !o && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this site?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIndex !== null && data.sites[deleteIndex]
                ? `Remove "${data.sites[deleteIndex].name}" from the deployment list (mock store).`
                : 'Remove this row from the deployment list.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              className="bg-rose-600 hover:bg-rose-700"
              disabled={saving}
              onClick={() => void confirmDelete()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
