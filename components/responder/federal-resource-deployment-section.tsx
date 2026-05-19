'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Shield, Users, Truck, MapPin, Plus, Edit, Trash2, Loader2, Navigation } from 'lucide-react'
import { useJsApiLoader, Autocomplete, GoogleMap, MarkerF } from '@react-google-maps/api'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/constants/google-maps-config'
import type { FederalResourceDeploymentPayload, FederalStagingArea, FederalSiteStatus } from '@/lib/services/responder/types'
import { RESPONDER_PANEL_CARD, RESPONDER_STAT_CARD } from '@/components/responder/responder-panel-styles'

function actionIconButtonClass(kind: 'edit' | 'delete') {
  if (kind === 'edit')
    return 'h-9 w-9 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors'
  return 'h-9 w-9 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors'
}

export function FederalResourceDeploymentSection({ compact }: { compact?: boolean }) {
  const [data, setData] = useState<FederalResourceDeploymentPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingArea, setEditingArea] = useState<FederalStagingArea | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const [formLocation, setFormLocation] = useState('')
  const [formPersonnel, setFormPersonnel] = useState(0)
  const [formVehicles, setFormVehicles] = useState(0)
  const [formStatus, setFormStatus] = useState<FederalSiteStatus>('standby')
  const [formNotes, setFormNotes] = useState('')

  const [mapCenterMap, setMapCenterMap] = useState({ lat: 38.9072, lng: -77.0369 })
  const [markerPosition, setMarkerPosition] = useState<{ lat: number, lng: number } | null>(null)
  const [mapObj, setMapObj] = useState<google.maps.Map | null>(null)
  const [autocompleteInfo, setAutocompleteInfo] = useState<any>(null)

  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  const onPlaceLoaded = (autocomplete: any) => setAutocompleteInfo(autocomplete)

  const onPlaceChanged = () => {
    if (autocompleteInfo) {
      const place = autocompleteInfo.getPlace()
      if (!place.geometry || !place.geometry.location) return

      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()

      const newPos = { lat, lng }
      setMapCenterMap(newPos)
      setMarkerPosition(newPos)
      if (mapObj) mapObj.panTo(newPos)

      if (place.formatted_address) {
        setFormLocation(place.formatted_address)
      } else if (place.name) {
        setFormLocation(place.name)
      }
    }
  }

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          const newPos = { lat: latitude, lng: longitude }
          setMapCenterMap(newPos)
          setMarkerPosition(newPos)
          if (mapObj) mapObj.panTo(newPos)

          if (typeof google !== 'undefined') {
            const geocoder = new google.maps.Geocoder()
            geocoder.geocode({ location: newPos }, (results, status) => {
              if (status === 'OK' && results?.[0]) {
                 if (!formLocation) setFormLocation(results[0].formatted_address)
              }
            })
          }
        },
        () => {}
      )
    }
  }

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
      setMarkerPosition(null)
    } else {
      setEditingArea(null)
      setFormLocation('')
      setFormPersonnel(0)
      setFormVehicles(0)
      setFormStatus('standby')
      setFormNotes('')
      setMapCenterMap({ lat: 38.9072, lng: -77.0369 })
      setMarkerPosition(null)
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

  const confirmDelete = () => {
    if (!data || !deleteTargetId) return
    const newAreas = data.stagingAreas.filter(a => a.id !== deleteTargetId)
    const newTotal = newAreas.reduce((sum, area) => sum + area.personnelCount, 0)
    saveData({ ...data, stagingAreas: newAreas, totalPersonnelDeployed: newTotal })
    setDeleteTargetId(null)
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Standby Sites</h3>
            <Shield className="text-[#33375D]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#33375D] tabular-nums">
              {data.stagingAreas.filter(a => a.status === 'standby').length}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">In Reserve</span>
          </div>
        </Card>

        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Personnel Deployed</h3>
            <Users className="text-blue-500" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-blue-600 tabular-nums">
              {data.totalPersonnelDeployed.toLocaleString()}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Across Sites</span>
          </div>
        </Card>

        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Staging Areas</h3>
            <MapPin className="text-orange-500" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-orange-600 tabular-nums">
              {activeStagingAreas}
              <span className="ml-1 text-2xl font-black tracking-tighter text-slate-400">
                /{data.stagingAreas.length}
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Active Sites</span>
          </div>
        </Card>

        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Fleet Vehicles</h3>
            <Truck className="text-emerald-500" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-emerald-600 tabular-nums">
              {totalVehicles}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Heavy/Transport</span>
          </div>
        </Card>
      </div>

      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-0">
          <div>
          <CardTitle>{data.jurisdictionName} Staging Management</CardTitle>
            <CardDescription>
              Last update {new Date(data.updatedAt).toLocaleString()}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Staging areas</h4>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-sm border-slate-200 font-bold"
                onClick={() => handleOpenDialog()}
              >
                <Plus className="h-4 w-4" />
                Add Staging Area
              </Button>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[560px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Location
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Personnel
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Vehicles
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Notes
                    </th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.stagingAreas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                        No staging areas logged.
                      </td>
                    </tr>
                  ) : (
                    data.stagingAreas.map(area => (
                      <tr key={area.id} className="group hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-5 font-medium text-slate-900">{area.location}</td>
                        <td className="px-6 py-5">
                          <Badge variant="outline" className={`font-bold uppercase tracking-wider text-[10px] ${area.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            area.status === 'standby' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                            {area.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-5 tabular-nums text-slate-700">{area.personnelCount}</td>
                        <td className="px-6 py-5 tabular-nums text-slate-700">{area.vehicleCount}</td>
                        <td className="px-6 py-5 text-slate-600 text-sm max-w-[200px] truncate">{area.notes || '—'}</td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              title="Edit"
                              size="icon"
                              onClick={() => handleOpenDialog(area)}
                              className={actionIconButtonClass('edit')}
                            >
                              <Edit size={15} />
                            </Button>
                            <Button
                              type="button"
                              title="Delete"
                              size="icon"
                              onClick={() => setDeleteTargetId(area.id)}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent 
          className="sm:max-w-[425px]"
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.pac-container')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{editingArea ? 'Edit Staging Area' : 'Add New Staging Area'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Location / Name</Label>
                {isLoaded && (
                  <button
                    type="button"
                    onClick={handleLocateMe}
                    className="text-[10px] font-black text-white flex items-center gap-2 bg-[#33375D] hover:bg-[#44496B] px-3 py-1 rounded-lg transition-all shadow-sm active:scale-95"
                  >
                    <Navigation size={10} /> Find My Location
                  </button>
                )}
              </div>
              
              {isLoaded ? (
                <div className="space-y-3">
                  <Autocomplete onLoad={onPlaceLoaded} onPlaceChanged={onPlaceChanged}>
                    <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Search for an address or place..." />
                  </Autocomplete>
                  <div className="w-full h-40 rounded-xl overflow-hidden border border-slate-200 shadow-inner relative">
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={mapCenterMap}
                      zoom={12}
                      onLoad={(m) => setMapObj(m)}
                      onClick={(e) => {
                        if (e.latLng) {
                          const lat = e.latLng.lat()
                          const lng = e.latLng.lng()
                          setMapCenterMap({ lat, lng })
                          setMarkerPosition({ lat, lng })
                        }
                      }}
                      options={{ disableDefaultUI: true, zoomControl: true }}
                    >
                      {markerPosition && <MarkerF position={markerPosition} />}
                    </GoogleMap>
                  </div>
                </div>
              ) : (
                <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="e.g., Fairgrounds" />
              )}
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

      <AlertDialog open={deleteTargetId !== null} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent className="border-slate-200 bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black tracking-tight text-slate-900">Remove this area?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-sm leading-relaxed">
              This removes <strong className="text-slate-900">{data?.stagingAreas.find(a => a.id === deleteTargetId)?.location ?? 'this area'}</strong> from the deployment board.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
