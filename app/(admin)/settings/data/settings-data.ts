import type {
  DispatchSelectOption,
  NotificationPreferenceItem,
  SettingsTabItem,
} from '../types'

export const SETTINGS_TABS: SettingsTabItem[] = [
  { key: 'profile', label: 'Profile', icon: 'user' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
  { key: 'dispatch', label: 'Dispatch', icon: 'radio' },
  { key: 'security', label: 'Security', icon: 'shield' },
]

export const NOTIFICATION_PREFERENCES: NotificationPreferenceItem[] = [
  {
    key: 'majorAlerts',
    label: 'Major Alerts (Auto-dispatched)',
    description: 'Critical incidents requiring immediate awareness.',
  },
  {
    key: 'minorAlerts',
    label: 'Minor Alerts (Pending)',
    description: 'Alerts awaiting manual dispatch decisions.',
  },
  {
    key: 'aiReports',
    label: 'AI Risk Reports',
    description: 'Notify when a new AI-generated SITREP is ready.',
  },
  {
    key: 'emailDigest',
    label: 'Daily Email Digest',
    description: 'A morning summary of incidents from the past 24h.',
  },
  {
    key: 'smsAlerts',
    label: 'SMS Alerts',
    description: 'Text messages for critical events.',
  },
  {
    key: 'pushAlerts',
    label: 'Browser Push Notifications',
    description: 'Real-time push alerts in your browser.',
  },
]

export const DISPATCH_CHANNEL_OPTIONS: DispatchSelectOption[] = [
  { value: 'all', label: 'All Channels' },
  { value: 'sms', label: 'SMS Only' },
  { value: 'email', label: 'Email Only' },
  { value: 'push', label: 'Push Only' },
]

export const DISPATCH_REGION_OPTIONS: DispatchSelectOption[] = [
  { value: 'western', label: 'Western Region' },
  { value: 'central', label: 'Central Region' },
  { value: 'eastern', label: 'Eastern Region' },
  { value: 'national', label: 'National' },
]
