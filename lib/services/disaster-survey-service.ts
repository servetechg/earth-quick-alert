import connectDB from '@/lib/mongodb';
import { sendDisasterSurveyInviteEmail } from '@/lib/email/disaster-survey-invite-send';
import { fetchPopulationAtRiskAlignedEventFeed } from '@/lib/services/alert-communication-aligned-feed';
import { dispatchUserNotification } from '@/lib/services/user-notification-service';
import {
    buildDisasterSurveyProfileSnapshot,
    normalizeStoredProfileSnapshot,
} from '@/lib/services/disaster-survey-profile-snapshot';
import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import { listUsersInAlignedAlertAreas } from '@/lib/services/users-in-aligned-alert-areas';
import {
    coordinatesInJurisdiction,
    resolveSubAdminJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import {
    DISASTER_IMMEDIATE_NEED_IDS,
    type DisasterImmediateNeedId,
    type DisasterSurveyFundingStatus,
    type DisasterSurveyTriggerType,
} from '@/lib/types/disaster-survey';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import DisasterSurveyCampaign from '@/models/DisasterSurveyCampaign';
import DisasterSurveyInvitation from '@/models/DisasterSurveyInvitation';
import DisasterSurveyResponse from '@/models/DisasterSurveyResponse';
import User from '@/models/User';
import UserProfile from '@/models/UserProfile';

const DISASTER_PUSH_SCREEN = 'disasterSurvey';
const AUTO_SEVERITY_PATTERN =
    /tornado warning|flash flood warning|hurricane warning|evacuation|major damage|disaster declaration/i;

export type SurveyTargetUser = {
    id: string;
    name: string;
    email: string;
    address: string;
    state: string;
    lat: number | null;
    lng: number | null;
    firstName: string;
    expoPushToken: string;
};

function displayName(user: { name?: string; firstName?: string; lastName?: string; email?: string }) {
    const full = String(user.name ?? '').trim();
    if (full) return full;
    const joined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return joined || String(user.email ?? 'User');
}

function mapDbUsersToTargets(
    users: Record<string, unknown>[],
    profileByUser: Map<string, { address?: UserProfilePayload['address'] }>,
): SurveyTargetUser[] {
    return users.map((u) => {
        const id = String(u._id);
        const profile = profileByUser.get(id);
        const address =
            formatProfileAddress(profile?.address ?? null) ?? String(u.location ?? '');
        const state =
            normalizeStateToUsps(String(profile?.address?.state ?? u.state ?? '')) ??
            String(u.state ?? '');
        return {
            id,
            name: displayName(u as Parameters<typeof displayName>[0]),
            email: String(u.email ?? ''),
            address,
            state,
            lat: u.lat != null ? Number(u.lat) : null,
            lng: u.lng != null ? Number(u.lng) : null,
            firstName: String(u.firstName ?? ''),
            expoPushToken: String(u.expoPushToken ?? ''),
        };
    });
}

async function loadUsersByIds(userIds: string[]): Promise<SurveyTargetUser[]> {
    const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return [];

    await connectDB();
    const users = (await User.find({
        _id: { $in: ids },
        role: 'user',
        accountStatus: 'approved',
    })
        .select('_id name firstName lastName email expoPushToken lat lng state city location')
        .lean()) as Record<string, unknown>[];

    const profiles = await UserProfile.find({ userId: { $in: ids } }).lean();
    const profileByUser = new Map(
        profiles.map((p) => [String(p.userId), p as { address?: UserProfilePayload['address'] }]),
    );

    return mapDbUsersToTargets(users, profileByUser);
}

async function loadTargetUsers(alignedRows: Record<string, unknown>[]): Promise<SurveyTargetUser[]> {
    const atRisk = await listUsersInAlignedAlertAreas(alignedRows);
    if (atRisk.length === 0) return [];

    await connectDB();
    const ids = atRisk.map((u) => u.id);
    return loadUsersByIds(ids);
}

export type DisasterSurveyTargetUserOption = {
    id: string;
    name: string;
    email: string;
    state: string;
    city: string;
};

export async function searchDisasterSurveyTargetUsers(
    query: string,
    limit = 25,
): Promise<DisasterSurveyTargetUserOption[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    await connectDB();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const users = (await User.find({
        role: 'user',
        accountStatus: 'approved',
        $or: [
            { email: regex },
            { name: regex },
            { firstName: regex },
            { lastName: regex },
        ],
    })
        .select('_id name firstName lastName email state city')
        .limit(Math.min(Math.max(limit, 1), 50))
        .lean()) as Record<string, unknown>[];

    return users.map((u) => ({
        id: String(u._id),
        name: displayName(u as Parameters<typeof displayName>[0]),
        email: String(u.email ?? ''),
        state: String(u.state ?? ''),
        city: String(u.city ?? ''),
    }));
}

function responseInJurisdiction(
    row: { userLat?: number | null; userLng?: number | null; userState?: string },
    jurisdiction: SubAdminJurisdiction,
): boolean {
    const lat = row.userLat != null ? Number(row.userLat) : null;
    const lng = row.userLng != null ? Number(row.userLng) : null;
    if (lat != null && lng != null && coordinatesInJurisdiction(lat, lng, jurisdiction)) {
        return true;
    }
    const state = normalizeStateToUsps(String(row.userState ?? ''));
    if (state && jurisdiction.stateCode && state === jurisdiction.stateCode) {
        return true;
    }
    return false;
}

async function sendInvitationNotifications(
    user: SurveyTargetUser,
    campaignTitle: string,
    invitationId: string,
    campaignId: string,
): Promise<{ pushOk: boolean; emailOk: boolean }> {
    const pushBody = `You may be eligible for disaster relief. Tap to complete your status survey for ${campaignTitle}.`;

    const inbox = await dispatchUserNotification({
        userId: user.id,
        type: 'disaster_survey',
        title: 'Disaster relief survey',
        body: pushBody,
        priority: 'high',
        audience: 'citizen',
        meta: {
            dedupeKey: `disaster_survey:${invitationId}`,
            invitationId,
            campaignId,
        },
        push: {
            title: 'Disaster relief survey',
            body: pushBody,
            data: {
                screen: DISASTER_PUSH_SCREEN,
                invitationId,
                campaignId,
            },
        },
    });

    const pushOk = Boolean(inbox) && Boolean(user.expoPushToken.trim());

    const emailOk = user.email
        ? await sendDisasterSurveyInviteEmail(user.email, user.firstName || user.name, campaignTitle)
        : false;

    return { pushOk, emailOk };
}

export async function createDisasterSurveyCampaign(input: {
    title: string;
    description?: string;
    triggerType?: DisasterSurveyTriggerType;
    sourceEventId?: string;
    eventSummary?: string;
    severity?: string;
    stateCodes?: string[];
    createdByUserId?: string;
    autoTriggerKey?: string;
    targetUserIds?: string[];
}) {
    await connectDB();
    const targetUserIds = [...new Set((input.targetUserIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const doc = await DisasterSurveyCampaign.create({
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        triggerType: input.triggerType ?? 'manual',
        sourceEventId: input.sourceEventId?.trim() ?? '',
        eventSummary: input.eventSummary?.trim() ?? '',
        severity: input.severity?.trim() ?? '',
        stateCodes: (input.stateCodes ?? []).map((s) => s.toUpperCase()),
        createdByUserId: input.createdByUserId ?? null,
        autoTriggerKey: input.autoTriggerKey?.trim() ?? '',
        targetUserIds,
        status: 'draft',
    });
    return doc.toObject();
}

async function resolveDispatchTargets(
    campaign: { targetUserIds?: unknown[] },
    overrideUserIds?: string[],
): Promise<SurveyTargetUser[]> {
    const override = [...new Set((overrideUserIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (override.length > 0) {
        return loadUsersByIds(override);
    }

    const stored = (campaign.targetUserIds ?? [])
        .map((id) => String(id))
        .filter(Boolean);
    if (stored.length > 0) {
        return loadUsersByIds(stored);
    }

    const alignedRows = await fetchPopulationAtRiskAlignedEventFeed({ role: 'super-admin' });
    return loadTargetUsers(alignedRows);
}

export async function dispatchDisasterSurveyCampaign(
    campaignId: string,
    options?: { userIds?: string[] },
) {
    await connectDB();
    const campaign = await DisasterSurveyCampaign.findById(campaignId);
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

    if (options?.userIds?.length) {
        campaign.targetUserIds = [...new Set(options.userIds.map((id) => id.trim()).filter(Boolean))];
        await campaign.save();
    }

    const targets = await resolveDispatchTargets(campaign, options?.userIds);

    let invited = 0;
    let pushSent = 0;
    let emailSent = 0;

    for (const user of targets) {
        const existing = await DisasterSurveyInvitation.findOne({
            campaignId: campaign._id,
            userId: user.id,
        }).lean();
        if (existing) continue;

        const invitation = await DisasterSurveyInvitation.create({
            campaignId: campaign._id,
            userId: user.id,
            userEmail: user.email,
            userState: user.state,
            userLat: user.lat,
            userLng: user.lng,
            status: 'pending',
        });

        const notify = await sendInvitationNotifications(
            user,
            campaign.title,
            String(invitation._id),
            String(campaign._id),
        );

        await DisasterSurveyInvitation.updateOne(
            { _id: invitation._id },
            {
                $set: {
                    pushSentAt: notify.pushOk ? new Date() : null,
                    emailSentAt: notify.emailOk ? new Date() : null,
                },
            },
        );

        invited += 1;
        if (notify.pushOk) pushSent += 1;
        if (notify.emailOk) emailSent += 1;
    }

    await DisasterSurveyCampaign.updateOne(
        { _id: campaign._id },
        {
            $set: {
                status: 'dispatched',
                dispatchedAt: new Date(),
                invitedCount: invited,
            },
        },
    );

    return { campaignId: String(campaign._id), invited, pushSent, emailSent };
}

export async function getActiveDisasterSurveyInvitation(userId: string) {
    await connectDB();
    const invitation = (await DisasterSurveyInvitation.findOne({
        userId,
        status: { $in: ['pending', 'opened'] },
    })
        .sort({ createdAt: -1 })
        .lean()) as {
        _id: unknown;
        campaignId: unknown;
        status: 'pending' | 'opened' | 'submitted';
    } | null;

    if (!invitation) return null;

    const campaign = (await DisasterSurveyCampaign.findById(invitation.campaignId)
        .select('title description status dispatchedAt')
        .lean()) as {
        title: string;
        description?: string;
        status: string;
        dispatchedAt?: Date;
    } | null;
    if (!campaign || campaign.status === 'closed') return null;

    return {
        invitationId: String(invitation._id),
        campaignId: String(invitation.campaignId),
        status: invitation.status,
        campaign: {
            title: campaign.title,
            description: campaign.description ?? '',
            dispatchedAt: campaign.dispatchedAt,
        },
    };
}

export async function markDisasterSurveyOpened(userId: string, invitationId: string) {
    await connectDB();
    await DisasterSurveyInvitation.updateOne(
        { _id: invitationId, userId, status: 'pending' },
        { $set: { status: 'opened', openedAt: new Date() } },
    );
}

async function buildProfileSnapshot(userId: string) {
    const profile = await UserProfile.findOne({ userId }).lean();
    return buildDisasterSurveyProfileSnapshot(profile as Parameters<typeof buildDisasterSurveyProfileSnapshot>[0]);
}

async function buildUserSnapshot(userId: string) {
    const user = (await User.findById(userId)
        .select('firstName lastName name email phone lat lng state city location')
        .lean()) as Record<string, unknown> | null;
    if (!user) throw new Error('USER_NOT_FOUND');
    const profile = (await UserProfile.findOne({ userId }).lean()) as {
        address?: UserProfilePayload['address'];
    } | null;
    const address =
        formatProfileAddress(profile?.address ?? null) ?? String(user.location ?? '');

    return {
        id: String(user._id),
        name: displayName(user as Parameters<typeof displayName>[0]),
        email: String(user.email ?? ''),
        phone: String(user.phone ?? ''),
        address,
        state: normalizeStateToUsps(String(user.state ?? '')) ?? String(user.state ?? ''),
        city: String(user.city ?? ''),
        lat: user.lat != null ? Number(user.lat) : null,
        lng: user.lng != null ? Number(user.lng) : null,
    };
}

export async function submitDisasterSurveyResponse(
    userId: string,
    input: {
        invitationId: string;
        immediateNeeds: DisasterImmediateNeedId[];
    },
) {
    await connectDB();

    const invitation = await DisasterSurveyInvitation.findOne({
        _id: input.invitationId,
        userId,
        status: { $in: ['pending', 'opened'] },
    });
    if (!invitation) throw new Error('INVITATION_NOT_FOUND');

    const existing = await DisasterSurveyResponse.findOne({ invitationId: invitation._id }).lean();
    if (existing) throw new Error('ALREADY_SUBMITTED');

    const needs = input.immediateNeeds.filter((n) =>
        (DISASTER_IMMEDIATE_NEED_IDS as readonly string[]).includes(n),
    );
    if (needs.length === 0) throw new Error('NEEDS_REQUIRED');

    const userSnapshot = await buildUserSnapshot(userId);
    const profileSnapshot = await buildProfileSnapshot(userId);
    const submittedAt = new Date();

    const response = await DisasterSurveyResponse.create({
        campaignId: invitation.campaignId,
        invitationId: invitation._id,
        userId,
        immediateNeeds: needs,
        profileSnapshot,
        userSnapshot,
        userState: userSnapshot.state,
        userLat: userSnapshot.lat,
        userLng: userSnapshot.lng,
        submittedAt,
    });

    await DisasterSurveyInvitation.updateOne(
        { _id: invitation._id },
        { $set: { status: 'submitted', submittedAt } },
    );

    await DisasterSurveyCampaign.updateOne(
        { _id: invitation.campaignId },
        { $inc: { responseCount: 1 } },
    );

    return {
        responseId: String(response._id),
        submittedAt: submittedAt.toISOString(),
    };
}

export async function listDisasterSurveyCampaigns(role: string, adminUserId?: string) {
    await connectDB();
    const campaigns = await DisasterSurveyCampaign.find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

    if (role === 'super-admin') {
        return campaigns.map((c) => ({
            id: String(c._id),
            title: c.title,
            description: c.description,
            triggerType: c.triggerType,
            status: c.status,
            sourceEventId: c.sourceEventId,
            eventSummary: c.eventSummary,
            severity: c.severity,
            invitedCount: c.invitedCount,
            responseCount: c.responseCount,
            targetUserCount: Array.isArray(c.targetUserIds) ? c.targetUserIds.length : 0,
            dispatchedAt: c.dispatchedAt,
            createdAt: c.createdAt,
        }));
    }

    if (role !== 'sub-admin' || !adminUserId) return [];

    const jurisdiction = await resolveSubAdminJurisdiction(adminUserId);
    if (!jurisdiction) return [];

    return campaigns
        .filter((c) => {
            if (!c.stateCodes?.length) return true;
            if (!jurisdiction.stateCode) return true;
            return c.stateCodes.includes(jurisdiction.stateCode);
        })
        .map((c) => ({
            id: String(c._id),
            title: c.title,
            description: c.description,
            triggerType: c.triggerType,
            status: c.status,
            sourceEventId: c.sourceEventId,
            eventSummary: c.eventSummary,
            severity: c.severity,
            invitedCount: c.invitedCount,
            responseCount: c.responseCount,
            dispatchedAt: c.dispatchedAt,
            createdAt: c.createdAt,
        }));
}

export async function listDisasterSurveyResponses(
    role: string,
    adminUserId: string | undefined,
    opts?: { campaignId?: string; fundingStatus?: DisasterSurveyFundingStatus },
) {
    await connectDB();
    const query: Record<string, unknown> = {};
    if (opts?.campaignId) query.campaignId = opts.campaignId;
    if (opts?.fundingStatus) query.fundingStatus = opts.fundingStatus;

    let jurisdiction: SubAdminJurisdiction | null = null;
    if (role === 'sub-admin' && adminUserId) {
        jurisdiction = await resolveSubAdminJurisdiction(adminUserId);
    }

    const rows = await DisasterSurveyResponse.find(query).sort({ submittedAt: -1 }).limit(500).lean();

    const filtered =
        role === 'super-admin' || !jurisdiction
            ? rows
            : rows.filter((r) =>
                  responseInJurisdiction(
                      {
                          userLat: r.userLat,
                          userLng: r.userLng,
                          userState: r.userState,
                      },
                      jurisdiction!,
                  ),
              );

    return filtered.map((r) => {
        const row = r as Record<string, unknown>;
        const snap = (row.userSnapshot ?? {}) as Record<string, unknown>;
        return {
            id: String(row._id),
            campaignId: String(row.campaignId),
            userId: String(row.userId),
            userName: String(snap.name ?? 'User'),
            userEmail: String(snap.email ?? ''),
            userState: String(row.userState ?? ''),
            immediateNeeds: (row.immediateNeeds as string[]) ?? [],
            fundingStatus: String(row.fundingStatus ?? 'pending'),
            submittedAt: row.submittedAt as Date,
        };
    });
}

export async function getDisasterSurveyResponseDetail(
    responseId: string,
    role: string,
    adminUserId?: string,
) {
    await connectDB();
    const row = (await DisasterSurveyResponse.findById(responseId).lean()) as Record<
        string,
        unknown
    > | null;
    if (!row) return null;

    if (role === 'sub-admin' && adminUserId) {
        const jurisdiction = await resolveSubAdminJurisdiction(adminUserId);
        if (
            jurisdiction &&
            !responseInJurisdiction(
                {
                    userLat: row.userLat as number | null,
                    userLng: row.userLng as number | null,
                    userState: String(row.userState ?? ''),
                },
                jurisdiction,
            )
        ) {
            return null;
        }
    } else if (role !== 'super-admin' && role !== 'sub-admin') {
        return null;
    }

    const userSnapshot = (row.userSnapshot ?? {}) as Record<string, unknown>;
    return {
        id: String(row._id),
        campaignId: String(row.campaignId),
        invitationId: String(row.invitationId),
        userId: String(row.userId),
        immediateNeeds: (row.immediateNeeds as string[]) ?? [],
        profileSnapshot: normalizeStoredProfileSnapshot(
            (row.profileSnapshot as Record<string, unknown>) ?? {},
        ),
        userSnapshot,
        fundingStatus: String(row.fundingStatus ?? 'pending'),
        fundingNotes: String(row.fundingNotes ?? ''),
        fundingReviewedAt: row.fundingReviewedAt as Date | undefined,
        submittedAt: row.submittedAt as Date,
    };
}

export async function updateDisasterSurveyFunding(
    responseId: string,
    reviewerId: string,
    input: { fundingStatus: DisasterSurveyFundingStatus; fundingNotes?: string },
) {
    await connectDB();
    const row = (await DisasterSurveyResponse.findByIdAndUpdate(
        responseId,
        {
            $set: {
                fundingStatus: input.fundingStatus,
                fundingNotes: input.fundingNotes?.trim() ?? '',
                fundingReviewedAt: new Date(),
                fundingReviewedBy: reviewerId,
            },
        },
        { new: true },
    ).lean()) as { _id: unknown; fundingStatus: string; fundingNotes?: string; fundingReviewedAt?: Date } | null;

    if (!row) throw new Error('RESPONSE_NOT_FOUND');
    return {
        id: String(row._id),
        fundingStatus: row.fundingStatus,
        fundingNotes: row.fundingNotes,
        fundingReviewedAt: row.fundingReviewedAt,
    };
}

function isAutoTriggerEvent(row: Record<string, unknown>): boolean {
    const text = [row.name, row.description, row.location, row.severity, row.headline]
        .filter(Boolean)
        .join(' ');
    return AUTO_SEVERITY_PATTERN.test(text);
}

export async function processAutoDisasterSurveyDispatch() {
    const rows = await fetchPopulationAtRiskAlignedEventFeed({ role: 'super-admin' });
    const qualifying = rows.filter(isAutoTriggerEvent);

    let campaignsCreated = 0;
    let dispatched = 0;

    for (const row of qualifying) {
        const eventId = String(row.id ?? row._id ?? row.sourceId ?? '').trim();
        const title = String(row.name ?? row.headline ?? 'Active disaster event').slice(0, 160);
        const autoTriggerKey = eventId || title.toLowerCase().slice(0, 80);

        const existing = await DisasterSurveyCampaign.findOne({
            autoTriggerKey,
            status: { $in: ['draft', 'dispatched'] },
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }).lean();
        if (existing) continue;

        const campaign = await createDisasterSurveyCampaign({
            title,
            description: String(row.description ?? '').slice(0, 500),
            triggerType: 'auto',
            sourceEventId: eventId,
            eventSummary: String(row.location ?? ''),
            severity: String(row.severity ?? ''),
            autoTriggerKey,
        });

        campaignsCreated += 1;
        await dispatchDisasterSurveyCampaign(String(campaign._id));
        dispatched += 1;
    }

    return { qualifyingEvents: qualifying.length, campaignsCreated, dispatched };
}
