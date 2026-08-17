import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import {
    createIdaCampaign,
    dispatchIdaCampaign,
    listIdaCampaigns,
} from '@/lib/services/ida-service';
import type { IdaTargetMode } from '@/lib/types/ida';
import { IDA_DEFAULT_DESCRIPTION, IDA_DEFAULT_TITLE } from '@/lib/types/ida';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function assertAdmin(role: string) {
    return role === 'super-admin' || role === 'sub-admin';
}

function parseTargetMode(raw: unknown): IdaTargetMode {
    const v = String(raw ?? '').trim();
    if (v === 'specific' || v === 'all_scope' || v === 'alert_area') return v;
    return 'alert_area';
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const role = String(session.user.role ?? '').toLowerCase();
        if (!assertAdmin(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const campaigns = await listIdaCampaigns(role, String(session.user.id));
        return NextResponse.json({ campaigns });
    } catch (e) {
        console.error('GET admin/disaster-assistance/campaigns:', e);
        return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const role = String(session.user.role ?? '').toLowerCase();
        if (!assertAdmin(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = (await req.json()) as {
            title?: string;
            description?: string;
            dispatch?: boolean;
            targetMode?: string;
            userIds?: string[];
            disasterType?: string;
            disasterDate?: string;
            delayHours?: number;
            bypassDelay?: boolean;
        };

        const title = body.title?.trim() || IDA_DEFAULT_TITLE;
        const description = body.description?.trim() || IDA_DEFAULT_DESCRIPTION;
        const targetMode = parseTargetMode(body.targetMode);
        const userIds = Array.isArray(body.userIds)
            ? [...new Set(body.userIds.map((id) => String(id).trim()).filter(Boolean))]
            : undefined;

        if (targetMode === 'specific' && body.dispatch && (!userIds || userIds.length === 0)) {
            return NextResponse.json(
                { error: 'Select at least one user to dispatch' },
                { status: 400 },
            );
        }

        const campaign = await createIdaCampaign({
            title,
            description,
            triggerType: 'manual',
            createdByUserId: String(session.user.id),
            targetMode,
            targetUserIds: userIds,
            disasterType: body.disasterType,
            disasterDate: body.disasterDate,
            delayHours: body.delayHours,
            eligibleAt: body.bypassDelay || body.dispatch ? new Date() : undefined,
        });

        if (!body.dispatch) {
            return NextResponse.json({ campaign }, { status: 201 });
        }

        const result = await dispatchIdaCampaign(String(campaign._id), {
            userIds,
            actorRole: role,
            actorUserId: String(session.user.id),
        });

        return NextResponse.json({ campaign, ...result }, { status: 201 });
    } catch (e) {
        console.error('POST admin/disaster-assistance/campaigns:', e);
        return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }
}
