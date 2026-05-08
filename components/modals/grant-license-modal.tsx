'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  Mail,
  Phone,
  User,
  Globe,
  Navigation,
  Search,
  Check,
  UserPlus
} from "lucide-react"
import { toast } from "sonner"
import { GoogleMap, useJsApiLoader, Autocomplete, Circle, Marker } from '@react-google-maps/api'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/constants/google-maps-config'
import { cn } from '@/lib/utils'

interface GrantLicenseModalProps {
  user: {
    _id: string;
    name: string;
    email: string;
    city?: string;
    state?: string;
    country?: string;
    zipcode?: string;
  } | null;
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

export function GrantLicenseModal({ user, isOpen, onClose, onSuccess }: GrantLicenseModalProps) {
  const [loading, setLoading] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<any[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [isNewUser, setIsNewUser] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    organizationName: '',
    billingContact: user?.name || '',
    billingAddress: '',
    billingEmail: user?.email || '',
    phoneNumber: '',
    country: user?.country || '',
    state: user?.state || '',
    city: user?.city || '',
    zipcode: user?.zipcode || '',
    radiusMile: 5,
    userId: user?._id || '',
    organizationalAddress: '',
  })

  const [mapCenter, setMapCenter] = useState(defaultCenter)
  const primaryAutocompleteRef = useRef<any>(null)
  const orgAutocompleteRef = useRef<any>(null)

  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  // Fetch users for the dropdown
  useEffect(() => {
    if (isOpen && user) {
      const fullAddress = [user.city, user.state, user.country].filter(Boolean).join(', ')
      setFormData(prev => ({
        ...prev,
        billingContact: user.name,
        billingEmail: user.email,
        userId: user._id,
        city: user.city || '',
        state: user.state || '',
        country: user.country || '',
        zipcode: user.zipcode || '',
        billingAddress: fullAddress || prev.billingAddress,
      }))

      if (fullAddress) {
        // Attempt to update map center if address exists
        const geocode = async () => {
          try {
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}`)
            const data = await res.json()
            if (data.results?.[0]?.geometry?.location) {
              setMapCenter(data.results[0].geometry.location)
            }
          } catch (e) { }
        }
        geocode()
      }
    }
  }, [isOpen, user])

  const onPrimaryLoad = useCallback((autocomplete: any) => {
    primaryAutocompleteRef.current = autocomplete
  }, [])

  const onOrgLoad = useCallback((autocomplete: any) => {
    orgAutocompleteRef.current = autocomplete
  }, [])

  const onPrimaryPlaceChanged = useCallback(() => {
    if (primaryAutocompleteRef.current !== null) {
      const place = primaryAutocompleteRef.current.getPlace()
      if (place.geometry) {
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        setMapCenter({ lat, lng })

        let city = '', state = '', country = '', zipcode = ''
        place.address_components?.forEach((c: any) => {
          if (c.types.includes('locality')) city = c.long_name
          if (c.types.includes('administrative_area_level_1')) state = c.long_name
          if (c.types.includes('country')) country = c.long_name
          if (c.types.includes('postal_code')) zipcode = c.long_name
        })

        setFormData(prev => ({
          ...prev,
          city: city || prev.city,
          state: state || prev.state,
          country: country || prev.country,
          zipcode: zipcode || prev.zipcode,
          billingAddress: place.formatted_address || prev.billingAddress
        }))
      }
    }
  }, [])

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
    setLoading(true)
    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
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
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#33375D] text-white shadow-xl shadow-[#33375D]/25">
                <Shield size={24} />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-slate-900">Provision Client License</DialogTitle>
                <DialogDescription className="text-slate-500 text-sm mt-1">
                  Enter the organization details and define their service coverage area.
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Organization Name</Label>
                  <Input
                    required
                    value={formData.organizationName}
                    onChange={(e) => setFormData(prev => ({ ...prev, organizationName: e.target.value }))}
                    placeholder="e.g. California State, Miami City, or SoFi Stadium"
                    className="h-11 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Organization Address</Label>
                  {isLoaded ? (
                    <Autocomplete onLoad={onOrgLoad} onPlaceChanged={onOrgPlaceChanged}>
                      <Input
                        required
                        value={formData.organizationalAddress}
                        onChange={(e) => setFormData(prev => ({ ...prev, organizationalAddress: e.target.value }))}
                        placeholder="HQ or Registered Address"
                        className="h-11 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                      />
                    </Autocomplete>
                  ) : (
                    <Input disabled className="h-11 bg-slate-50 border-slate-200 rounded-lg" placeholder="Initializing maps..." />
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Point of Contact</Label>
                  <Input
                    required
                    value={formData.billingContact}
                    onChange={(e) => setFormData(prev => ({ ...prev, billingContact: e.target.value }))}
                    placeholder="Full name of representative"
                    className="h-11 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Email</Label>
                  <Input
                    required
                    type="email"
                    value={formData.billingEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, billingEmail: e.target.value }))}
                    placeholder="email@organization.com"
                    className="h-11 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1">Phone Number</Label>
                  <Input
                    required
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    placeholder="+1 (555) 000-0000"
                    className="h-11 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Service Area */}
            <div className="space-y-4 pt-8 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                <MapPin size={14} /> Service Area
              </h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 ml-1 font-bold">Primary Address</Label>
                  {isLoaded ? (
                    <Autocomplete onLoad={onPrimaryLoad} onPlaceChanged={onPrimaryPlaceChanged}>
                      <Input
                        required
                        value={formData.billingAddress}
                        onChange={(e) => setFormData(prev => ({ ...prev, billingAddress: e.target.value }))}
                        placeholder="Operations center or target location"
                        className="h-11 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 transition-all font-medium border-blue-100 shadow-sm"
                      />
                    </Autocomplete>
                  ) : (
                    <Input disabled className="h-11 bg-slate-50 border-slate-200 rounded-lg" placeholder="Initializing maps..." />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-medium text-slate-700">Coverage Radius</Label>
                      <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{formData.radiusMile} Miles</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="5"
                      value={formData.radiusMile}
                      onChange={(e) => setFormData({ ...formData, radiusMile: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                      <span>5 Miles</span>
                      <span>50 Miles</span>
                      <span>100 Miles</span>
                    </div>
                  </div>

                  {isLoaded && (
                    <div className="h-40 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                      <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={mapCenter}
                        zoom={10}
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
              className="h-11 px-6 font-medium text-slate-500 hover:text-slate-900 transition-colors uppercase text-xs tracking-widest"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-11 rounded-xl bg-[#33375D] px-8 font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-[#2B2F50] active:scale-[0.98]"
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
