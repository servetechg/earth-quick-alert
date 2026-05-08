'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, Mail, MapPin, ArrowLeft, Save, CheckCircle2, AlertCircle, Phone } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { syncClientUserProfileFromServer } from '@/lib/sync-client-user-profile'

const PROFILE_PIC_MAX_BYTES = 2 * 1024 * 1024

export default function EditProfilePage() {
  const router = useRouter()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [profilePic, setProfilePic] = useState('')
  const [profilePicPublicId, setProfilePicPublicId] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const initials = useMemo(() => {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }, [name])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setProfileLoading(true)
      try {
        const res = await fetch('/api/user/profile', { credentials: 'same-origin' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load profile')
        }
        const u = data.user
        if (cancelled || !u) return
        setName(u.name ?? '')
        setEmail(u.email ?? '')
        setPhone(u.phoneNumber ?? '')
        setLocation(u.location ?? '')
        setProfilePic(u.profilePic ?? '')
        setProfilePicPublicId(u.profilePicPublicId ?? '')
        syncClientUserProfileFromServer({
          name: u.name,
          email: u.email,
          location: u.location ?? '',
          profilePic: u.profilePic ?? '',
        })
      } catch {
        if (cancelled) return
        setName(localStorage.getItem('userName') || '')
        setEmail(localStorage.getItem('userEmail') || '')
        setPhone('')
        setLocation(localStorage.getItem('userLocation') || '')
        setProfilePic(localStorage.getItem('userProfilePic') || '')
        setProfilePicPublicId('')
        toast({
          variant: 'destructive',
          title: 'Could not load profile',
          description: 'Showing cached details where available. Save may still work if you are signed in.',
        })
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleProfilePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])
    if (!allowed.has(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file',
        description: 'Use PNG, JPG, or WebP.',
      })
      return
    }
    if (file.size > PROFILE_PIC_MAX_BYTES) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Profile photo must be 2MB or smaller.',
      })
      return
    }

    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'earthquick/profiles')

      const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data.error || data.message || 'Upload failed')
      }
      setProfilePic(data.url)
      setProfilePicPublicId(data.public_id)
      toast({
        title: 'Photo ready',
        description: 'Click Save Changes to store it on your profile.',
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not upload image.'
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: msg,
      })
    } finally {
      setPhotoUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ type: '', text: '' })

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name,
          email,
          phone,
          location,
          profilePic,
          profilePicPublicId,
        }),
      })

      const data = await response.json()

      if (response.ok && data.user) {
        const u = data.user
        setName(u.name ?? name)
        setEmail(u.email ?? email)
        setPhone(u.phoneNumber ?? phone)
        setLocation(u.location ?? location)
        setProfilePic(u.profilePic ?? profilePic)
        setProfilePicPublicId(u.profilePicPublicId ?? profilePicPublicId)
        syncClientUserProfileFromServer({
          name: u.name,
          email: u.email,
          location: u.location ?? location,
          profilePic: u.profilePic ?? profilePic,
        })
        setMessage({ type: 'success', text: 'Profile updated successfully!' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update profile' })
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex-1 overflow-auto bg-slate-50 p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-slate-200"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Edit Profile</h1>
            <p className="text-slate-500 font-medium">Manage your personal information and preferences.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="p-8 border-slate-200 shadow-sm bg-white rounded-3xl space-y-8">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#34385E] to-[#5a5f8a] text-xl font-black text-white shadow-md">
                  {profilePic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profilePic} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="relative z-10">{initials || '?'}</span>
                  )}
                </div>
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleProfilePhotoSelected}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-slate-200 font-bold"
                    disabled={profileLoading || photoUploading}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoUploading ? 'Uploading…' : 'Change photo'}
                  </Button>
                  <p className="text-[11px] text-slate-400 font-bold mt-2 ml-0.5">
                    Uploads go to Cloudinary (PNG, JPG, or WebP, up to 2MB). Save changes to persist.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                    Full Name
                  </Label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={profileLoading}
                      className="pl-12 py-6 rounded-2xl border-slate-200 focus:ring-blue-500 font-medium"
                      placeholder="Enter your name"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      disabled
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12 py-6 rounded-2xl border-slate-200 focus:ring-blue-500 font-medium bg-slate-50"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                  Phone
                </Label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={profileLoading}
                    className="pl-12 py-6 rounded-2xl border-slate-200 focus:ring-blue-500 font-medium"
                    placeholder="+1 …"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location" className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                  Base Location
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={profileLoading}
                    className="pl-12 py-6 rounded-2xl border-slate-200 focus:ring-blue-500 font-medium"
                    placeholder="City, Area (e.g. San Francisco, CA)"
                  />
                </div>
                <p className="text-[11px] text-slate-400 font-bold italic ml-1">
                  This location is used for targeted emergency alerts when geolocator is inactive.
                </p>
              </div>
            </div>

            {message.text && (
              <div
                className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
                }`}
              >
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <p className="text-sm font-bold">{message.text}</p>
              </div>
            )}

            <div className="pt-4 flex flex-col sm:flex-row gap-4">
              <Button
                type="submit"
                disabled={loading || profileLoading}
                className="flex-1 bg-[#34385E] hover:bg-[#2A2D4A] text-white font-black py-7 rounded-2xl shadow-lg transition-all active:scale-[0.98] text-lg uppercase tracking-widest gap-2"
              >
                <Save className="w-5 h-5" />
                {loading ? 'UPDATING...' : 'SAVE CHANGES'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-slate-200 text-slate-600 font-black py-7 rounded-2xl hover:bg-slate-50 transition-all text-lg uppercase tracking-widest"
                onClick={() => router.back()}
              >
                CANCEL
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </main>
  )
}
