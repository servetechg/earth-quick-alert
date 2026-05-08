/** Super-admin / user auditable actions (extend as you add features). */
export const ACTIVITY_ACTIONS = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  PROFILE_UPDATE: 'profile.update',
  NOTIFICATION_PREFS_UPDATE: 'notification_preferences.update',
  DISPATCH_CONFIG_SAVE: 'dispatch_config.save',
  SECURITY_SETTINGS_UPDATE: 'security.settings_update',
  SECURITY_PASSWORD_CHANGE: 'security.password_change',
  AI_RISK_REPORT: 'risk_assessment.ai_report',
  AI_ALERT_MESSAGE: 'ai.alert_message',
  ALERT_COUNTRY_BROADCAST: 'alert.country_broadcast',
} as const
