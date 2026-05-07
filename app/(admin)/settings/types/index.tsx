export type SettingsTabKey = 'profile' | 'notifications' | 'dispatch' | 'security'

export interface SettingsTabItem {
  key: SettingsTabKey
  label: string
  icon: 'user' | 'bell' | 'radio' | 'shield'
}

export interface ProfileSettings {
  name: string
  email: string
  role: string
  phone: string
}

export interface NotificationSettings {
  majorAlerts: boolean
  minorAlerts: boolean
  aiReports: boolean
  emailDigest: boolean
  smsAlerts: boolean
  pushAlerts: boolean
}

export type NotificationSettingsKey = keyof NotificationSettings

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

export interface DispatchSelectOption {
  value: string
  label: string
}
