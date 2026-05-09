import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DispatchSettings from '@/models/DispatchSettings';
import { getSession } from '@/lib/auth';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';

function canEditDispatchSettings(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin';
}

const DEFAULT_DISPATCH = {
    autoDispatchMajor: true,
    autoEscalateMinutes: '15',
    defaultChannel: 'all',
    region: 'western',
    messageTemplate:
        'EMERGENCY ALERT: {severity} {type} reported in {location}. {instructions} - Ready2Go Emergency Services.',
};

function normalizePayload(body: any) {
    const minutes = Number.parseInt(String(body?.autoEscalateMinutes ?? DEFAULT_DISPATCH.autoEscalateMinutes), 10);
    const safeMinutes = Number.isFinite(minutes) ? Math.min(240, Math.max(1, minutes)) : 15;

    return {
        autoDispatchMajor: Boolean(body?.autoDispatchMajor),
        autoEscalateMinutes: safeMinutes,
        defaultChannel: String(body?.defaultChannel || DEFAULT_DISPATCH.defaultChannel),
        region: String(body?.region || DEFAULT_DISPATCH.region),
        messageTemplate: String(body?.messageTemplate || DEFAULT_DISPATCH.messageTemplate).trim(),
    };
}

export async function GET() {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || !canEditDispatchSettings(session.user?.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const saved = await DispatchSettings.findOne().sort({ updatedAt: -1 }).lean();

        if (!saved) {
            return NextResponse.json({ success: true, data: DEFAULT_DISPATCH });
        }

        return NextResponse.json({
            success: true,
            data: {
                autoDispatchMajor: Boolean((saved as any).autoDispatchMajor),
                autoEscalateMinutes: String((saved as any).autoEscalateMinutes ?? DEFAULT_DISPATCH.autoEscalateMinutes),
                defaultChannel: String((saved as any).defaultChannel || DEFAULT_DISPATCH.defaultChannel),
                region: String((saved as any).region || DEFAULT_DISPATCH.region),
                messageTemplate: String((saved as any).messageTemplate || DEFAULT_DISPATCH.messageTemplate),
            },
        });
    } catch (error) {
        console.error('Error fetching dispatch settings:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch dispatch settings' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();

        if (!session || !canEditDispatchSettings(session.user?.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const normalized = normalizePayload(body);

        const updated = await DispatchSettings.findOneAndUpdate(
            {},
            { $set: { ...normalized, updatedBy: session.user.id } },
            { upsert: true, new: true, runValidators: true },
        ).lean();

        void recordActivity({
            userId: session.user.id,
            action: ACTIVITY_ACTIONS.DISPATCH_CONFIG_SAVE,
            label: 'Dispatch configuration saved',
            meta: {
                region: normalized.region,
                defaultChannel: normalized.defaultChannel,
                autoDispatchMajor: normalized.autoDispatchMajor,
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                autoDispatchMajor: Boolean((updated as any).autoDispatchMajor),
                autoEscalateMinutes: String((updated as any).autoEscalateMinutes),
                defaultChannel: String((updated as any).defaultChannel),
                region: String((updated as any).region),
                messageTemplate: String((updated as any).messageTemplate),
            },
        });
    } catch (error) {
        console.error('Error saving dispatch settings:', error);
        return NextResponse.json({ success: false, error: 'Failed to save dispatch settings' }, { status: 500 });
    }
}

