import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getSession } from '@/lib/auth';

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

export async function GET() {
  try {
    await connectDB();
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(session.user.id)
      .select('notificationPreferences phoneNumber email')
      .lean();

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const raw = (user as { notificationPreferences?: NotificationPrefsDoc }).notificationPreferences;

    return NextResponse.json({
      success: true,
      data: {
        phoneNumber: (user as { phoneNumber?: string }).phoneNumber || '',
        email: (user as { email?: string }).email || '',
        notificationPreferences: serializeNotificationPreferences(raw),
      },
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notification preferences' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const rawPrefs = body.notificationPreferences;
    const prefsIncoming: Record<string, unknown> =
      rawPrefs && typeof rawPrefs === 'object' && !Array.isArray(rawPrefs)
        ? (rawPrefs as Record<string, unknown>)
        : {};
    const phoneNumber =
      typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : undefined;

    const existing = await User.findById(session.user.id)
      .select('notificationPreferences phoneNumber')
      .lean();

    if (!existing) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const prevNP =
      (existing as { notificationPreferences?: NotificationPrefsDoc }).notificationPreferences ||
      {};

    const finalNP = mergeNotificationPreferences(prevNP, prefsIncoming);

    const updated = await User.findByIdAndUpdate(
      session.user.id,
      {
        ...(phoneNumber !== undefined ? { phoneNumber } : {}),
        notificationPreferences: finalNP,
      },
      { new: true, runValidators: true }
    )
      .select('notificationPreferences phoneNumber email')
      .lean();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const raw = (updated as { notificationPreferences?: NotificationPrefsDoc }).notificationPreferences;

    return NextResponse.json({
      success: true,
      data: {
        phoneNumber: (updated as { phoneNumber?: string }).phoneNumber || '',
        email: (updated as { email?: string }).email || '',
        notificationPreferences: serializeNotificationPreferences(raw),
      },
    });
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save notification preferences' },
      { status: 500 }
    );
  }
}
