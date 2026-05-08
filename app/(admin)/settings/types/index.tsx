export type SettingsTabKey = 'profile' | 'notifications' | 'dispatch' | 'security'

export interface SettingsTabItem {
  key: SettingsTabKey
  label: string
  icon: 'user' | 'bell' | 'radio' | 'shield'
}

export interface ProfileSettings {
  name: string
  email: string
  phone: string
  /** Image URL (e.g. Cloudinary `secure_url`). */
  profilePic: string
  /** Cloudinary `public_id` for delete/replace. */
  profilePicPublicId: string
}

import type { NotificationPreferencesDTO } from '@/lib/notification-preferences/types'

export type NotificationSettings = NotificationPreferencesDTO
export type NotificationSettingsKey = keyof NotificationPreferencesDTO

export interface NotificationPreferenceItem {
  key: NotificationSettingsKey
  label: string
  description: string
}

export interface DispatchSettings {
  autoDispatchMajor: boolean
  autoEscalateMinutes: string
  defaultChannel: string
  region: string
  messageTemplate: string
}

export interface SecuritySettings {
  twoFactorEnabled: boolean
  sessionTimeoutEnabled: boolean
}
