'use client'

import type { ComponentType } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Bell,
  Radio,
  Save,
  Shield,
  User,
} from 'lucide-react'
import {
  DISPATCH_CHANNEL_OPTIONS,
  DISPATCH_REGION_OPTIONS,
  NOTIFICATION_PREFERENCES,
  SETTINGS_TABS,
} from './data/settings-data'
import { SettingsSectionCard } from './_components/settings-section-card'
import { SettingsToggleRow } from './_components/settings-toggle-row'
import type {
  DispatchSettings,
  NotificationSettings,
  ProfileSettings,
  SettingsTabItem,
} from './types'

const TAB_ICON_MAP: Record<SettingsTabItem['icon'], ComponentType<{ className?: string }>> = {
  user: User,
  bell: Bell,
  radio: Radio,
  shield: Shield,
}

function formatRoleLabel(role: string): string {
  if (!role) return ''
  const map: Record<string, string> = {
    'super-admin': 'Super Admin',
    'sub-admin': 'Sub Admin',
    admin: 'Admin',
    observer: 'Observer',
    responder: 'Responder',
    manager: 'Manager',
    user: 'User',
    'eoc-manager': 'EOC Manager',
    'eoc-observer': 'EOC Observer',
  }
  return map[role] ?? role.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const INITIAL_PROFILE: ProfileSettings = {
  name: '',
  email: '',
  role: '',
  phone: '',
  profilePic: '',
  profilePicPublicId: '',
}

const INITIAL_NOTIFICATIONS: NotificationSettings = {
  majorAlerts: true,
  minorAlerts: true,
  aiReports: true,
  emailDigest: false,
  smsAlerts: true,
  pushAlerts: true,
}

const INITIAL_DISPATCH: DispatchSettings = {
  autoDispatchMajor: true,
  autoEscalateMinutes: '15',
  defaultChannel: 'all',
  region: 'western',
  messageTemplate:
    'EMERGENCY ALERT: {severity} {type} reported in {location}. {instructions} - Ready2Go Emergency Services.',
}

const PROFILE_FIELDS: Array<{
  id: keyof ProfileSettings
  label: string
  type: string
}> = [
  { id: 'name', label: 'Full Name', type: 'text' },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'role', label: 'Role', type: 'text' },
  { id: 'phone', label: 'Phone', type: 'text' },
]

const PRIMARY_BUTTON_CLASSNAME = 'bg-[#33375D] text-white hover:bg-[#2B2F50]'

const PROFILE_PIC_MAX_BYTES = 2 * 1024 * 1024

