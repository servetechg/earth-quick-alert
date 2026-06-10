'use client'

import React, { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, User, Mail, Lock, MapPin, Navigation } from 'lucide-react'
import Image from 'next/image'
import logo from '../../public/logo.png'
import { useJsApiLoader, Autocomplete, GoogleMap, MarkerF } from '@react-google-maps/api'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/constants/google-maps-config'
import { useUser } from '@/lib/store/user-store'

function SignupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const responderInviteToken = searchParams.get('responderInvite')?.trim() ?? ''
  const { refresh: refreshUserProfile } = useUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSafe, setIsSafe] = useState(true)
  const [role, setRole] = useState('user')
  const [requestedLicenseType, setRequestedLicenseType] = useState('radius')
  const [country, setCountry] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [zipcode, setZipcode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mapCenter, setMapCenter] = useState({ lat: 34.7465, lng: -92.2896 }) // Default to Little Rock, Arkansas
  const [markerPosition, setMarkerPosition] = useState<{ lat: number, lng: number } | null>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)

  const [autocompleteInfo, setAutocompleteInfo] = useState<any>(null)
  const [inviteRoleLabel, setInviteRoleLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!responderInviteToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/responder-invite/preview?token=${encodeURIComponent(responderInviteToken)}`,
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok || cancelled) return
        setEmail(String(data.email || ''))
        setInviteRoleLabel(
          [data.responderFunction, data.responderVertical].filter(Boolean).join(' · ') || 'Responder',
        )
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [responderInviteToken])

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
      setMapCenter(newPos)
      setMarkerPosition(newPos)
      if (map) map.panTo(newPos)

      let newCity = ''
      let newState = ''
      let newCountry = ''
      let newZip = ''

      place.address_components?.forEach((component: any) => {
        const types = component.types
        if (types.includes('locality')) {
          newCity = component.long_name
        }
        if (types.includes('administrative_area_level_1')) {
          newState = component.long_name
        }
        if (types.includes('country')) {
          newCountry = component.long_name
        }
        if (types.includes('postal_code')) {
          newZip = component.long_name
        }
      })

      if (newCity) setCity(newCity)
      if (newState) setState(newState)
      if (newCountry) setCountry(newCountry)
      if (newZip) setZipcode(newZip)
      else setZipcode('')
    }
  }

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          const newPos = { lat: latitude, lng: longitude }
          setMapCenter(newPos)
          setMarkerPosition(newPos)
          if (map) map.panTo(newPos)

          // Reverse geocode to fill fields
          if (typeof google !== 'undefined') {
            const geocoder = new google.maps.Geocoder()
            geocoder.geocode({ location: newPos }, (results, status) => {
              if (status === 'OK' && results?.[0]) {
                const place = results[0]
                let newCity = ''
                let newState = ''
                let newCountry = ''
                let newZip = ''

                place.address_components?.forEach((component: any) => {
                  const types = component.types
                  if (types.includes('locality')) newCity = component.long_name
                  if (types.includes('administrative_area_level_1')) newState = component.long_name
                  if (types.includes('country')) newCountry = component.long_name
                  if (types.includes('postal_code')) newZip = component.long_name
                })

                if (newCity) setCity(newCity)
                if (newState) setState(newState)
                if (newCountry) setCountry(newCountry)
                if (newZip) setZipcode(newZip)
                else setZipcode('')
              }
            })
          }
        },
        () => {
          setError('Unable to retrieve your location. Please ensure location services are enabled.')
        }
      )
    } else {
      setError('Geolocation is not supported by your browser.')
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation for Location Fields
    if (!country || !state || !city || !zipcode) {
      setError('Please provide Country, State, City, and Zipcode.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          isSafe,
          role,
          country,
          state,
          city,
          zipcode,
          requestedLicenseType: role === 'sub-admin' ? requestedLicenseType : undefined,
          ...(responderInviteToken ? { responderInviteToken } : {}),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.setItem('userRole', data.user.role)
        localStorage.setItem('userEmail', data.user.email)
        localStorage.setItem('userName', data.user.name || '')
        localStorage.setItem('systemMode', data.systemMode || 'safe')
        localStorage.setItem('isSafe', String(data.user.isSafe ?? true))
        localStorage.setItem('userLocation', data.user.location || '')
        localStorage.setItem('userCity', data.user.city || '')
        localStorage.setItem('userState', data.user.state || '')
        localStorage.setItem('userCountry', data.user.country || '')

        await refreshUserProfile()

        if (data.user.accountStatus === 'pending') {
          router.push('/pending-approval')
        } else if (data.user.role === 'super-admin' || data.user.role === 'admin' || data.user.role === 'sub-admin') {
          router.push('/')
        } else if (data.user.role === 'responder') {
          router.push('/')
        } else if (!data.user.isSafe) {
          router.push('/virtual-eoc')
        } else {
          router.push('/user-dashboard')
        }
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch (err) {
      setError('An error occurred during signup. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* Left Side: Branding (Visible on Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#33375D] flex-col items-center justify-center p-12 text-white relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[700px] h-[700px] bg-white/5 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[700px] h-[700px] bg-slate-900/30 rounded-full blur-[140px] animate-pulse delay-700" />

        <div className="relative z-10 text-center max-w-md">
          <div className="flex flex-col items-center mb-12">
            <Image
              src={logo}
              alt="Ready2Go Logo"
              width={220}
              height={120}
              className="animate-in fade-in zoom-in duration-1000 mb-8"
            />
          </div>

          <h1 className="text-4xl font-black mb-6 tracking-tighter uppercase whitespace-nowrap">
            Create Your <span className="text-[#FFD75E]">Account</span>
          </h1>

          <p className="text-xl text-slate-300 font-medium leading-relaxed mb-8">
            Join our network and stay updated with live emergency alerts.
          </p>


        </div>
      </div>

      {/* Right Side: Signup Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12 relative">
        <div className="w-full max-w-lg">
          {/* Mobile Logo (Visible on Mobile) */}
          <div className="lg:hidden text-center mb-10 flex flex-col items-center">
            <Image
              src={logo}
              alt="Ready2Go Logo"
              width={120}
              height={70}
              className="mb-4"
            />
          </div>

          <div className="bg-white rounded-[48px] shadow-2xl shadow-slate-200/60 p-8 sm:p-10 lg:p-12 border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-black text-[#33375D] mb-3 tracking-tighter uppercase">Create Account</h2>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">Enter your details</p>
              {responderInviteToken && inviteRoleLabel && (
                <p className="mt-4 text-xs font-semibold text-slate-600 normal-case tracking-normal">
                  You are completing signup as an invited responder: <span className="text-[#33375D]">{inviteRoleLabel}</span>
                </p>
              )}
            </div>

            <form onSubmit={handleSignup} className="space-y-6 overflow-y-auto max-h-[70vh] px-1 pr-3 scrollbar-hide">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Full Name
                </label>
                <div className="relative group mt-1">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#33375D] transition-colors">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full font-semibold pl-16 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] transition-all text-[#33375D]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Email Address
                </label>
                <div className="relative group mt-1">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#33375D] transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={!!responderInviteToken}
                    className="w-full font-semibold pl-16 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] transition-all text-[#33375D] disabled:opacity-70 disabled:cursor-not-allowed"
                    required
                  />
                </div>
              </div>

              {!responderInviteToken && (
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Select Your Role
                  </label>
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <button
                      type="button"
                      onClick={() => setRole('user')}
                      className={`py-4 px-6 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${role === 'user'
                        ? 'bg-[#33375D] border-[#33375D] text-white shadow-lg'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-[#33375D]/30'
                        }`}
                    >
                      Responder
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('sub-admin')}
                      className={`py-4 px-6 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${role === 'sub-admin'
                        ? 'bg-[#33375D] border-[#33375D] text-white shadow-lg'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-[#33375D]/30'
                        }`}
                    >
                      Authorized Admin
                    </button>
                  </div>
                </div>
              )}

              {role === 'sub-admin' && (
                <div className="space-y-4 p-6 bg-[#33375D]/5 border border-[#33375D]/10 rounded-3xl animate-in fade-in duration-300">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    License Location Coverage Scope
                  </label>
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <button
                      type="button"
                      onClick={() => setRequestedLicenseType('state')}
                      className={`py-3 px-2 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1.5 
                        ${requestedLicenseType === 'state'
                          ? 'bg-[#33375D] border-[#33375D] text-white shadow-lg'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-[#33375D]/30'
                        }`}
                    >
                      <span>Whole State</span>
                      {/* <span className={`text-[8px] font-bold normal-case tracking-normal text-center leading-tight mt-0.5 ${requestedLicenseType === 'state' ? 'text-slate-300' : 'text-slate-400'}`}>
                        Alerts for entire state
                      </span> */}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestedLicenseType('radius')}
                      className={`py-3 px-2 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1.5 ${requestedLicenseType === 'radius'
                        ? 'bg-[#33375D] border-[#33375D] text-white shadow-lg'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-[#33375D]/30'
                        }`}
                    >
                      <span>Limited Radius</span>
                      {/* <span className={`text-[8px] font-bold normal-case tracking-normal text-center leading-tight mt-0.5 ${requestedLicenseType === 'radius' ? 'text-slate-300' : 'text-slate-400'}`}>
                        Within local radius
                      </span> */}
                    </button>
                  </div>
                </div>
              )}

              {/* Location Fields */}
              <div className="space-y-5 p-6 bg-[#33375D]/5 border border-[#33375D]/10 rounded-3xl animate-in fade-in slide-in-from-top-2 duration-500 shadow-inner">
                {isLoaded && (
                  <div className="space-y-4 mb-2 pb-6 border-b border-[#33375D]/10">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] font-black text-[#33375D] uppercase tracking-[0.2em] flex items-center gap-2">
                        <MapPin size={12} /> Your Location
                      </label>
                      <button
                        type="button"
                        onClick={handleLocateMe}
                        className="text-[10px] font-black text-white flex items-center gap-2 bg-[#33375D] hover:bg-[#44496B] px-4 py-2 rounded-xl transition-all shadow-lg active:scale-95"
                      >
                        <Navigation size={10} /> Find My Location
                      </button>
                    </div>
                    <Autocomplete onLoad={onPlaceLoaded} onPlaceChanged={onPlaceChanged}>
                      <input
                        type="text"
                        placeholder="Search for your city or zip code..."
                        className="w-full px-5 py-4 bg-white border border-slate-200 shadow-sm rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] transition-all text-[#33375D] placeholder:text-slate-300"
                      />
                    </Autocomplete>

                    {/* Interactive Map */}
                    <div className="w-full h-44 rounded-2xl overflow-hidden border border-slate-200 shadow-inner mt-4 relative group">
                      <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={mapCenter}
                        zoom={12}
                        onLoad={(map) => setMap(map)}
                        options={{
                          disableDefaultUI: true,
                          zoomControl: true,
                          styles: [
                            {
                              "featureType": "all",
                              "elementType": "labels.text.fill",
                              "stylers": [{ "color": "#33375D" }]
                            },
                            {
                              "featureType": "water",
                              "elementType": "geometry",
                              "stylers": [{ "color": "#E2E8F0" }]
                            }
                          ]
                        }}
                      >
                        {markerPosition && (
                          <MarkerF position={markerPosition} />
                        )}
                      </GoogleMap>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Country</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="USA"
                      className="w-full px-5 py-3 bg-white border border-slate-100 rounded-xl focus:outline-none focus:border-[#33375D] transition-all text-[#33375D] shadow-sm text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">State</label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="Arkansas"
                      className="w-full px-5 py-3 bg-white border border-slate-100 rounded-xl focus:outline-none focus:border-[#33375D] transition-all text-[#33375D] shadow-sm text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Little Rock"
                      className="w-full px-5 py-3 bg-white border border-slate-100 rounded-xl focus:outline-none focus:border-[#33375D] transition-all text-[#33375D] shadow-sm text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Zipcode</label>
                    <input
                      type="text"
                      value={zipcode}
                      onChange={(e) => setZipcode(e.target.value)}
                      placeholder="72201"
                      className="w-full px-5 py-3 bg-white border border-slate-100 rounded-xl focus:outline-none focus:border-[#33375D] transition-all text-[#33375D] shadow-sm text-sm"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Password
                </label>
                <div className="relative group mt-1">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#33375D] transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full pl-16 pr-16 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] transition-all text-[#33375D]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#33375D] transition-colors"
                  >
                    {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#33375D] hover:bg-[#44496B] text-white font-black py-8 rounded-3xl shadow-2xl shadow-[#33375D]/20 transition-all active:scale-[0.98] text-sm uppercase tracking-[0.2em] mt-2"
              >
                {loading ? (
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  'Sign Up'
                )}
              </Button>
            </form>

            <div className="mt-10 text-center">
              <p className="text-slate-500 font-bold text-[11px] uppercase tracking-widest">
                Already registered?{' '}
                <button
                  onClick={() => router.push('/login')}
                  className="text-[#33375D] font-black hover:underline underline-offset-4 decoration-2"
                >
                  Sign In
                </button>
              </p>
            </div>
          </div>

          <p className="mt-10 text-center text-slate-400 text-[9px] font-black uppercase tracking-[0.4em]">
            © 2026 Ready2Go Operations
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-slate-500 text-sm font-semibold">
          Loading signup…
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  )
}
