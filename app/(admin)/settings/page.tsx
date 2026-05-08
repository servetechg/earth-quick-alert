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
import { ActivityLogDialog } from './_components/activity-log-dialog'
import { SECURITY_PREFS_UPDATED_EVENT } from '@/components/session-idle-watcher'
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
const MIN_NEW_PASSWORD_LEN = 6

async function parseApiJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const text = await res.text()
    if (!text.trim()) return {}
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function apiErrorDescription(data: Record<string, unknown>, fallback: string): string {
  const err = data.error
  if (typeof err === 'string' && err.trim()) return err.trim()
  const msg = data.message
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  return fallback
}

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
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [notificationsSaving, setNotificationsSaving] = useState(false)
  const [dispatch, setDispatch] = useState<DispatchSettings>(INITIAL_DISPATCH)
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(false)
  const [isSessionTimeoutEnabled, setIsSessionTimeoutEnabled] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [isDispatchSaving, setIsDispatchSaving] = useState(false)
  const [isSecuritySaving, setIsSecuritySaving] = useState(false)
  const [activityLogOpen, setActivityLogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      const role = localStorage.getItem('userRole')
      if (role !== 'super-admin') {
        router.replace('/super-admin-dashboard')
        return
      }

      if (!cancelled) setIsAuthorized(true)

      const [dispatchResult, securityResult] = await Promise.allSettled([
        fetch('/api/admin/dispatch-settings', { credentials: 'same-origin' }),
        fetch('/api/user/security', { credentials: 'same-origin' }),
      ])

      if (dispatchResult.status === 'fulfilled') {
        try {
          const res = dispatchResult.value
          const payload = await res.json().catch(() => ({}))
          if (!res.ok || !payload?.success || !payload?.data) {
            throw new Error(payload?.error || 'Failed to load dispatch settings')
          }
          if (!cancelled) {
            setDispatch({
              autoDispatchMajor: Boolean(payload.data.autoDispatchMajor),
              autoEscalateMinutes: String(
                payload.data.autoEscalateMinutes ?? INITIAL_DISPATCH.autoEscalateMinutes,
              ),
              defaultChannel: String(payload.data.defaultChannel ?? INITIAL_DISPATCH.defaultChannel),
              region: String(payload.data.region ?? INITIAL_DISPATCH.region),
              messageTemplate: String(
                payload.data.messageTemplate ?? INITIAL_DISPATCH.messageTemplate,
              ),
            })
          }
        } catch (error: any) {
          if (!cancelled) {
            toast({
              title: 'Dispatch settings',
              description: error?.message || 'Failed to load dispatch settings.',
            })
          }
        }
      }

      if (securityResult.status === 'fulfilled') {
        try {
          const res = securityResult.value
          const payload = await res.json().catch(() => ({}))
          if (res.ok && payload?.success && payload?.data && !cancelled) {
            setIsTwoFactorEnabled(Boolean(payload.data.twoFactorEnabled))
            setIsSessionTimeoutEnabled(payload.data.sessionTimeoutEnabled !== false)
          }
        } catch {
          /* ignore */
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
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

  useEffect(() => {
    if (!isAuthorized) return

    let cancelled = false
    ;(async () => {
      setNotificationsLoading(true)
      try {
        const res = await fetch('/api/user/notification-preferences', { credentials: 'same-origin' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json.error || 'Failed to load notification preferences')
        }
        const np = json.data?.notificationPreferences
        if (!cancelled && np) {
          setNotifications({
            majorAlerts: np.majorAlerts !== false,
            minorAlerts: np.minorAlerts !== false,
            aiReports: np.aiReports !== false,
            emailDigest: np.emailDigest === true,
            smsAlerts: np.smsAlerts !== false,
            pushAlerts: np.pushAlerts !== false,
          })
        }
      } catch (e: any) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Could not load notifications',
            description: e?.message || 'Try refreshing the page.',
          })
        }
      } finally {
        if (!cancelled) setNotificationsLoading(false)
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

  const handleSave = async (section: string) => {
    if (section === 'Dispatch') {
      try {
        setIsDispatchSaving(true)
        const res = await fetch('/api/admin/dispatch-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(dispatch),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok || !payload?.success || !payload?.data) {
          throw new Error(payload?.error || 'Failed to save dispatch settings')
        }
        setDispatch({
          autoDispatchMajor: Boolean(payload.data.autoDispatchMajor),
          autoEscalateMinutes: String(payload.data.autoEscalateMinutes ?? dispatch.autoEscalateMinutes),
          defaultChannel: String(payload.data.defaultChannel ?? dispatch.defaultChannel),
          region: String(payload.data.region ?? dispatch.region),
          messageTemplate: String(payload.data.messageTemplate ?? dispatch.messageTemplate),
        })
        toast({
          title: 'Save configuration',
          description: 'Dispatch configuration was saved successfully.',
        })
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Save configuration failed',
          description: error?.message || 'Unable to save dispatch settings.',
        })
      } finally {
        setIsDispatchSaving(false)
      }
      return
    }

    if (section === 'Security') {
      const c = currentPassword.trim()
      const n = newPassword.trim()
      const anyPwd = Boolean(c || n)

      if (anyPwd) {
        if (!c || !n) {
          toast({
            variant: 'destructive',
            title: 'Missing password fields',
            description: 'Enter both your current password and a new password to change it.',
          })
          return
        }
        if (n.length < MIN_NEW_PASSWORD_LEN) {
          toast({
            variant: 'destructive',
            title: 'Password too short',
            description: `New password must be at least ${MIN_NEW_PASSWORD_LEN} characters.`,
          })
          return
        }
        if (c === n) {
          toast({
            variant: 'destructive',
            title: 'New password rejected',
            description: 'New password must be different from your current password.',
          })
          return
        }
      }

      try {
        setIsSecuritySaving(true)
        if (anyPwd) {
          const pwdRes = await fetch('/api/user/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ currentPassword: c, newPassword: n }),
          })
          const pwdData = await parseApiJson(pwdRes)
          if (!pwdRes.ok) {
            const fallback =
              pwdRes.status >= 500
                ? 'We could not update your password. Please try again in a moment.'
                : 'Could not update your password.'
            const message = apiErrorDescription(pwdData, fallback)
            toast({
              variant: 'destructive',
              title: message,
            })
            return
          }
        }

        const secRes = await fetch('/api/user/security', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            twoFactorEnabled: isTwoFactorEnabled,
            sessionTimeoutEnabled: isSessionTimeoutEnabled,
          }),
        })
        const secData = await parseApiJson(secRes)
        const secPayloadData = secData.data
        const secOk =
          secRes.ok &&
          secData.success === true &&
          typeof secPayloadData === 'object' &&
          secPayloadData !== null &&
          !Array.isArray(secPayloadData)

        if (!secOk) {
          const fallback =
            secRes.status >= 500
              ? 'We could not save your security preferences. Please try again.'
              : secRes.status === 401
                ? 'Your session has expired. Sign in again to save security settings.'
                : 'Could not save security preferences.'
          const description = apiErrorDescription(secData, fallback)
          toast({
            variant: 'destructive',
            title:
              secRes.status === 401
                ? 'Sign in required'
                : secRes.status >= 500
                  ? 'Server error'
                  : 'Could not save preferences',
            description,
          })
          return
        }

        const data = secPayloadData as {
          twoFactorEnabled?: unknown
          sessionTimeoutEnabled?: unknown
        }
        setIsTwoFactorEnabled(Boolean(data.twoFactorEnabled))
        setIsSessionTimeoutEnabled(data.sessionTimeoutEnabled !== false)
        if (anyPwd) {
          setCurrentPassword('')
          setNewPassword('')
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(SECURITY_PREFS_UPDATED_EVENT))
        }

        toast({
          title: 'Security updated',
          description: anyPwd
            ? 'Password and security preferences were saved.'
            : 'Security preferences were saved.',
        })
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : 'Unable to save security settings. Check your connection and try again.'
        toast({
          variant: 'destructive',
          title: 'Something went wrong',
          description: msg,
        })
      } finally {
        setIsSecuritySaving(false)
      }
      return
    }

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

  const handleSaveNotifications = async () => {
    setNotificationsSaving(true)
    try {
      const res = await fetch('/api/user/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          notificationPreferences: {
            majorAlerts: notifications.majorAlerts,
            minorAlerts: notifications.minorAlerts,
            aiReports: notifications.aiReports,
            emailDigest: notifications.emailDigest,
            smsAlerts: notifications.smsAlerts,
            pushAlerts: notifications.pushAlerts,
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save notification preferences')
      }
      const np = json.data?.notificationPreferences
      if (np) {
        setNotifications({
          majorAlerts: np.majorAlerts !== false,
          minorAlerts: np.minorAlerts !== false,
          aiReports: np.aiReports !== false,
          emailDigest: np.emailDigest === true,
          smsAlerts: np.smsAlerts !== false,
          pushAlerts: np.pushAlerts !== false,
        })
      }
      toast({
        title: 'Preferences saved',
        description: 'Your notification settings have been updated.',
      })
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: e?.message || 'Could not save notification preferences.',
      })
    } finally {
      setNotificationsSaving(false)
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
            {notificationsLoading && (
              <p className="text-sm text-muted-foreground">Loading notification preferences…</p>
            )}
            {NOTIFICATION_PREFERENCES.map((item) => (
              <SettingsToggleRow
                key={item.key}
                label={item.label}
                description={item.description}
                checked={notifications[item.key]}
                disabled={notificationsLoading}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, [item.key]: checked }))
                }
              />
            ))}

            <div className="flex justify-end">
              <Button
                onClick={handleSaveNotifications}
                disabled={notificationsLoading || notificationsSaving}
                className={`gap-2 ${PRIMARY_BUTTON_CLASSNAME}`}
              >
                <Save className="h-4 w-4" />
                {notificationsSaving ? 'Saving…' : 'Save Preferences'}
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
              <Button
                onClick={() => handleSave('Dispatch')}
                disabled={isDispatchSaving}
                className={`gap-2 ${PRIMARY_BUTTON_CLASSNAME}`}
              >
                <Save className="h-4 w-4" />
                {isDispatchSaving ? 'Saving...' : 'Save Configuration'}
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
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
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
              <Button type="button" variant="outline" onClick={() => setActivityLogOpen(true)}>
                View Activity Log
              </Button>
              <Button
                type="button"
                onClick={() => handleSave('Security')}
                disabled={isSecuritySaving}
                className={`gap-2 ${PRIMARY_BUTTON_CLASSNAME}`}
              >
                <Save className="h-4 w-4" />
                {isSecuritySaving ? 'Saving...' : 'Update Security'}
              </Button>
            </div>
          </SettingsSectionCard>
        </TabsContent>
      </Tabs>

      <ActivityLogDialog open={activityLogOpen} onOpenChange={setActivityLogOpen} />
    </main>
  )
}
