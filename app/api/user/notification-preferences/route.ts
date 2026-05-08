import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getSession } from '@/lib/auth';
import type { NotificationPreferencesGetData } from '@/lib/notification-preferences/types';
import {
    mergeNotificationPreferencesPatch,
    normalizeNotificationPreferences,
} from '@/lib/notification-preferences/defaults';

function jsonFail(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

function buildPayload(
    user: Record<string, unknown> | null
): NotificationPreferencesGetData | null {
    if (!user) return null;
    const prefs = normalizeNotificationPreferences(
        user.notificationPreferences as Record<string, unknown> | undefined
    );
    return {
        phoneNumber: typeof user.phoneNumber === 'string' ? user.phoneNumber : '',
        email: typeof user.email === 'string' ? user.email : '',
        notificationPreferences: prefs,
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

        const data = buildPayload(user);
        if (!data) return jsonFail('User not found', 404);

        return NextResponse.json({ success: true, data });
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

        const existing = await User.findById(session.user.id).select('notificationPreferences').lean<{
            notificationPreferences?: Record<string, unknown>;
        }>();

        if (!existing) {
            return jsonFail('User not found', 404);
        }

        const currentPrefs = normalizeNotificationPreferences(existing.notificationPreferences);
        const rawPatch = body.notificationPreferences;
        const patch: Record<string, unknown> =
            rawPatch && typeof rawPatch === 'object' ? (rawPatch as Record<string, unknown>) : {};

        const nextPrefs = mergeNotificationPreferencesPatch(currentPrefs, patch);

        const phoneNumber =
            typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : undefined;

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

        const updated = await User.findByIdAndUpdate(session.user.id, { $set: setFlat }, { new: true, runValidators: true })
            .select('notificationPreferences phoneNumber email')
            .lean<Record<string, unknown>>();

        if (!updated) {
            return jsonFail('User not found', 404);
        }

        const data = buildPayload(updated);
        if (!data) return jsonFail('User not found', 404);

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error saving notification preferences:', error);
        return jsonFail('Failed to save notification preferences', 500);
    }
}
