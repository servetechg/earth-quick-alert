'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Building2,
  Shield,
  Loader2,
  MapPin,
  Search,
  Check,
  ChevronDown,
  User
} from "lucide-react"
import { toast } from "sonner"
import { GoogleMap, useJsApiLoader, Autocomplete, Circle, Marker } from '@react-google-maps/api'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/constants/google-maps-config'
import {
  LICENSE_COVERAGE_MIN_MILE,
  LICENSE_COVERAGE_STEP_MILE,
  centerFromGeocodeGeometry,
  clampLicenseRadiusMile,
  mapZoomForRadiusMiles,
  midpointRadiusLabel,
  parseRegionCodesFromGeocodeResult,
} from '@/lib/geo/license-coverage-radius'
import { cn } from '@/lib/utils'

interface ProvisionLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const mapContainerStyle = {
  width: '100%',
  height: '240px',
  borderRadius: '24px'
}

const defaultCenter = {
  lat: 40.7128,
  lng: -74.0060
}

const initialFormData = {
  organizationName: '',
  billingContact: '',
  billingAddress: '',
  billingEmail: '',
  phoneNumber: '',
  country: '',
  state: '',
  stateCode: '',
  countryCode: '',
  city: '',
  zipcode: '',
  radiusMile: LICENSE_COVERAGE_MIN_MILE,
  userId: '',
  organizationalAddress: '',
}

