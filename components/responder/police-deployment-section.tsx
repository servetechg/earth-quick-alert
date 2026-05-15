'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Save,
  MapPin,
  Layers,
  Shield,
  ListTodo,
  Trash2,
  Edit,
  Plus,
} from 'lucide-react'
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
import type {
  PoliceDeploymentPayload,
  PoliceIncidentOperation,
  PoliceStagingArea,
} from '@/lib/services/responder'
import { RESPONDER_PANEL_CARD, RESPONDER_STAT_CARD } from '@/components/responder/responder-panel-styles'

type Props = { compact?: boolean }

type RowKind = 'incident' | 'staging'

type RowDialog = {
  kind: RowKind
  mode: 'create' | 'edit'
  index: number | null
}

type DeleteCtx = { kind: RowKind; index: number }

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function actionIconButtonClass(kind: 'download' | 'edit' | 'delete') {
  if (kind === 'download')
    return 'h-9 w-9 bg-[#33375D]/10 text-[#33375D] hover:bg-[#33375D] hover:text-white rounded-lg transition-colors'
  if (kind === 'edit')
    return 'h-9 w-9 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors'
  return 'h-9 w-9 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors'
}

export function PoliceDeploymentSection({ compact }: Props) {
  const [data, setData] = useState<PoliceDeploymentPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [rowDialog, setRowDialog] = useState<RowDialog | null>(null)
  const [deleteCtx, setDeleteCtx] = useState<DeleteCtx | null>(null)

  const [incName, setIncName] = useState('')
  const [incTeams, setIncTeams] = useState('')
  const [incSummary, setIncSummary] = useState('')

  const [stName, setStName] = useState('')
  const [stAddress, setStAddress] = useState('')
  const [stUnits, setStUnits] = useState('')

  const [agencyDialogOpen, setAgencyDialogOpen] = useState(false)
  const [agDraftName, setAgDraftName] = useState('')
  const [agDraftVehicles, setAgDraftVehicles] = useState('')
  const [agDraftPersonnel, setAgDraftPersonnel] = useState('')
  const [agDraftNotes, setAgDraftNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/responder/police/deployment')
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

  const persist = async (next: PoliceDeploymentPayload) => {
    setSaving(true)
    try {
      const res = await fetch('/api/responder/police/deployment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Save failed')
      }
      setData(await res.json())
      toast.success('Deployment updated (mock persistence)')
      return true
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Save failed'
      toast.error(message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveAgencyForm = async () => {
    if (!data) return
    await persist(data)
  }

  const openAgencyDialog = () => {
    if (!data) return
    setAgDraftName(data.agencyName)
    setAgDraftVehicles(String(data.vehiclesDeployed))
    setAgDraftPersonnel(String(data.personnelOnDuty))
    setAgDraftNotes(data.commanderNotes || '')
    setAgencyDialogOpen(true)
  }

  const saveAgencyDialog = async () => {
    if (!data) return
    const ok = await persist({
      ...data,
      agencyName: (agDraftName.trim() || data.agencyName).slice(0, 200),
      vehiclesDeployed: Math.max(0, Math.floor(Number(agDraftVehicles) || 0)),
      personnelOnDuty: Math.max(0, Math.floor(Number(agDraftPersonnel) || 0)),
      commanderNotes: agDraftNotes.slice(0, 2000),
    })
    if (ok) setAgencyDialogOpen(false)
  }

  const openCreate = (kind: RowKind) => {
    setIncName('')
    setIncTeams('1')
    setIncSummary('')
    setStName('')
    setStAddress('')
    setStUnits('0')
    setRowDialog({ kind, mode: 'create', index: null })
  }

  const openEdit = (kind: RowKind, index: number) => {
    if (!data) return
    if (kind === 'incident') {
      const r = data.incidentOperations[index]
      if (!r) return
      setIncName(r.incidentName)
      setIncTeams(String(r.teamsDeployed))
      setIncSummary(r.operationSummary)
    } else if (kind === 'staging') {
      const r = data.stagingAreas[index]
      if (!r) return
      setStName(r.name)
      setStAddress(r.address)
      setStUnits(String(r.units))
    }
    setRowDialog({ kind, mode: 'edit', index })
  }

  const closeRowDialog = () => setRowDialog(null)

  const saveRowDialog = async () => {
    if (!data || !rowDialog) return
    const { kind, mode, index } = rowDialog

    if (kind === 'incident') {
      const teams = Math.max(0, Math.floor(Number(incTeams) || 0))
      const name = incName.trim() || 'Incident'
      const summary = incSummary.trim()
      let incidentOperations: PoliceIncidentOperation[]
      if (mode === 'create') {
        incidentOperations = [
          ...data.incidentOperations,
          { id: newId('io'), incidentName: name.slice(0, 200), teamsDeployed: teams, operationSummary: summary },
        ]
      } else if (index !== null && data.incidentOperations[index]) {
        const cur = data.incidentOperations[index]
        incidentOperations = data.incidentOperations.map((o, i) =>
          i === index ? { ...cur, incidentName: name.slice(0, 200), teamsDeployed: teams, operationSummary: summary } : o,
        )
      } else return
      const ok = await persist({ ...data, incidentOperations })
      if (ok) closeRowDialog()
      return
    }

    if (kind === 'staging') {
      const units = Math.max(0, Math.floor(Number(stUnits) || 0))
      const name = stName.trim() || 'Staging'
      const address = stAddress.trim()
      let stagingAreas: PoliceStagingArea[]
      if (mode === 'create') {
        stagingAreas = [
          ...data.stagingAreas,
          { id: newId('st'), name: name.slice(0, 120), address: address.slice(0, 200), units },
        ]
      } else if (index !== null && data.stagingAreas[index]) {
        const cur = data.stagingAreas[index]
        stagingAreas = data.stagingAreas.map((s, i) =>
          i === index ? { ...cur, name: name.slice(0, 120), address: address.slice(0, 200), units } : s,
        )
      } else return
      const ok = await persist({ ...data, stagingAreas })
      if (ok) closeRowDialog()
      return
    }
  }

  const confirmDelete = async () => {
    if (!data || !deleteCtx) return
    const { kind, index } = deleteCtx
    let next = { ...data }
    if (kind === 'incident') {
      next = { ...data, incidentOperations: data.incidentOperations.filter((_, i) => i !== index) }
    } else if (kind === 'staging') {
      next = { ...data, stagingAreas: data.stagingAreas.filter((_, i) => i !== index) }
    }
    const ok = await persist(next)
    if (ok) setDeleteCtx(null)
  }


  const deleteLabel = () => {
    if (!data || !deleteCtx) return ''
    if (deleteCtx.kind === 'incident') return data.incidentOperations[deleteCtx.index]?.incidentName ?? 'this row'
    return data.stagingAreas[deleteCtx.index]?.name ?? 'this row'
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

  const teamsOnIncidents = data.incidentOperations.reduce((s, o) => s + o.teamsDeployed, 0)
  const incidentCount = data.incidentOperations.length
  const stagingUnitsTotal = data.stagingAreas.reduce((s, a) => s + a.units, 0)
  const stagingAreaCount = data.stagingAreas.length

  const deploymentStatCards = [
    {
      id: 'teams-incidents',
      title: 'Teams on incidents',
      caption: 'Committed',
      value: teamsOnIncidents,
      accentClass: 'text-emerald-600',
      Icon: Shield,
    },
    {
      id: 'incident-ops',
      title: 'Incident deployments',
      caption: 'Tracked',
      value: incidentCount,
      accentClass: 'text-[#DC2626]',
      Icon: ListTodo,
    },
    {
      id: 'staging-units',
      title: 'Units at staging',
      caption: 'Summed',
      value: stagingUnitsTotal,
      accentClass: 'text-[#33375D]',
      Icon: Layers,
    },
    {
      id: 'staging-sites',
      title: 'Staging areas',
      caption: 'Listed',
      value: stagingAreaCount,
      accentClass: 'text-[#F59E0B]',
      Icon: MapPin,
    },
  ] as const

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {deploymentStatCards.map(({ id, title, caption, value, accentClass, Icon }) => (
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

      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader className="px-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{data.agencyName}</CardTitle>
            <CardDescription>
              Source: <span className="font-semibold uppercase">{data.source}</span> · Last update{' '}
              {new Date(data.updatedAt).toLocaleString()}
            </CardDescription>
          </div>
          {!compact && (
            <Button type="button" className="gap-2 rounded-xl bg-[#33375D]" onClick={() => void saveAgencyForm()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          )}
          {compact && (
            <Button
              type="button"
              variant="outline"
              className="gap-2 rounded-sm border-slate-200 font-bold text-slate-800"
              onClick={openAgencyDialog}
            >
              Edit Agency & Fleet Totals
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-8 px-0">
          {!compact && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Agency</label>
                  <Input value={data.agencyName} onChange={(e) => setData({ ...data, agencyName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vehicles (fleet)</label>
                  <Input
                    type="number"
                    min={0}
                    value={data.vehiclesDeployed}
                    onChange={(e) =>
                      setData({ ...data, vehiclesDeployed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Personnel on duty</label>
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

          {/* Incident operations — HQ primary table */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Incident deployments</h4>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-sm border-slate-200 font-bold"
                disabled={saving}
                onClick={() => openCreate('incident')}
              >
                <Plus className="h-4 w-4" />
                Add Incident Deployment 
              </Button>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[560px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Incident
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Teams deployed
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[200px]">
                      Operation
                    </th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.incidentOperations.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                        No incident deployments logged. Use &quot;Add incident deployment&quot; to record teams sent to an
                        incident and the operation in progress.
                      </td>
                    </tr>
                  ) : (
                    data.incidentOperations.map((r, i) => (
                      <tr key={r.id} className="group hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-5 font-medium text-slate-900">{r.incidentName}</td>
                        <td className="px-6 py-5 tabular-nums text-slate-700">{r.teamsDeployed}</td>
                        <td className="px-6 py-5 text-slate-600 text-sm leading-snug max-w-md">{r.operationSummary}</td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              title="Edit"
                              size="icon"
                              disabled={saving}
                              onClick={() => openEdit('incident', i)}
                              className={actionIconButtonClass('edit')}
                            >
                              <Edit size={15} />
                            </Button>
                            <Button
                              type="button"
                              title="Delete"
                              size="icon"
                              disabled={saving}
                              onClick={() => setDeleteCtx({ kind: 'incident', index: i })}
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

          {/* Staging */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Staging areas</h4>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-sm border-slate-200 font-bold"
                disabled={saving}
                onClick={() => openCreate('staging')}
              >
                <Plus className="h-4 w-4" />
                Add Staging Area
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Address
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Units
                    </th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.stagingAreas.map((r, i) => (
                    <tr key={r.id} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-5 font-medium text-slate-900">{r.name}</td>
                      <td className="px-6 py-5 text-slate-600 text-sm">{r.address}</td>
                      <td className="px-6 py-5 tabular-nums text-slate-700">{r.units}</td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            title="Edit"
                            size="icon"
                            disabled={saving}
                            onClick={() => openEdit('staging', i)}
                            className={actionIconButtonClass('edit')}
                          >
                            <Edit size={15} />
                          </Button>
                          <Button
                            type="button"
                            title="Delete"
                            size="icon"
                            disabled={saving}
                            onClick={() => setDeleteCtx({ kind: 'staging', index: i })}
                            className={actionIconButtonClass('delete')}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </CardContent>
      </Card>

      <Dialog open={agencyDialogOpen} onOpenChange={(o) => !o && setAgencyDialogOpen(false)}>
        <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="tracking-tight font-black text-lg text-slate-900">Agency &amp; fleet totals</DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Update agency name, fleet-wide counts, and commander notes. Saves immediately to the mock store.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Agency name</label>
              <Input
                value={agDraftName}
                onChange={(e) => setAgDraftName(e.target.value)}
                className="rounded-lg border-slate-200 bg-white text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vehicles deployed</label>
                <Input
                  type="number"
                  min={0}
                  value={agDraftVehicles}
                  onChange={(e) => setAgDraftVehicles(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Personnel on duty</label>
                <Input
                  type="number"
                  min={0}
                  value={agDraftPersonnel}
                  onChange={(e) => setAgDraftPersonnel(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Commander notes</label>
              <Textarea
                rows={3}
                value={agDraftNotes}
                onChange={(e) => setAgDraftNotes(e.target.value)}
                className="rounded-lg border-slate-200 bg-white text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => setAgencyDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={saving}
              className="bg-[#33375D] text-white hover:bg-[#2B2F50]"
              onClick={() => void saveAgencyDialog()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rowDialog)} onOpenChange={(o) => !o && closeRowDialog()}>
        <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="tracking-tight font-black text-lg text-slate-900">
              {rowDialog?.kind === 'incident' &&
                (rowDialog.mode === 'create' ? 'Add incident deployment' : 'Edit incident deployment')}
              {rowDialog?.kind === 'staging' &&
                (rowDialog.mode === 'create' ? 'Add staging area' : 'Edit staging area')}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Headquarters can update deployment records. Changes save to the mock responder store immediately.
            </DialogDescription>
          </DialogHeader>
          {rowDialog?.kind === 'incident' && (
            <div className="grid gap-4 py-1">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Incident name</label>
                <Input
                  value={incName}
                  onChange={(e) => setIncName(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm"
                  placeholder="e.g. MVA — Hwy 30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Teams deployed (count)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={incTeams}
                  onChange={(e) => setIncTeams(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Operation summary
                </label>
                <Textarea
                  rows={4}
                  value={incSummary}
                  onChange={(e) => setIncSummary(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm resize-none"
                  placeholder="What the department is doing on scene (perimeter, traffic, mutual aid, etc.)"
                />
              </div>
            </div>
          )}
          {rowDialog?.kind === 'staging' && (
            <div className="grid gap-4 py-1">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Name</label>
                <Input
                  value={stName}
                  onChange={(e) => setStName(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Address</label>
                <Input
                  value={stAddress}
                  onChange={(e) => setStAddress(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Units</label>
                <Input
                  type="number"
                  min={0}
                  value={stUnits}
                  onChange={(e) => setStUnits(e.target.value)}
                  className="rounded-lg border-slate-200 bg-white text-sm tabular-nums"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={closeRowDialog}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={saving || !rowDialog}
              className="bg-[#33375D] text-white hover:bg-[#2B2F50]"
              onClick={() => void saveRowDialog()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteCtx)} onOpenChange={(o) => !o && setDeleteCtx(null)}>
        <AlertDialogContent className="border-slate-200 bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black tracking-tight text-slate-900">Remove this row?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-sm leading-relaxed">
              This removes <strong className="text-slate-900">{deleteLabel()}</strong> from the deployment board (mock
              store).
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
