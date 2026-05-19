'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Shield, Users, Truck, MapPin, Plus, Edit } from 'lucide-react'
import type { FederalResourceDeploymentPayload, FederalStagingArea, FederalSiteStatus } from '@/lib/services/responder/types'

export function FederalResourceDeploymentSection({ compact }: { compact?: boolean }) {
  const [data, setData] = useState<FederalResourceDeploymentPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingArea, setEditingArea] = useState<FederalStagingArea | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const [formLocation, setFormLocation] = useState('')
  const [formPersonnel, setFormPersonnel] = useState(0)
  const [formVehicles, setFormVehicles] = useState(0)
  const [formStatus, setFormStatus] = useState<FederalSiteStatus>('standby')
  const [formNotes, setFormNotes] = useState('')

  const loadData = async () => {
    try {
      const res = await fetch('/api/responder/federal/resource-deployment')
      if (res.ok) {
        setData(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const saveData = async (updatedData: FederalResourceDeploymentPayload) => {
    try {
      const res = await fetch('/api/responder/federal/resource-deployment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      })
      if (res.ok) {
        setData(await res.json())
        setIsDialogOpen(false)
      }
    } catch (e) {
      console.error('Failed to save data', e)
    }
  }

  const handleOpenDialog = (area?: FederalStagingArea) => {
    if (area) {
      setEditingArea(area)
      setFormLocation(area.location)
      setFormPersonnel(area.personnelCount)
      setFormVehicles(area.vehicleCount)
      setFormStatus(area.status)
      setFormNotes(area.notes || '')
    } else {
      setEditingArea(null)
      setFormLocation('')
      setFormPersonnel(0)
      setFormVehicles(0)
      setFormStatus('standby')
      setFormNotes('')
    }
    setIsDialogOpen(true)
  }

  const handleSaveArea = () => {
    if (!data) return
    let newAreas = [...data.stagingAreas]

    if (editingArea) {
      newAreas = newAreas.map((a) =>
        a.id === editingArea.id
          ? { ...a, location: formLocation, personnelCount: formPersonnel, vehicleCount: formVehicles, status: formStatus, notes: formNotes }
          : a
      )
    } else {
      newAreas.push({
        id: `fed-${Date.now()}`,
        location: formLocation,
        personnelCount: formPersonnel,
        vehicleCount: formVehicles,
        status: formStatus,
        notes: formNotes,
      })
    }

    const newTotal = newAreas.reduce((sum, area) => sum + area.personnelCount, 0)
    saveData({ ...data, stagingAreas: newAreas, totalPersonnelDeployed: newTotal })
  }

  if (loading) return <div className="p-8 animate-pulse text-slate-500">Loading federal resource deployment...</div>
  if (!data) return <div className="p-8 text-red-500">Failed to load data.</div>

  const activeStagingAreas = data.stagingAreas.filter(a => a.status === 'active').length
  const totalVehicles = data.stagingAreas.reduce((sum, a) => sum + a.vehicleCount, 0)

  return (
    <div className={`space-y-6 ${compact ? '' : 'p-6'}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Federal Staging & Resources</h2>
          <p className="text-sm text-slate-500 font-medium">Manage deployment of federal personnel and assets</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center justify-between">
              Jurisdiction
              <Shield className="w-4 h-4 text-slate-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-black text-slate-900 tracking-tighter line-clamp-1 mt-2">
              {data.jurisdictionName}
            </div>
            <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-wider">OVERSIGHT REGION</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center justify-between">
              Personnel Deployed
              <Users className="w-4 h-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-blue-600 tracking-tighter">
              {data.totalPersonnelDeployed.toLocaleString()}
            </div>
            <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">ACROSS ALL SITES</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center justify-between">
              Staging Areas
              <MapPin className="w-4 h-4 text-orange-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-orange-600 tracking-tighter">
              {activeStagingAreas} <span className="text-xl text-slate-400">/ {data.stagingAreas.length}</span>
            </div>
            <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">ACTIVE SITES</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center justify-between">
              Fleet Vehicles
              <Truck className="w-4 h-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-emerald-600 tracking-tighter">
              {totalVehicles}
            </div>
            <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">HEAVY EQUIPMENT & TRANSPORT</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-800">Staging Area Management</CardTitle>
              <p className="text-sm text-slate-500 font-medium">Source: {data.source.toUpperCase()} · Last updated {new Date(data.updatedAt).toLocaleString()}</p>
            </div>
            <Button onClick={() => handleOpenDialog()} className="bg-[#FFD75E] text-[#33375D] hover:bg-[#FFD75E]/90 font-bold gap-2">
              <Plus className="w-4 h-4" />
              Add Detail
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            <div className="p-6 space-y-4">
              {data.stagingAreas.map(area => (
                <div key={area.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-bold text-slate-900 text-lg">{area.location}</h4>
                      <Badge variant="outline" className={`font-bold uppercase tracking-wider text-[10px] ${
                        area.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                        area.status === 'standby' ? 'bg-orange-50 text-orange-700 border-orange-200' : 
                        'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {area.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-medium text-slate-500 mt-2">
                      <span className="flex items-center gap-1"><Users className="w-4 h-4 text-blue-500" /> {area.personnelCount} Personnel</span>
                      <span className="flex items-center gap-1"><Truck className="w-4 h-4 text-emerald-500" /> {area.vehicleCount} Vehicles</span>
                    </div>
                    {area.notes && (
                      <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-2 rounded-md">{area.notes}</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleOpenDialog(area)} className="font-bold gap-2">
                    <Edit className="w-4 h-4" /> Edit
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingArea ? 'Edit Staging Area' : 'Add New Staging Area'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Location / Name</Label>
              <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="e.g., Fairgrounds" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Personnel Count</Label>
                <Input type="number" value={formPersonnel} onChange={(e) => setFormPersonnel(parseInt(e.target.value) || 0)} />
              </div>
              <div className="grid gap-2">
                <Label>Vehicle Count</Label>
                <Input type="number" value={formVehicles} onChange={(e) => setFormVehicles(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={(v: FederalSiteStatus) => setFormStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="standby">Standby</SelectItem>
                  <SelectItem value="demobilized">Demobilized</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional operations notes" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveArea} className="bg-[#33375D] hover:bg-[#33375D]/90 text-white font-bold">Save Area</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