export function ProvisionLicenseModal({ isOpen, onClose, onSuccess }: ProvisionLicenseModalProps) {
  const [loading, setLoading] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<any[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')

  const [formData, setFormData] = useState(initialFormData)
  const [maxRadiusMile, setMaxRadiusMile] = useState<number | null>(null)
  const [hasStateCoverage, setHasStateCoverage] = useState(false)
  const [coverageLoading, setCoverageLoading] = useState(false)

  const [mapCenter, setMapCenter] = useState(defaultCenter)
  const primaryAutocompleteRef = useRef<any>(null)
  const orgAutocompleteRef = useRef<any>(null)

  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  const fetchCoverageMax = useCallback(
    async (opts: {
      stateCode?: string
      countryCode?: string
      stateName?: string
      countryName?: string
    }) => {
      if (!opts.stateCode && !opts.stateName) {
        setHasStateCoverage(false)
        setMaxRadiusMile(null)
        return
      }

      setCoverageLoading(true)
      try {
        const params = new URLSearchParams()
        if (opts.stateCode) params.set('stateCode', opts.stateCode)
        if (opts.countryCode) params.set('countryCode', opts.countryCode)
        if (opts.stateName) params.set('stateName', opts.stateName)
        if (opts.countryName) params.set('countryName', opts.countryName)

        const res = await fetch(`/api/admin/coverage-max?${params.toString()}`)
        const data = await res.json()

        if (!res.ok) {
          setHasStateCoverage(false)
          setMaxRadiusMile(null)
          toast.error(data.error || 'Could not determine state coverage limit')
          return
        }

        const max = data.maxRadiusMile as number
        setMaxRadiusMile(max)
        setHasStateCoverage(true)
        setFormData((prev) => ({
          ...prev,
          radiusMile: clampLicenseRadiusMile(prev.radiusMile, max),
        }))
      } catch {
        setHasStateCoverage(false)
        setMaxRadiusMile(null)
        toast.error('Failed to load state coverage limit')
      } finally {
        setCoverageLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!isOpen) {
      setSelectedUserId('')
      setFormData(initialFormData)
      setMapCenter(defaultCenter)
      setMaxRadiusMile(null)
      setHasStateCoverage(false)
      setCoverageLoading(false)
    }
  }, [isOpen])

  // Fetch users for the dropdown
  useEffect(() => {
    if (isOpen) {
      const fetchUsers = async () => {
        try {
          const res = await fetch('/api/admin/users')
          if (res.ok) {
            const data = await res.json()
            // Only show approved sub-admins
            setAvailableUsers(data.users.filter((u: any) => u.role === 'sub-admin' && u.accountStatus === 'approved'))
          }
        } catch (error) {
          console.error('Error fetching users:', error)
        }
      }
      fetchUsers()
    }
  }, [isOpen])

  // Update form when user is selected
  const handleUserSelect = (userId: string) => {
    const user = availableUsers.find(u => u._id === userId)
    if (user) {
      setSelectedUserId(userId)
      const address = [user.city, user.state, user.country].filter(Boolean).join(', ')
      setFormData(prev => ({
        ...prev,
        userId: user._id,
        billingContact: user.name,
        billingEmail: user.email,
        phoneNumber: user.phoneNumber || '',
        city: user.city || '',
        state: user.state || '',
        country: user.country || '',
        zipcode: user.zipcode || '',
        billingAddress: address || prev.billingAddress,
      }))
      if (address && GOOGLE_MAPS_API_KEY) {
        void fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
        )
          .then((r) => r.json())
          .then((data) => {
            const center = centerFromGeocodeGeometry(data.results?.[0]?.geometry)
            if (center) setMapCenter(center)
            const region = parseRegionCodesFromGeocodeResult(data.results?.[0] ?? {})
            setFormData((prev) => ({
              ...prev,
              stateCode: region.stateCode || prev.stateCode,
              countryCode: region.countryCode || prev.countryCode,
            }))
            void fetchCoverageMax({
              stateCode: region.stateCode || undefined,
              countryCode: region.countryCode || undefined,
              stateName: region.stateName || user.state,
              countryName: region.countryName || user.country,
            })
          })
          .catch(() => {
            if (user.state) {
              void fetchCoverageMax({
                stateName: user.state,
                countryName: user.country || undefined,
              })
            }
          })
      } else if (user.state) {
        void fetchCoverageMax({
          stateName: user.state,
          countryName: user.country || undefined,
        })
      }
    }
  }

  const onPrimaryLoad = useCallback((autocomplete: any) => {
    primaryAutocompleteRef.current = autocomplete
  }, [])

  const onOrgLoad = useCallback((autocomplete: any) => {
    orgAutocompleteRef.current = autocomplete
  }, [])

  const onPrimaryPlaceChanged = useCallback(() => {
    if (primaryAutocompleteRef.current !== null) {
      const place = primaryAutocompleteRef.current.getPlace()
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        setMapCenter({ lat, lng })

        let city = ''
        let state = ''
        let stateCode = ''
        let country = ''
        let countryCode = ''
        let zipcode = ''
        place.address_components?.forEach((c: any) => {
          if (c.types.includes('locality')) city = c.long_name
          if (c.types.includes('administrative_area_level_1')) {
            state = c.long_name
            stateCode = c.short_name
          }
          if (c.types.includes('country')) {
            country = c.long_name
            countryCode = c.short_name
          }
          if (c.types.includes('postal_code')) zipcode = c.long_name
        })

        setFormData((prev) => ({
          ...prev,
          city: city || prev.city,
          state: state || prev.state,
          stateCode: stateCode || prev.stateCode,
          country: country || prev.country,
          countryCode: countryCode || prev.countryCode,
          zipcode: zipcode || prev.zipcode,
          billingAddress: place.formatted_address || prev.billingAddress,
        }))

        void fetchCoverageMax({
          stateCode: stateCode || undefined,
          countryCode: countryCode || undefined,
          stateName: state || undefined,
          countryName: country || undefined,
        })
      }
    }
  }, [fetchCoverageMax])

  const onOrgPlaceChanged = useCallback(() => {
    if (orgAutocompleteRef.current !== null) {
      const place = orgAutocompleteRef.current.getPlace()
      if (place.formatted_address) {
        setFormData(prev => ({
          ...prev,
          organizationalAddress: place.formatted_address
        }))
      }
    }
  }, [])

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId) {
      toast.error("Please select a sub-admin")
      return
    }
    if (!hasStateCoverage || maxRadiusMile == null) {
      toast.error("Select a primary address to determine the state coverage limit")
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, isNewUser: false })
      })

      const data = await res.json()

      if (res.ok) {
        toast.success(`License successfully provisioned for ${formData.organizationName}`)
        onSuccess()
        onClose()
      } else {
        toast.error(data.error || 'Failed to provision license')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        elevated
        className="sm:max-w-[700px] rounded-3xl border-slate-200 p-0 overflow-hidden bg-white text-slate-900 max-h-[90vh] overflow-y-auto outline-none border shadow-2xl"
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target?.closest('.pac-container')) {
            e.preventDefault();
          }
        }}
      >
        <form onSubmit={handleGrant}>
          <DialogHeader className="p-8 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-500/20">
                <Shield size={24} />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-slate-900 uppercase tracking-tight">Provision Client License</DialogTitle>
                <DialogDescription className="text-slate-500 text-sm mt-1">
                  Assign a new operational license to an existing sub-admin.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className={cn("p-8 space-y-8", loading && "opacity-50 pointer-events-none")}>
            {/* Organization Info */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                <Building2 size={14} /> Organization Details
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Organization Name</Label>
                    <Input
                      required
                      value={formData.organizationName}
                      onChange={(e) => setFormData(prev => ({ ...prev, organizationName: e.target.value }))}
                      placeholder="Enter organization name"
                      className="h-12 bg-white border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 transition-all font-medium"
                    />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Organization Address</Label>
                  {isLoaded ? (
                    <Autocomplete onLoad={onOrgLoad} onPlaceChanged={onOrgPlaceChanged}>
                      <Input
                        required
                        value={formData.organizationalAddress}
                        onChange={(e) => setFormData(prev => ({ ...prev, organizationalAddress: e.target.value }))}
                        placeholder="HQ or Registered Address"
                        className="h-12 bg-white border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 transition-all font-medium"
                      />
                    </Autocomplete>
                  ) : (
                    <Input disabled className="h-12 bg-slate-50 border-slate-200 rounded-xl" placeholder="Initializing maps..." />
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Point of Contact</Label>
                  <div className="relative">
                    <Input
                      required
                      value={formData.billingContact}
                      onChange={(e) => setFormData(prev => ({ ...prev, billingContact: e.target.value }))}
                      placeholder="e.g. John Doe"
                      className="h-12 bg-white border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 transition-all font-medium pl-10"
                    />
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Phone Number</Label>
                  <div className="relative">
                    <Input
                      required
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                      placeholder="e.g. +1 (555) 000-0000"
                      className="h-12 bg-white border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 transition-all font-medium pl-10"
                    />
                    <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  </div>
                </div>

                <div className="col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Assigned Sub-Admin</Label>
                  <div className="relative">
                    <select
                      required
                      value={selectedUserId}
                      onChange={(e) => handleUserSelect(e.target.value)}
                      className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all font-medium pr-10"
                    >
                      <option value="">Select an administrator</option>
                      {availableUsers.map(user => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  </div>
                </div>

                {selectedUserId && (
                  <div className="col-span-2 bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-900 uppercase tracking-widest leading-none mb-1">Email</p>
                      <p className="text-sm font-medium text-blue-700">{formData.billingEmail}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Location & Radius */}
            <div className="space-y-4 pt-8 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                <MapPin size={14} /> Service Area
              </h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Primary Address</Label>
                  {isLoaded ? (
                    <Autocomplete onLoad={onPrimaryLoad} onPlaceChanged={onPrimaryPlaceChanged}>
                      <Input
                        required
                        value={formData.billingAddress}
                        onChange={(e) => setFormData(prev => ({ ...prev, billingAddress: e.target.value }))}
                        placeholder="Operations center or target location"
                        className="h-12 bg-white border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 transition-all font-medium"
                      />
                    </Autocomplete>
                  ) : (
                    <Input disabled className="h-12 bg-slate-50 border-slate-200 rounded-xl" placeholder="Initializing maps..." />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-6">
                    <div className="flex justify-between items-center gap-2">
                      <Label className="text-sm font-medium text-slate-700">Coverage Radius</Label>
                      <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full shrink-0 flex items-center gap-1.5">
                        {coverageLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {hasStateCoverage && maxRadiusMile != null
                          ? `${formData.radiusMile} / ${maxRadiusMile} Mi`
                          : `${formData.radiusMile} Mi`}
                      </span>
                    </div>
                    {!hasStateCoverage && !coverageLoading && (
                      <p className="text-xs text-slate-500">
                        Select a primary address — max radius is computed from that state&apos;s bounding box.
                      </p>
                    )}
                    {hasStateCoverage && maxRadiusMile != null && formData.state && (
                      <p className="text-xs text-slate-500">
                        Approx. max for {formData.state}: {maxRadiusMile} mi (center of state bounds to farthest corner).
                      </p>
                    )}
                    <input
                      type="range"
                      min={LICENSE_COVERAGE_MIN_MILE}
                      max={maxRadiusMile ?? LICENSE_COVERAGE_MIN_MILE}
                      step={LICENSE_COVERAGE_STEP_MILE}
                      value={formData.radiusMile}
                      disabled={!hasStateCoverage || maxRadiusMile == null || coverageLoading}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          radiusMile: clampLicenseRadiusMile(
                            parseInt(e.target.value, 10),
                            maxRadiusMile ?? prev.radiusMile
                          ),
                        }))
                      }
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                      <span>{LICENSE_COVERAGE_MIN_MILE} Mi</span>
                      {hasStateCoverage && maxRadiusMile != null ? (
                        <>
                          <span>{midpointRadiusLabel(LICENSE_COVERAGE_MIN_MILE, maxRadiusMile)} Mi</span>
                          <span>{maxRadiusMile} Mi</span>
                        </>
                      ) : (
                        <span className="text-slate-300">Max —</span>
                      )}
                    </div>
                  </div>

                  {isLoaded && (
                    <div className="h-40 rounded-3xl overflow-hidden border border-slate-200 shadow-sm shadow-blue-500/5">
                      <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={mapCenter}
                        zoom={mapZoomForRadiusMiles(formData.radiusMile)}
                        options={{
                          disableDefaultUI: true,
                          zoomControl: false,
                          styles: [
                            { featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'on' }] }
                          ]
                        }}
                      >
                        <Marker position={mapCenter} />
                        <Circle
                          center={mapCenter}
                          radius={formData.radiusMile * 1609.34}
                          options={{
                            fillOpacity: 0.1,
                            strokeOpacity: 0.4,
                            fillColor: '#3b82f6',
                            strokeColor: '#3b82f6',
                            strokeWeight: 1
                          }}
                        />
                      </GoogleMap>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-8 bg-slate-50/50 border-t border-slate-100 gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="h-12 px-6 font-bold text-slate-500 hover:text-slate-900 transition-colors uppercase text-xs tracking-widest"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-12 px-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black transition-all shadow-lg active:scale-[0.98] uppercase text-xs tracking-widest"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                  Processing...
                </>
              ) : (
                "Finalize License"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
