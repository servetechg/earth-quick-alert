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
  UserPlus
} from "lucide-react"
import { toast } from "sonner"

import dynamic from 'next/dynamic'
import { GeoapifyAutocomplete, GeoapifyPlace } from '@/components/ui/geoapify-autocomplete'


const LicenseCoverageMap = dynamic(() => import('@/components/ui/license-coverage-map'), {
  ssr: false,
  loading: () => (
    <div className="h-40 bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-xs text-slate-400 font-bold">
      Loading Map...
    </div>
  ),
})

import { useLicenseCoverageRadius } from '@/hooks/use-license-coverage-radius'
import {
  LICENSE_COVERAGE_MIN_MILE,
  LICENSE_COVERAGE_STEP_MILE,
  clampLicenseRadiusMile,
  mapZoomForRadiusMiles,
  midpointRadiusLabel,
} from '@/lib/geo/license-coverage-radius'
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
    requestedLicenseType?: string;
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
    radiusMile: LICENSE_COVERAGE_MIN_MILE,
    stateCode: '',
    countryCode: '',
    userId: user?._id || '',
    organizationalAddress: '',
    coverageType: user?.requestedLicenseType || 'radius',
  })

  const {
    maxRadiusMile,
    hasStateCoverage,
    coverageLoading,
    fetchCoverageMax,
    resetCoverage,
    clampRadius,
    geocodeAddressAndFetchCoverage,
  } = useLicenseCoverageRadius()

  const [mapCenter, setMapCenter] = useState(defaultCenter)

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
        coverageType: user.requestedLicenseType || 'radius',
      }))

      if (fullAddress) {
        void geocodeAddressAndFetchCoverage(
          fullAddress,
          { stateName: user.state, countryName: user.country },
          setMapCenter
        ).then((region) => {
          if (region) {
            setFormData((prev) => ({
              ...prev,
              stateCode: region.stateCode || prev.stateCode,
              countryCode: region.countryCode || prev.countryCode,
            }))
          }
        })
      } else if (user.state) {
        void fetchCoverageMax({
          stateName: user.state,
          countryName: user.country,
        })
      }
    } else {
      resetCoverage()
    }
  }, [isOpen, user, geocodeAddressAndFetchCoverage, fetchCoverageMax, resetCoverage])


  const handlePrimaryGeoapifySelect = useCallback(
    (place: GeoapifyPlace) => {
      if (place.lat && place.lng) {
        setMapCenter({ lat: place.lat, lng: place.lng })
      }

      const stateName = place.state || ''
      const countryName = place.country || ''

      setFormData((prev) => ({
        ...prev,
        city: place.city || prev.city,
        state: stateName || prev.state,
        country: countryName || prev.country,
        zipcode: place.zipcode || prev.zipcode,
        billingAddress: place.formatted || prev.billingAddress,
      }))

      void fetchCoverageMax({
        stateName: stateName || undefined,
        countryName: countryName || undefined,
      }).then((max) => {
        if (max != null) {
          setFormData((prev) => ({
            ...prev,
            radiusMile: clampLicenseRadiusMile(prev.radiusMile, max),
          }))
        }
      })
    },
    [fetchCoverageMax],
  )

  const handleOrgGeoapifySelect = useCallback((place: GeoapifyPlace) => {
    setFormData((prev) => ({
      ...prev,
      organizationalAddress: place.formatted,
    }))
  }, [])


  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasStateCoverage || maxRadiusMile == null) {
      toast.error('Select a primary address from suggestions to set the state coverage limit')
      return
    }
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
                  <GeoapifyAutocomplete
                    initialValue={formData.organizationalAddress}
                    placeholder="HQ or Registered Address"
                    onSelect={handleOrgGeoapifySelect}
                    inputClassName="h-11 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 font-medium text-sm"
                  />
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
                  <GeoapifyAutocomplete
                    initialValue={formData.billingAddress}
                    placeholder="Operations center or target location"
                    onSelect={handlePrimaryGeoapifySelect}
                    inputClassName="h-11 bg-white border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 font-medium border-blue-100 shadow-sm text-sm"
                  />
                </div>


                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Coverage Scope Option</Label>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant={formData.coverageType === 'state' ? 'default' : 'outline'}
                      onClick={() => setFormData(prev => ({ ...prev, coverageType: 'state' }))}
                      className={cn(
                        "flex-1 h-11 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm",
                        formData.coverageType === 'state'
                          ? "bg-[#33375D] text-white hover:bg-[#2B2F50]"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      Complete State
                    </Button>
                    <Button
                      type="button"
                      variant={formData.coverageType === 'radius' ? 'default' : 'outline'}
                      onClick={() => setFormData(prev => ({ ...prev, coverageType: 'radius' }))}
                      className={cn(
                        "flex-1 h-11 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm",
                        formData.coverageType === 'radius'
                          ? "bg-[#33375D] text-white hover:bg-[#2B2F50]"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      Limited Radius
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-6">
                    <div className="flex justify-between items-center gap-2">
                      <Label className="text-sm font-medium text-slate-700">Coverage Radius</Label>
                      <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full shrink-0 flex items-center gap-1.5 animate-in fade-in duration-300">
                        {formData.coverageType === 'state' ? (
                          'Entire State'
                        ) : (
                          <>
                            {coverageLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {hasStateCoverage && maxRadiusMile != null
                              ? `${formData.radiusMile} / ${maxRadiusMile} Mi`
                              : `${formData.radiusMile} Mi`}
                          </>
                        )}
                      </span>
                    </div>
                    {formData.coverageType === 'state' ? (
                      <p className="text-xs text-slate-500 font-medium bg-blue-50/20 text-blue-800 p-4 rounded-2xl border border-blue-100/50 leading-relaxed animate-in slide-in-from-top-2 duration-300">
                        Coverage encompasses the entire state of <strong>{formData.state || 'selected state'}</strong>. Coordinate-based radius restrictions are disabled.
                      </p>
                    ) : (
                      <>
                        {!hasStateCoverage && !coverageLoading && (
                          <p className="text-xs text-slate-500">
                            Pick a primary address from search suggestions to load the state max radius.
                          </p>

                        )}
                        {hasStateCoverage && maxRadiusMile != null && formData.state && (
                          <p className="text-xs text-slate-500">
                            Max for {formData.state}: {maxRadiusMile} mi
                          </p>
                        )}
                      </>
                    )}
                    <input
                      type="range"
                      min={LICENSE_COVERAGE_MIN_MILE}
                      max={maxRadiusMile ?? LICENSE_COVERAGE_MIN_MILE}
                      step={LICENSE_COVERAGE_STEP_MILE}
                      value={formData.radiusMile}
                      disabled={formData.coverageType === 'state' || !hasStateCoverage || maxRadiusMile == null || coverageLoading}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          radiusMile: clampRadius(parseInt(e.target.value, 10)),
                        }))
                      }
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                      <span>{LICENSE_COVERAGE_MIN_MILE} Mi</span>
                      {formData.coverageType !== 'state' && hasStateCoverage && maxRadiusMile != null ? (
                        <>
                          <span>{midpointRadiusLabel(LICENSE_COVERAGE_MIN_MILE, maxRadiusMile)} Mi</span>
                          <span>{maxRadiusMile} Mi</span>
                        </>
                      ) : (
                        <span className="text-slate-300">Max —</span>
                      )}
                    </div>
                  </div>

                  <div className="h-40 rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative z-0">
                    <LicenseCoverageMap
                      center={mapCenter}
                      radiusMile={formData.radiusMile}
                      coverageType={formData.coverageType}
                      zoom={formData.coverageType === 'state' ? 6 : mapZoomForRadiusMiles(formData.radiusMile)}
                    />
                  </div>

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
