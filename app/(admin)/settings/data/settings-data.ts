import type { NotificationPreferenceItem, SettingsTabItem } from '../types'

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
  {
    key: 'push',
    label: 'Push delivery enabled',
    description: 'Turn off to stop sending notifications via push when other rules allow.',
  },
  {
    key: 'sms',
    label: 'SMS delivery enabled',
    description: 'Turn off to stop SMS for your account.',
  },
  {
    key: 'email',
    label: 'Email delivery enabled',
    description: 'Turn off to stop email notifications for your account.',
  },
]
