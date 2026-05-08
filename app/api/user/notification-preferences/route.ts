import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';
import {
  mergeNotificationPreferencesPatch,
  normalizeNotificationPreferences,
} from '@/lib/notification-preferences/defaults';

/** Stored on User — only push / sms / email plus alert-type toggles. */
type StoredNotificationPrefs = {
  push?: boolean;
  sms?: boolean;
  email?: boolean;
  majorAlerts?: boolean;
  minorAlerts?: boolean;
  aiReports?: boolean;
};

/** May include legacy keys still present in older Mongo documents. */
type NotificationPrefsDoc = StoredNotificationPrefs & {
  emailDigest?: boolean;
  smsAlerts?: boolean;
  pushAlerts?: boolean;
};

function isFalsey(v: unknown): boolean {
  return v === false || v === 'false';
}

function triAlert(
  incoming: Record<string, unknown>,
  key: keyof StoredNotificationPrefs,
  prev: NotificationPrefsDoc
): boolean {
  if (incoming[key] !== undefined) return !isFalsey(incoming[key]);
  if (prev[key] !== undefined) return !isFalsey(prev[key]);
  return true;
}

function mergePushSmsEmail(
  incoming: Record<string, unknown>,
  prev: NotificationPrefsDoc
): Pick<StoredNotificationPrefs, 'push' | 'sms' | 'email'> {
  let push: boolean;
  if (incoming.pushAlerts !== undefined) push = !isFalsey(incoming.pushAlerts);
  else if (incoming.push !== undefined) push = !isFalsey(incoming.push);
  else if (prev.push !== undefined) push = !isFalsey(prev.push);
  else if (prev.pushAlerts !== undefined) push = !isFalsey(prev.pushAlerts);
  else push = true;

  let sms: boolean;
  if (incoming.smsAlerts !== undefined) sms = !isFalsey(incoming.smsAlerts);
  else if (incoming.sms !== undefined) sms = !isFalsey(incoming.sms);
  else if (prev.sms !== undefined) sms = !isFalsey(prev.sms);
  else if (prev.smsAlerts !== undefined) sms = !isFalsey(prev.smsAlerts);
  else sms = true;

  let email: boolean;
  if (incoming.emailDigest !== undefined) email = !isFalsey(incoming.emailDigest);
  else if (incoming.email !== undefined) email = !isFalsey(incoming.email);
  else if (prev.email !== undefined) email = !isFalsey(prev.email);
  else if (prev.emailDigest !== undefined) email = prev.emailDigest === true;
  else email = true;

  return { push, sms, email };
}

function mergeNotificationPreferences(
  prev: NotificationPrefsDoc,
  incoming: Record<string, unknown>
): StoredNotificationPrefs {
  const { push, sms, email } = mergePushSmsEmail(incoming, prev);
  return {
    majorAlerts: triAlert(incoming, 'majorAlerts', prev),
    minorAlerts: triAlert(incoming, 'minorAlerts', prev),
    aiReports: triAlert(incoming, 'aiReports', prev),
    push,
    sms,
    email,
  };
}

/** API shape: includes UI aliases mapped from push / sms / email. */
function serializeNotificationPreferences(np: NotificationPrefsDoc | null | undefined) {
  const p = np || {};
  const push =
    p.push !== undefined
      ? !isFalsey(p.push)
      : p.pushAlerts !== undefined
        ? !isFalsey(p.pushAlerts)
        : true;
  const sms =
    p.sms !== undefined
      ? !isFalsey(p.sms)
      : p.smsAlerts !== undefined
        ? !isFalsey(p.smsAlerts)
        : true;
  const email =
    p.email !== undefined
      ? !isFalsey(p.email)
      : p.emailDigest !== undefined
        ? p.emailDigest === true
        : true;

  return {
    push,
    sms,
    email,
    majorAlerts: !isFalsey(p.majorAlerts),
    minorAlerts: !isFalsey(p.minorAlerts),
    aiReports: !isFalsey(p.aiReports),
    pushAlerts: push,
    smsAlerts: sms,
    emailDigest: email,
  };
}

function jsonFail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function buildPayload(user: Record<string, unknown>) {
  const raw = (user as { notificationPreferences?: NotificationPrefsDoc }).notificationPreferences;
  return {
    phoneNumber: (user as { phoneNumber?: string }).phoneNumber || '',
    email: (user as { email?: string }).email || '',
    notificationPreferences: serializeNotificationPreferences(raw),
  };
}

export async function GET() {
  try {
    await connectDB();
    const session = await getSession();

    if (!session?.user?.id) {
      return jsonFail('Unauthorized', 401);
    }

    const user = await User.findById(session.user.id)
      .select('notificationPreferences phoneNumber email')
      .lean<Record<string, unknown>>();

    if (!user) {
      return jsonFail('User not found', 404);
    }

    return NextResponse.json({ success: true, data: buildPayload(user) });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return jsonFail('Failed to fetch notification preferences', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await getSession();

    if (!session?.user?.id) {
      return jsonFail('Unauthorized', 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonFail('Invalid JSON body', 400);
    }

    const bodyObj = body as Record<string, unknown>;
    const existing = await User.findById(session.user.id)
      .select('notificationPreferences')
      .lean<{ notificationPreferences?: Record<string, unknown> }>();

    if (!existing) {
      return jsonFail('User not found', 404);
    }

    const currentPrefs = normalizeNotificationPreferences(existing.notificationPreferences);
    const rawPatch = bodyObj.notificationPreferences;
    const patch: Record<string, unknown> =
      rawPatch && typeof rawPatch === 'object' && !Array.isArray(rawPatch)
        ? (rawPatch as Record<string, unknown>)
        : {};

    const nextPrefs = mergeNotificationPreferencesPatch(currentPrefs, patch);

    const phoneNumber =
      typeof bodyObj.phoneNumber === 'string' ? bodyObj.phoneNumber.trim() : undefined;

    const setFlat: Record<string, unknown> = {};
    if (phoneNumber !== undefined) {
      setFlat.phoneNumber = phoneNumber;
    }
    const keys = [
      'push',
      'sms',
      'email',
      'majorAlerts',
      'minorAlerts',
      'aiReports',
      'pushAlerts',
      'smsAlerts',
      'emailDigest',
    ] as const;
    for (const k of keys) {
      setFlat[`notificationPreferences.${k}`] = nextPrefs[k];
    }

    const updated = await User.findByIdAndUpdate(session.user.id, { $set: setFlat }, { new: true })
      .select('notificationPreferences phoneNumber email')
      .lean<Record<string, unknown>>();

    if (!updated) {
      return jsonFail('User not found', 404);
    }

    const stored = (updated as { notificationPreferences?: NotificationPrefsDoc }).notificationPreferences;

    void recordActivity({
      userId: session.user.id,
      action: ACTIVITY_ACTIONS.NOTIFICATION_PREFS_UPDATE,
      label: 'Notification preferences updated',
      meta: {
        preferences: serializeNotificationPreferences(stored),
      },
    });

    return NextResponse.json({
      success: true,
      data: buildPayload(updated),
    });
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return jsonFail('Failed to save notification preferences', 500);
  }
}
