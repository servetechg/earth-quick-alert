/**
 * Persisted notification preferences (`User.notificationPreferences`).
 * Matches `/api/user/notification-preferences` GET `data.notificationPreferences`.
 */
export interface NotificationPreferencesDTO {
    push: boolean
    sms: boolean
    email: boolean
    majorAlerts: boolean
    minorAlerts: boolean
    aiReports: boolean
    pushAlerts: boolean
    smsAlerts: boolean
    emailDigest: boolean
}

export interface NotificationPreferencesGetData {
    phoneNumber: string
    email: string
    notificationPreferences: NotificationPreferencesDTO
}