export default function AdminSettingsPage() {
  const router = useRouter()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [profile, setProfile] = useState<ProfileSettings>(INITIAL_PROFILE)
  const [notifications, setNotifications] = useState<NotificationSettings>(INITIAL_NOTIFICATIONS)
  const [dispatch, setDispatch] = useState<DispatchSettings>(INITIAL_DISPATCH)
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(true)
  const [isSessionTimeoutEnabled, setIsSessionTimeoutEnabled] = useState(true)

  useEffect(() => {
    const role = localStorage.getItem('userRole')
    if (role !== 'super-admin') {
      router.replace('/super-admin-dashboard')
      return
    }
    setIsAuthorized(true)
  }, [router])

  useEffect(() => {
    if (!isAuthorized) return

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
        if (!cancelled && u) {
          setProfile({
            name: u.name ?? '',
            email: u.email ?? '',
            role: formatRoleLabel(String(u.role ?? '')),
            phone: u.phoneNumber ?? '',
            profilePic: u.profilePic ?? '',
            profilePicPublicId: u.profilePicPublicId ?? '',
          })
        }
      } catch (e: any) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Could not load profile',
            description: e?.message || 'Try refreshing the page.',
          })
        }
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAuthorized])

  const initials = useMemo(() => {
    return profile.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('')
  }, [profile.name])

  const handleSave = (section: string) => {
    toast({
      title: 'Settings saved',
      description: `${section} settings have been updated.`,
    })
  }

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
      setProfile((prev) => ({
        ...prev,
        profilePic: data.url,
        profilePicPublicId: data.public_id,
      }))
      toast({
        title: 'Photo ready',
        description: 'Click Save Changes to store it on your profile.',
      })
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: e?.message || 'Could not upload image.',
      })
    } finally {
      setPhotoUploading(false)
    }
  }

  const handleSaveProfile = async () => {
    setProfileSaving(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          profilePic: profile.profilePic,
          profilePicPublicId: profile.profilePicPublicId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }
      if (data.user) {
        setProfile((prev) => ({
          ...prev,
          name: data.user.name ?? prev.name,
          email: data.user.email ?? prev.email,
          phone: data.user.phoneNumber ?? prev.phone,
          role: formatRoleLabel(String(data.user.role ?? '')),
          profilePic: data.user.profilePic ?? prev.profilePic,
          profilePicPublicId: data.user.profilePicPublicId ?? prev.profilePicPublicId,
        }))
      }
      toast({
        title: 'Profile saved',
        description: 'Your profile has been updated.',
      })
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: e?.message || 'Could not update profile.',
      })
    } finally {
      setProfileSaving(false)
    }
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <main className="p-8 space-y-10 max-w-[1800px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account, alert preferences, and system configuration.
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-card shadow-card h-auto p-1.5 rounded-2xl flex-wrap">
          {SETTINGS_TABS.map((tab) => {
            const Icon = TAB_ICON_MAP[tab.icon]
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="rounded-xl px-4 py-2 gap-2">
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="profile">
          <SettingsSectionCard
            title="Profile Information"
            description="Update your personal details and contact info."
            icon={<User className="h-5 w-5 text-primary" />}
          >
            {profileLoading && (
              <p className="text-sm text-muted-foreground">Loading profile…</p>
            )}
            <div className="flex items-center gap-5">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/70 text-2xl font-bold text-primary-foreground shadow-card">
                {profile.profilePic ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profilePic}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span className="relative z-10">{initials || 'AU'}</span>
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
                  size="sm"
                  disabled={profileLoading || photoUploading}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {photoUploading ? 'Uploading…' : 'Change Photo'}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">PNG or JPG, up to 2MB.</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PROFILE_FIELDS.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id}>{field.label}</Label>
                  <Input
                    id={field.id}
                    type={field.type}
                    value={profile[field.id]}
                    readOnly={field.id === 'role'}
                    disabled={field.id === 'role' || profileLoading}
                    className={field.id === 'role' ? 'bg-muted' : undefined}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, [field.id]: event.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSaveProfile}
                disabled={profileLoading || profileSaving}
                className={`gap-2 ${PRIMARY_BUTTON_CLASSNAME}`}
              >
                <Save className="h-4 w-4" />
                {profileSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </SettingsSectionCard>
        </TabsContent>

        <TabsContent value="notifications">
          <SettingsSectionCard
            title="Notification Preferences"
            description="Choose what alerts you receive and how."
            icon={<Bell className="h-5 w-5 text-primary" />}
          >
            {NOTIFICATION_PREFERENCES.map((item) => (
              <SettingsToggleRow
                key={item.key}
                label={item.label}
                description={item.description}
                checked={notifications[item.key]}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, [item.key]: checked }))
                }
              />
            ))}

            <div className="flex justify-end">
              <Button onClick={() => handleSave('Notification')} className={`gap-2 ${PRIMARY_BUTTON_CLASSNAME}`}>
                <Save className="h-4 w-4" />
                Save Preferences
              </Button>
            </div>
          </SettingsSectionCard>
        </TabsContent>

        <TabsContent value="dispatch">
          <SettingsSectionCard
            title="Dispatch Configuration"
            description="Control how alerts are routed and escalated."
            icon={<Radio className="h-5 w-5 text-[#33375D]" />}
          >
            <SettingsToggleRow
              label="Auto-dispatch Major Alerts"
              description="Automatically broadcast all major-severity alerts."
              checked={dispatch.autoDispatchMajor}
              onCheckedChange={(checked) =>
                setDispatch((prev) => ({ ...prev, autoDispatchMajor: checked }))
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="auto-escalate">Auto-escalate after (minutes)</Label>
                <Input
                  id="auto-escalate"
                  type="number"
                  value={dispatch.autoEscalateMinutes}
                  onChange={(event) =>
                    setDispatch((prev) => ({
                      ...prev,
                      autoEscalateMinutes: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Default Channel</Label>
                <Select
                  value={dispatch.defaultChannel}
                  onValueChange={(value) => setDispatch((prev) => ({ ...prev, defaultChannel: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPATCH_CHANNEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Operating Region</Label>
                <Select
                  value={dispatch.region}
                  onValueChange={(value) => setDispatch((prev) => ({ ...prev, region: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPATCH_REGION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="broadcast-template">Default Broadcast Message Template</Label>
              <Textarea
                id="broadcast-template"
                rows={4}
                value={dispatch.messageTemplate}
                onChange={(event) =>
                  setDispatch((prev) => ({ ...prev, messageTemplate: event.target.value }))
                }
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => handleSave('Dispatch')} className={`gap-2 ${PRIMARY_BUTTON_CLASSNAME}`}>
                <Save className="h-4 w-4" />
                Save Configuration
              </Button>
            </div>
          </SettingsSectionCard>
        </TabsContent>

        <TabsContent value="security">
          <SettingsSectionCard
            title="Security & Access"
            description="Protect your account and review activity."
            icon={<Shield className="h-5 w-5 text-primary" />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input id="current-password" type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" placeholder="••••••••" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-4 py-3">
              <div>
                <Label className="text-sm font-semibold flex items-center gap-2">
                  Two-Factor Authentication
                  <Badge variant="secondary" className="text-[10px]">
                    Recommended
                  </Badge>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Add an extra layer of protection to your account.
                </p>
              </div>
              <Switch
                checked={isTwoFactorEnabled}
                onCheckedChange={setIsTwoFactorEnabled}
                className="data-[state=checked]:bg-[#33375D]"
              />
            </div>

            <SettingsToggleRow
              label="Session Timeout"
              description="Auto sign-out after 30 minutes of inactivity."
              checked={isSessionTimeoutEnabled}
              onCheckedChange={setIsSessionTimeoutEnabled}
            />

            <div className="flex justify-end gap-3">
              <Button variant="outline">View Activity Log</Button>
              <Button onClick={() => handleSave('Security')} className={`gap-2 ${PRIMARY_BUTTON_CLASSNAME}`}>
                <Save className="h-4 w-4" />
                Update Security
              </Button>
            </div>
          </SettingsSectionCard>
        </TabsContent>
      </Tabs>
    </main>
  )
}
