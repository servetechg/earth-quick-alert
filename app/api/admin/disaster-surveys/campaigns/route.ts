import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import {
    createDisasterSurveyCampaign,
    dispatchDisasterSurveyCampaign,
    listDisasterSurveyCampaigns,
} from '@/lib/services/disaster-survey-service';
import type { DisasterSurveyTargetMode } from '@/lib/types/disaster-survey';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function assertAdmin(role: string) {
    return role === 'super-admin' || role === 'sub-admin';
}

function parseTargetMode(raw: unknown): DisasterSurveyTargetMode {
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

        const campaigns = await listDisasterSurveyCampaigns(role, String(session.user.id));
        return NextResponse.json({ campaigns });
    } catch (e) {
        console.error('GET admin/disaster-surveys/campaigns:', e);
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
        };
        if (!body.title?.trim()) {
            return NextResponse.json({ error: 'title is required' }, { status: 400 });
        }

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

        const campaign = await createDisasterSurveyCampaign({
            title: body.title,
            description: body.description,
            triggerType: 'manual',
            createdByUserId: String(session.user.id),
            targetMode,
            targetUserIds: targetMode === 'specific' ? userIds : undefined,
        });

        let dispatchResult = null;
        if (body.dispatch) {
            dispatchResult = await dispatchDisasterSurveyCampaign(String(campaign._id), {
                userIds: targetMode === 'specific' ? userIds : undefined,
                actorRole: role,
                actorUserId: String(session.user.id),
            });
        }

        return NextResponse.json({ campaign, dispatch: dispatchResult });
    } catch (e) {
        console.error('POST admin/disaster-surveys/campaigns:', e);
        return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }
}
