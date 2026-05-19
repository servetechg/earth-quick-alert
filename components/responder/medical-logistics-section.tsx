'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, MapPin, Truck, Box, GitBranch, ShieldPlus, Plus, Trash2, Edit, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { useJsApiLoader, Autocomplete, GoogleMap, MarkerF } from '@react-google-maps/api'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/constants/google-maps-config'
import type {
  MedicalLogisticsSite,
  MedicalLogisticsResourceDeploymentPayload,
  MedicalLogisticsSiteStatus,
  MedicalLogisticsAssetType,
} from '@/lib/services/responder'
import { RESPONDER_PANEL_CARD, RESPONDER_STAT_CARD } from '@/components/responder/responder-panel-styles'

type Props = { compact?: boolean }

function newId() {
  return `med-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function actionIconButtonClass(kind: 'edit' | 'delete') {
  if (kind === 'edit')
    return 'h-9 w-9 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors'
  return 'h-9 w-9 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors'
}

function getAssetIcon(type: MedicalLogisticsAssetType) {
  switch (type) {
    case 'ambulance':
      return <Truck size={16} />
    case 'warehouse':
      return <Box size={16} />
    case 'supply-route':
      return <GitBranch size={16} />
    case 'resource':
      return <ShieldPlus size={16} />
  }
}

export function MedicalLogisticsSection({ compact }: Props) {
  const [data, setData] = useState<MedicalLogisticsResourceDeploymentPayload | null>(null)
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
  const [fType, setFType] = useState<MedicalLogisticsAssetType>('ambulance')
  const [fStatus, setFStatus] = useState<MedicalLogisticsSiteStatus>('active')
  const [fUnits, setFUnits] = useState('1')
  const [fNotes, setFNotes] = useState('')

  const [mapCenterMap, setMapCenterMap] = useState({ lat: 34.7465, lng: -92.2896 })
  const [markerPosition, setMarkerPosition] = useState<{ lat: number, lng: number } | null>(null)
  const [mapObj, setMapObj] = useState<google.maps.Map | null>(null)
  const [autocompleteInfo, setAutocompleteInfo] = useState<any>(null)

  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  const onPlaceLoaded = (autocomplete: any) => {
    setAutocompleteInfo(autocomplete)
  }

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
      setFLat(lat.toString())
      setFLng(lng.toString())

      if (!fAddress && place.formatted_address) {
        setFAddress(place.formatted_address)
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
          setFLat(latitude.toString())
          setFLng(longitude.toString())

          if (typeof google !== 'undefined') {
            const geocoder = new google.maps.Geocoder()
            geocoder.geocode({ location: newPos }, (results, status) => {
              if (status === 'OK' && results?.[0]) {
                 if (!fAddress) setFAddress(results[0].formatted_address)
              }
            })
          }
        },
        () => {
          toast.error('Unable to retrieve location. Please check browser permissions.')
        }
      )
    } else {
      toast.error('Geolocation is not supported by your browser.')
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/responder/medical-logistics/resource-deployment')
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

  const persist = async (next: MedicalLogisticsResourceDeploymentPayload) => {
    setSaving(true)
    try {
      const res = await fetch('/api/responder/medical-logistics/resource-deployment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Save failed')
      }
      setData(await res.json())
      toast.success('Medical logistics updated.')
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
    setFLat('34.7465')
    setFLng('-92.2896')
    setFType('ambulance')
    setFStatus('active')
    setFUnits('1')
    setFNotes('')
    setSiteDialogMode('create')
    setSiteEditIndex(null)
    setMapCenterMap({ lat: 34.7465, lng: -92.2896 })
    setMarkerPosition(null)
    setSiteDialogOpen(true)
  }

  const openEditSite = (index: number) => {
    if (!data?.sites[index]) return
    const s = data.sites[index]
    setFName(s.name)
    setFAddress(s.address)
    setFLat(String(s.lat))
    setFLng(String(s.lng))
    setFType(s.type)
    setFStatus(s.status)
    setFUnits(String(s.units))
    setFNotes(s.notes || '')
    setSiteDialogMode('edit')
    setSiteEditIndex(index)

    const pos = { lat: s.lat, lng: s.lng }
    setMapCenterMap(pos)
    setMarkerPosition(pos)

    setSiteDialogOpen(true)
  }

  const saveSiteDialog = async () => {
    if (!data) return
    const lat = Number(fLat)
    const lng = Number(fLng)
    const units = Number(fUnits) || 0
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('Latitude and longitude must be valid numbers')
      return
    }
    const row: MedicalLogisticsSite = {
      id: siteDialogMode === 'edit' && siteEditIndex !== null && data.sites[siteEditIndex]
        ? data.sites[siteEditIndex].id
        : newId(),
      name: fName.trim() || 'Medical Asset',
      address: fAddress.trim(),
      lat,
      lng,
      type: fType,
      status: fStatus,
      units,
      notes: fNotes.trim() || undefined,
    }
    let sites: MedicalLogisticsSite[]
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

  const mapCenter = useMemo(() => {
    if (!data?.sites.length) return { lat: 40.7608, lng: -111.891 }
    let lat = 0
    let lng = 0
    for (const s of data.sites) {
      lat += s.lat
      lng += s.lng
    }
    return { lat: lat / data.sites.length, lng: lng / data.sites.length }
  }, [data])

  const totalSites = data?.sites.length ?? 0
  const ambulanceCount = data?.sites.filter((s) => s.type === 'ambulance').length ?? 0
  const routeCount = data?.sites.filter((s) => s.type === 'supply-route').length ?? 0
  const warehouseCount = data?.sites.filter((s) => s.type === 'warehouse').length ?? 0

  const statCards = data
    ? ([
        {
          id: 'sites',
          title: 'Total Deployments',
          caption: 'Tracked Assets',
          value: totalSites,
          accentClass: 'text-[#33375D]',
          Icon: ShieldPlus,
        },
        {
          id: 'ambulance',
          title: 'Ambulances',
          caption: 'Active Units',
          value: ambulanceCount,
          accentClass: 'text-rose-600',
          Icon: Truck,
        },
        {
          id: 'routes',
          title: 'Supply Routes',
          caption: 'Monitored',
          value: routeCount,
          accentClass: 'text-amber-500',
          Icon: GitBranch,
        },
        {
          id: 'warehouses',
          title: 'Medical Warehouses',
          caption: 'Stockpiles',
          value: warehouseCount,
          accentClass: 'text-blue-600',
          Icon: Box,
        },
      ] as const)
    : []

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center gap-2 py-20 font-medium text-slate-500 ${RESPONDER_PANEL_CARD}`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-[#33375D]" />
        Loading medical logistics data…
      </div>
    )
  }

  if (!data) {
    return (
      <Card className={`border-rose-200 bg-rose-50/80 ${RESPONDER_PANEL_CARD}`}>
        <CardHeader>
          <CardTitle className="text-rose-900">Resource deployment</CardTitle>
          <CardDescription>Unable to load data for this account vertical.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const mapHeight = compact ? 'min-h-[220px] h-[240px]' : 'min-h-[320px] h-[420px]'

  return (
    <div className="space-y-6">
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

      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader className="flex flex-col gap-2 px-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{data.networkName}</CardTitle>
            <CardDescription>
              Last update{' '}
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
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Network name</label>
                <Input
                  value={data.networkName}
                  onChange={(e) => setData({ ...data, networkName: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Coordinator notes
                </label>
                <Textarea
                  rows={3}
                  value={data.coordinatorNotes || ''}
                  onChange={(e) => setData({ ...data, coordinatorNotes: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className={`grid gap-6 ${compact ? '' : 'lg:grid-cols-2'}`}>
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Deployed Resources</h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-sm border-slate-200 font-bold"
                  disabled={saving}
                  onClick={openCreateSite}
                >
                  <Plus className="h-4 w-4" />
                  Add asset
                </Button>
              </div>
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Asset
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Type & Units
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.sites.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                          No resources deployed yet.
                        </td>
                      </tr>
                    ) : (
                      data.sites.map((r, i) => (
                        <tr key={r.id} className="hover:bg-blue-50/30">
                          <td className="px-4 py-4 align-top">
                            <div className="font-semibold text-slate-900">{r.name}</div>
                            <div className="text-xs text-slate-500">{r.address}</div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex items-center gap-2 font-medium text-slate-700 capitalize">
                              {getAssetIcon(r.type)} {r.type.replace('-', ' ')}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">{r.units} units</div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant="outline" className={`font-bold uppercase tracking-wider text-[10px] ${
                              r.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                              r.status === 'limited' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {r.status}
                            </Badge>
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
            {!compact && (
                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">GIS Command Map</h4>
                  {isLoaded ? (
                    <div className={`w-full ${mapHeight} overflow-hidden rounded-xl border border-slate-200 shadow-inner`}>
                      <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={mapCenter}
                        zoom={11}
                        options={{
                          disableDefaultUI: true,
                          zoomControl: true,
                          styles: [
                            { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#33375D' }] },
                            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#E2E8F0' }] },
                          ],
                        }}
                      >
                        {data.sites.map((s) => (
                          <MarkerF
                            key={s.id}
                            position={{ lat: s.lat, lng: s.lng }}
                            title={`${s.name} (${s.type})`}
                            icon={s.type === 'ambulance' ? 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' : s.type === 'warehouse' ? 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' : s.type === 'supply-route' ? 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png' : undefined}
                          />
                        ))}
                      </GoogleMap>
                    </div>
                  ) : (
                    <div className={`flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 shadow-inner ${mapHeight}`}>
                      <Loader2 className="h-8 w-8 animate-spin text-[#33375D]" />
                    </div>
                  )}
                </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={siteDialogOpen} onOpenChange={(o) => !o && setSiteDialogOpen(false)}>
        <DialogContent 
          className="border-slate-200 bg-white text-slate-900 sm:max-w-xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.pac-container')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-black text-lg tracking-tight text-slate-900">
              {siteDialogMode === 'create' ? 'Add Asset' : 'Edit Asset'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update medical logistics locations and deployment status.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Name</label>
                <Input value={fName} onChange={(e) => setFName(e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Asset Type</label>
                <Select value={fType} onValueChange={(v) => setFType(v as MedicalLogisticsAssetType)}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambulance">Ambulance</SelectItem>
                    <SelectItem value="warehouse">Medical Warehouse</SelectItem>
                    <SelectItem value="supply-route">Supply Route</SelectItem>
                    <SelectItem value="resource">Deploy Resource</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoaded && (
              <div className="space-y-4 mb-2 pb-6 border-b border-slate-100">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={12} /> Location
                  </label>
                  <button
                    type="button"
                    onClick={handleLocateMe}
                    className="text-[10px] font-black text-white flex items-center gap-2 bg-[#33375D] hover:bg-[#44496B] px-3 py-1.5 rounded-lg transition-all shadow-sm active:scale-95"
                  >
                    <Navigation size={10} /> Find My Location
                  </button>
                </div>
                <Autocomplete onLoad={onPlaceLoaded} onPlaceChanged={onPlaceChanged}>
                  <input
                    type="text"
                    placeholder="Search for an address..."
                    className="w-full px-4 py-3 bg-white border border-slate-200 shadow-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[#33375D]/10 focus:border-[#33375D] transition-all text-sm placeholder:text-slate-400"
                  />
                </Autocomplete>

                {/* Interactive Map */}
                <div className="w-full h-48 rounded-xl overflow-hidden border border-slate-200 shadow-inner relative group">
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
                        setFLat(lat.toString())
                        setFLng(lng.toString())
                      }
                    }}
                    options={{
                      disableDefaultUI: true,
                      zoomControl: true,
                      styles: [
                        { "featureType": "all", "elementType": "labels.text.fill", "stylers": [{ "color": "#33375D" }] },
                        { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#E2E8F0" }] }
                      ]
                    }}
                  >
                    {markerPosition && <MarkerF position={markerPosition} />}
                  </GoogleMap>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</label>
                <Select value={fStatus} onValueChange={(v) => setFStatus(v as MedicalLogisticsSiteStatus)}>
                    <SelectTrigger className="rounded-lg">
                    <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="active">Active / Clear</SelectItem>
                    <SelectItem value="limited">Limited / En Route</SelectItem>
                    <SelectItem value="suspended">Suspended / Blocked</SelectItem>
                    </SelectContent>
                </Select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Units / Quantity</label>
                    <Input type="number" value={fUnits} onChange={(e) => setFUnits(e.target.value)} className="rounded-lg" />
                </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</label>
              <Textarea rows={3} value={fNotes} onChange={(e) => setFNotes(e.target.value)} className="rounded-lg resize-none text-sm" />
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

      <AlertDialog open={deleteIndex !== null} onOpenChange={(o) => !o && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIndex !== null && data.sites[deleteIndex]
                ? `Remove “${data.sites[deleteIndex].name}” from the deployment list.`
                : 'Remove this row from the deployment list.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="button" className="bg-rose-600 hover:bg-rose-700" disabled={saving} onClick={() => void confirmDelete()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
