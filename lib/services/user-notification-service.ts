import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import UserNotification, { type IUserNotification } from '@/models/UserNotification';
import { CITIZEN_ACTIVITY_CATEGORY_META } from '@/lib/citizen-activity/category-meta';
import type { CitizenActivityCategory } from '@/lib/citizen-activity/types';
import type {
    NotificationAudience,
    NotificationPriority,
    NotificationType,
    UserNotificationItem,
    UserNotificationListResponse,
} from '@/lib/notifications/types';
import { sendExpoPushNotification } from '@/lib/services/mobile/expo-push-service';
import {
    coordinatesInJurisdiction,
    resolveSubAdminJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import type { ICitizenActivity } from '@/models/CitizenActivity';

const ADMIN_ROLES = new Set(['super-admin', 'admin', 'sub-admin', 'observer', 'manager']);

function formatDisplayTime(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 60_000) return 'Just now';
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function mapDocToItem(doc: IUserNotification & { _id?: { toString(): string } }): UserNotificationItem {
    const created = doc.createdAt ? new Date(doc.createdAt) : new Date();
    return {
        id: doc._id?.toString() ?? '',
        type: doc.type,
        title: doc.title,
        body: doc.body,
        priority: doc.priority,
        read: Boolean(doc.read),
        deepLink: doc.deepLink || undefined,
        meta: doc.meta as Record<string, unknown> | undefined,
        createdAt: created.toISOString(),
        displayTime: formatDisplayTime(created),
    };
}

function prefsAllowPush(prefs: Record<string, unknown> | null | undefined): boolean {
    if (!prefs) return true;
    const push = prefs.push ?? prefs.pushAlerts;
    if (push === false || push === 'false') return false;
    return true;
}

function prefsAllowMajorAlerts(prefs: Record<string, unknown> | null | undefined): boolean {
    if (!prefs) return true;
    const v = prefs.majorAlerts;
    if (v === false || v === 'false') return false;
    return true;
}

export type DispatchNotificationInput = {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    priority?: NotificationPriority;
    deepLink?: string;
    audience?: NotificationAudience;
    meta?: Record<string, unknown>;
    push?: {
        title: string;
        body: string;
        data?: Record<string, unknown>;
        channelId?: string;
    };
    skipPush?: boolean;
};

export async function dispatchUserNotification(
    input: DispatchNotificationInput,
): Promise<{ item: UserNotificationItem | null; pushSent: boolean }> {
    await connectDB();

    const dedupeKey = input.meta?.dedupeKey;
    if (typeof dedupeKey === 'string' && dedupeKey.trim()) {
        const existing = await UserNotification.findOne({
            userId: input.userId,
            'meta.dedupeKey': dedupeKey.trim(),
        }).lean();
        if (existing) {
            return {
                item: mapDocToItem(existing as IUserNotification & { _id: { toString(): string } }),
                pushSent: false,
            };
        }
    }

    let doc;
    try {
        doc = await UserNotification.create({
            userId: input.userId,
            type: input.type,
            title: input.title.trim(),
            body: input.body.trim(),
            priority: input.priority ?? 'normal',
            read: false,
            deepLink: input.deepLink?.trim() ?? '',
            audience: input.audience ?? 'citizen',
            meta: input.meta ?? {},
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('duplicate key') && typeof dedupeKey === 'string') {
            const existing = await UserNotification.findOne({
                userId: input.userId,
                'meta.dedupeKey': dedupeKey.trim(),
            }).lean();
            if (existing) {
                return {
                    item: mapDocToItem(existing as IUserNotification & { _id: { toString(): string } }),
                    pushSent: false,
                };
            }
        }
        throw e;
    }

    let pushSent = false;
    if (!input.skipPush && input.push) {
        const pushPayload = {
            ...input.push,
            data: {
                notificationType: input.type,
                ...input.push.data,
            },
        };
        try {
            // Await delivery so callers (esp. survey dispatch) get accurate pushSent.
            pushSent = await sendPushToUser(
                input.userId,
                pushPayload,
                input.priority ?? 'normal',
                input.type,
            );
        } catch (err) {
            console.warn('[notifications] push delivery failed:', err);
            pushSent = false;
        }
    }

    return {
        item: mapDocToItem(doc.toObject() as IUserNotification),
        pushSent,
    };
}

async function sendPushToUser(
    userId: string,
    push: NonNullable<DispatchNotificationInput['push']>,
    priority: NotificationPriority,
    notificationType?: NotificationType,
): Promise<boolean> {
    const user = await User.findById(userId)
        .select('expoPushToken notificationPreferences role')
        .lean();
    if (!user) return false;

    const prefs = (user as { notificationPreferences?: Record<string, unknown> }).notificationPreferences;
    if (!prefsAllowPush(prefs)) return false;

    // Survey / IDA invites are actionable ops notifications — do not gate on "major alerts".
    const requiresMajorAlerts =
        (priority === 'critical' || priority === 'high') &&
        notificationType !== 'disaster_survey' &&
        notificationType !== 'ida_application' &&
        notificationType !== 'citizen_activity';
    if (requiresMajorAlerts && !prefsAllowMajorAlerts(prefs)) return false;

    const token = String((user as { expoPushToken?: string }).expoPushToken ?? '').trim();
    if (!token) return false;

    const result = await sendExpoPushNotification({
        to: token,
        title: push.title,
        body: push.body,
        data: {
            // Prefer caller screen (e.g. disasterSurvey); fall back to inbox.
            screen: 'notifications',
            notificationType: push.data?.notificationType ?? notificationType,
            deepLink: push.data?.deepLink,
            ...push.data,
        },
        sound: 'default',
        channelId:
            push.channelId ??
            (notificationType === 'disaster_survey' ||
            notificationType === 'ida_application' ||
            notificationType === 'citizen_activity'
                ? 'disaster-alerts'
                : 'inbox-updates'),
        priority: priority === 'critical' || priority === 'high' ? 'high' : 'default',
    });
    if (!result.ok) {
        console.warn('[notifications] Expo push rejected:', result.error);
    }
    return result.ok;
}

function locationInJurisdiction(
    row: { lat?: number | null; lng?: number | null; userState?: string },
    jurisdiction: SubAdminJurisdiction,
): boolean {
    const lat = row.lat != null ? Number(row.lat) : null;
    const lng = row.lng != null ? Number(row.lng) : null;
    if (lat != null && lng != null && coordinatesInJurisdiction(lat, lng, jurisdiction)) {
        return true;
    }
    const state = normalizeStateToUsps(String(row.userState ?? ''));
    return Boolean(state && jurisdiction.stateCode && state === jurisdiction.stateCode);
}

async function resolveAdminRecipientsForLocation(row: {
    lat?: number | null;
    lng?: number | null;
    userState?: string;
}): Promise<Array<{ id: string; role: string }>> {
    await connectDB();
    const admins = await User.find({
        role: { $in: [...ADMIN_ROLES] },
    })
        .select('_id role')
        .lean();

    const recipients: Array<{ id: string; role: string }> = [];

    for (const admin of admins) {
        const id = admin._id?.toString();
        const role = String((admin as { role?: string }).role ?? '');
        if (!id || !ADMIN_ROLES.has(role)) continue;

        if (role === 'sub-admin') {
            const jurisdiction = await resolveSubAdminJurisdiction(id);
            if (!jurisdiction || !locationInJurisdiction(row, jurisdiction)) continue;
        }

        recipients.push({ id, role });
    }

    return recipients;
}

function filterTabForCategory(category: CitizenActivityCategory): string {
    const filter = CITIZEN_ACTIVITY_CATEGORY_META[category]?.filter ?? 'all';
    return filter;
}

export async function notifyAdminsOfCitizenActivity(
    activity: ICitizenActivity & { _id?: { toString(): string } },
): Promise<void> {
    const activityId = activity._id?.toString();
    if (!activityId) return;

    if (activity.category === 'safe_checkin' && activity.resolutionStatus === 'completed') {
        return;
    }

    const category = activity.category;
    const filter = filterTabForCategory(category);
    const citizenName = activity.citizenName || 'Citizen';
    const location = activity.citizenAddress || activity.location || 'Unknown location';
    const title = activity.title || CITIZEN_ACTIVITY_CATEGORY_META[category]?.label || 'Citizen report';
    const priority: NotificationPriority =
        activity.priority === 'critical' ? 'critical' : activity.priority === 'high' ? 'high' : 'normal';

    const recipients = await resolveAdminRecipientsForLocation({
        lat: activity.lat,
        lng: activity.lng,
        userState: activity.userState,
    });

    await Promise.all(
        recipients.map((admin) =>
            dispatchUserNotification({
                userId: admin.id,
                type: 'citizen_activity',
                title: `New ${title}`,
                body: `${citizenName} · ${location}`,
                priority,
                deepLink: `/citizen-activity-feed?filter=${filter}`,
                audience: 'admin',
                meta: {
                    dedupeKey: `citizen_activity:${activityId}:${admin.id}`,
                    activityId,
                    category,
                },
                push: {
                    title: `New ${title}`,
                    body: `${citizenName} needs attention`,
                    data: {
                        screen: 'notifications',
                        notificationType: 'citizen_activity',
                        deepLink: `/citizen-activity-feed?filter=${filter}`,
                        activityId,
                    },
                },
            }),
        ),
    );
}

export async function notifyCitizenOfReportResolution(
    activity: ICitizenActivity & { _id?: { toString(): string } },
): Promise<void> {
    const userId = String(activity.userId ?? '');
    const activityId = activity._id?.toString();
    if (!userId || !activityId) return;

    const title = activity.title || 'Your report';
    await dispatchUserNotification({
        userId,
        type: 'citizen_report_resolved',
        title: `${title} resolved`,
        body: 'Emergency coordinators marked your request as completed.',
        priority: 'normal',
        deepLink: '',
        audience: 'citizen',
        meta: {
            dedupeKey: `citizen_resolved:${activityId}`,
            activityId,
        },
        push: {
            title: `${title} resolved`,
            body: 'Your request has been marked completed by coordinators.',
            data: {
                screen: 'notifications',
                notificationType: 'citizen_report_resolved',
                activityId,
            },
        },
    });
}

export async function listUserNotifications(
    userId: string,
    opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<UserNotificationListResponse> {
    await connectDB();
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const query: Record<string, unknown> = { userId };
    if (opts.unreadOnly) query.read = false;

    const [docs, unreadCount, total] = await Promise.all([
        UserNotification.find(query).sort({ createdAt: -1 }).limit(limit).lean(),
        UserNotification.countDocuments({ userId, read: false }),
        UserNotification.countDocuments({ userId }),
    ]);

    return {
        items: docs.map((doc) =>
            mapDocToItem(doc as IUserNotification & { _id: { toString(): string } }),
        ),
        unreadCount,
        total,
    };
}

export async function markNotificationRead(
    userId: string,
    notificationId: string,
): Promise<{ item: UserNotificationItem; unreadCount: number }> {
    await connectDB();
    const doc = await UserNotification.findOneAndUpdate(
        { _id: notificationId, userId },
        { $set: { read: true, readAt: new Date() } },
        { new: true },
    ).lean();
    if (!doc) throw new Error('NOT_FOUND');

    const unreadCount = await UserNotification.countDocuments({ userId, read: false });
    return {
        item: mapDocToItem(doc as IUserNotification & { _id: { toString(): string } }),
        unreadCount,
    };
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
    await connectDB();
    await UserNotification.updateMany({ userId, read: false }, { $set: { read: true, readAt: new Date() } });
    return 0;
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
    await connectDB();
    return UserNotification.countDocuments({ userId, read: false });
}
