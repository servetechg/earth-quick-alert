export type NotificationType =
    | 'citizen_activity'
    | 'citizen_report_resolved'
    | 'alert_dispatched'
    | 'disaster_survey'
    | 'ida_application'
    | 'ai_report'
    | 'responder_approval'
    | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationAudience = 'admin' | 'citizen';

export interface UserNotificationItem {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    priority: NotificationPriority;
    read: boolean;
    deepLink?: string;
    meta?: Record<string, unknown>;
    createdAt: string;
    displayTime: string;
}

export interface UserNotificationListResponse {
    items: UserNotificationItem[];
    unreadCount: number;
    total: number;
}
