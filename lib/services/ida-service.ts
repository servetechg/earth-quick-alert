import connectDB from '@/lib/mongodb';
import {
    sendIdaClaimReceiptEmail,
    sendIdaInviteEmail,
    sendIdaMissingInfoEmail,
} from '@/lib/email/ida-send';
import { fetchPopulationAtRiskAlignedEventFeed } from '@/lib/services/alert-communication-aligned-feed';
import {
    loadUsersForAdminScope,
    searchDisasterSurveyTargetUsers,
} from '@/lib/services/disaster-survey-service';
import { buildIdaPrefill } from '@/lib/services/ida-prefill';
import { normalizeIdaDocuments } from '@/lib/services/ida-media-service';
import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';
import { sendExpoPushNotification } from '@/lib/services/mobile/expo-push-service';
import { dispatchUserNotification } from '@/lib/services/user-notification-service';
import { listUsersInAlignedAlertAreas } from '@/lib/services/users-in-aligned-alert-areas';
import {
    coordinatesInJurisdiction,
    resolveSubAdminJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import {
    IDA_DEFAULT_DELAY_HOURS,
    IDA_DEFAULT_DESCRIPTION,
    IDA_DEFAULT_TITLE,
    IDA_FINANCIAL_IMPACT_IDS,
    IDA_HOUSING_DAMAGE_IDS,
    IDA_IMMEDIATE_NEED_IDS,
    IDA_INSURANCE_TYPE_IDS,
    IDA_LIVING_SITUATION_IDS,
    IDA_MISSING_FIELD_IDS,
    IDA_SAFE_TO_LIVE_IDS,
    type IdaApplicantPrefill,
    type IdaApplicationStatus,
    type IdaDocumentRef,
    type IdaFinancialImpactId,
    type IdaHouseholdPrefill,
    type IdaHousingDamageId,
    type IdaImmediateNeedId,
    type IdaInsuranceTypeId,
    type IdaLivingSituationId,
    type IdaMissingFieldId,
    type IdaSafeToLiveId,
    type IdaTargetMode,
    type IdaTriggerType,
} from '@/lib/types/ida';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import IdaApplication from '@/models/IdaApplication';
import IdaCampaign from '@/models/IdaCampaign';
import IdaInvitation from '@/models/IdaInvitation';
import User from '@/models/User';
import UserProfile from '@/models/UserProfile';

const IDA_PUSH_SCREEN = 'idaApplication';
const AUTO_SEVERITY_PATTERN =
    /tornado warning|flash flood warning|hurricane warning|evacuation|major damage|disaster declaration|flood warning|wildfire|earthquake|tropical storm|severe thunderstorm warning/i;
/** Soft cap so a single dispatch request stays within serverless time limits. */
const MAX_SCOPE_TARGETS = 5000;
const AUTO_DEDUPE_DAYS = 14;
const AUTO_DISPATCH_BATCH = 40;
const AUTO_FEED_BATCH = 60;

const MISSING_FIELD_LABELS: Record<IdaMissingFieldId, string> = {
    documents: 'supporting documents',
    insurance_company: 'insurance company name',
    current_location: 'current location',
};

export type IdaTargetUser = {
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

export async function searchIdaTargetUsers(query: string, limit = 25) {
    return searchDisasterSurveyTargetUsers(query, limit);
}

function displayName(user: { name?: string; firstName?: string; lastName?: string; email?: string }) {
    const full = String(user.name ?? '').trim();
    if (full) return full;
    const joined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return joined || String(user.email ?? 'User');
}

function mapDbUsersToTargets(
    users: Record<string, unknown>[],
    profileByUser: Map<string, { address?: UserProfilePayload['address'] }>,
): IdaTargetUser[] {
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

async function loadUsersByIds(userIds: string[]): Promise<IdaTargetUser[]> {
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

async function loadTargetUsers(alignedRows: Record<string, unknown>[]): Promise<IdaTargetUser[]> {
    const atRisk = await listUsersInAlignedAlertAreas(alignedRows);
    if (atRisk.length === 0) return [];

    await connectDB();
    const ids = atRisk.map((u) => u.id);
    return loadUsersByIds(ids);
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

function generateClaimNumber(): string {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `IDA-${y}${m}${day}-${rand}`;
}

function isValidEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function filterEnumList<T extends string>(values: unknown, allowed: readonly T[]): T[] {
    if (!Array.isArray(values)) return [];
    return values.filter((v): v is T => isValidEnum(v, allowed));
}

async function resolveDispatchTargets(
    campaign: {
        targetMode?: string;
        targetUserIds?: unknown[];
        createdByUserId?: unknown;
    },
    options?: {
        userIds?: string[];
        actorRole?: string;
        actorUserId?: string;
    },
): Promise<IdaTargetUser[]> {
    const mode = (campaign.targetMode || 'alert_area') as IdaTargetMode;
    const override = [...new Set((options?.userIds ?? []).map((id) => id.trim()).filter(Boolean))];

    if (mode === 'specific' || override.length > 0) {
        if (override.length > 0) return loadUsersByIds(override);
        const stored = (campaign.targetUserIds ?? []).map((id) => String(id)).filter(Boolean);
        return loadUsersByIds(stored);
    }

    if (mode === 'all_scope') {
        const role = String(options?.actorRole ?? '').toLowerCase();
        const actorId =
            String(options?.actorUserId ?? '').trim() ||
            String(campaign.createdByUserId ?? '').trim();
        if (!actorId) return [];
        const scoped = await loadUsersForAdminScope(role || 'super-admin', actorId);
        return scoped as IdaTargetUser[];
    }

    const alignedRows = await fetchPopulationAtRiskAlignedEventFeed({
        role: (options?.actorRole as 'super-admin' | 'sub-admin') || 'super-admin',
        userId: options?.actorUserId,
    });
    return loadTargetUsers(alignedRows);
}

async function sendInvitationNotifications(
    user: IdaTargetUser,
    campaignTitle: string,
    invitationId: string,
    campaignId: string,
): Promise<{ pushOk: boolean; emailOk: boolean }> {
    const pushBody = `If your property was damaged, complete the Initial Disaster Assistance Application for ${campaignTitle}.`;

    await dispatchUserNotification({
        userId: user.id,
        type: 'ida_application',
        title: 'Initial Disaster Assistance',
        body: pushBody,
        priority: 'high',
        audience: 'citizen',
        skipPush: true,
        meta: {
            dedupeKey: `ida_application:${invitationId}`,
            invitationId,
            campaignId,
        },
    });

    let pushOk = false;
    let pushToken = String(user.expoPushToken ?? '').trim();
    if (!pushToken) {
        await connectDB();
        const fresh = await User.findById(user.id).select('expoPushToken').lean();
        pushToken = String((fresh as { expoPushToken?: string } | null)?.expoPushToken ?? '').trim();
    }

    if (pushToken) {
        const push = await sendExpoPushNotification({
            to: pushToken,
            title: 'Initial Disaster Assistance',
            body: pushBody,
            sound: 'default',
            channelId: 'default',
            priority: 'high',
            data: {
                screen: IDA_PUSH_SCREEN,
                notificationType: 'ida_application',
                invitationId,
                campaignId,
            },
        });
        pushOk = push.ok;
        if (!push.ok) {
            console.warn('[ida] Expo push failed:', user.id, push.error);
        }
    } else {
        console.warn('[ida] No expoPushToken for user:', user.id, user.email);
    }

    const emailOk = user.email
        ? await sendIdaInviteEmail(user.email, user.firstName || user.name, campaignTitle)
        : false;

    return { pushOk, emailOk };
}

async function buildUserSnapshot(userId: string) {
    const user = (await User.findById(userId)
        .select('firstName lastName name email phone phoneNumber lat lng state city location')
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
        phone: String(user.phoneNumber ?? user.phone ?? ''),
        address,
        state: normalizeStateToUsps(String(user.state ?? '')) ?? String(user.state ?? ''),
        city: String(user.city ?? ''),
        lat: user.lat != null ? Number(user.lat) : null,
        lng: user.lng != null ? Number(user.lng) : null,
    };
}

function mergeApplicant(
    base: IdaApplicantPrefill,
    patch?: Partial<IdaApplicantPrefill>,
): IdaApplicantPrefill {
    if (!patch) return { ...base };
    return {
        fullName: String(patch.fullName ?? base.fullName ?? '').trim() || base.fullName,
        dateOfBirth: String(patch.dateOfBirth ?? base.dateOfBirth ?? '').trim(),
        phoneNumber: String(patch.phoneNumber ?? base.phoneNumber ?? '').trim(),
        email: String(patch.email ?? base.email ?? '').trim(),
        preferredContactMethod: String(
            patch.preferredContactMethod ?? base.preferredContactMethod ?? '',
        ).trim(),
        currentLocation: String(patch.currentLocation ?? base.currentLocation ?? '').trim(),
        lat: patch.lat !== undefined ? patch.lat : base.lat,
        lng: patch.lng !== undefined ? patch.lng : base.lng,
        preferredLanguage: String(patch.preferredLanguage ?? base.preferredLanguage ?? '').trim(),
    };
}

function mergeHousehold(
    base: IdaHouseholdPrefill,
    patch?: Partial<IdaHouseholdPrefill>,
): IdaHouseholdPrefill {
    if (!patch) return { ...base };
    return {
        disasterAffectedAddress: String(
            patch.disasterAffectedAddress ?? base.disasterAffectedAddress ?? '',
        ).trim(),
        isPrimaryResidence:
            patch.isPrimaryResidence !== undefined
                ? patch.isPrimaryResidence
                : base.isPrimaryResidence,
        householdSize:
            patch.householdSize !== undefined ? patch.householdSize : base.householdSize,
        adults: patch.adults !== undefined ? patch.adults : base.adults,
        children: patch.children !== undefined ? patch.children : base.children,
        seniors: patch.seniors !== undefined ? patch.seniors : base.seniors,
        disabilitiesOrAccessNeeds: String(
            patch.disabilitiesOrAccessNeeds ?? base.disabilitiesOrAccessNeeds ?? '',
        ).trim(),
        electricityDependentMedical: String(
            patch.electricityDependentMedical ?? base.electricityDependentMedical ?? '',
        ).trim(),
        petsOrLivestock: String(patch.petsOrLivestock ?? base.petsOrLivestock ?? '').trim(),
    };
}

function buildClaimSummaryLines(app: {
    housingDamage: string;
    safeToLive: string;
    livingSituation: string;
    immediateNeeds: string[];
    financialImpact: string;
    disasterType?: string;
    dateOfImpact?: string;
    claimNumber?: string;
}): string[] {
    return [
        `Disaster type: ${app.disasterType || '—'}`,
        `Date of impact: ${app.dateOfImpact || '—'}`,
        `Housing damage: ${app.housingDamage}`,
        `Safe to live: ${app.safeToLive}`,
        `Living situation: ${app.livingSituation}`,
        `Immediate needs: ${(app.immediateNeeds ?? []).join(', ') || '—'}`,
        `Financial impact: ${app.financialImpact}`,
    ];
}

function detectMissingIdaFields(row: {
    documents?: IdaDocumentRef[] | null;
    insuranceCompany?: string | null;
    currentLocation?: string | null;
}): IdaMissingFieldId[] {
    const missing: IdaMissingFieldId[] = [];
    if (!Array.isArray(row.documents) || row.documents.length === 0) {
        missing.push('documents');
    }
    if (!String(row.insuranceCompany ?? '').trim()) {
        missing.push('insurance_company');
    }
    if (!String(row.currentLocation ?? '').trim()) {
        missing.push('current_location');
    }
    return missing;
}

function parseEventEndMs(row: Record<string, unknown>): number | null {
    const props = (row.properties ?? {}) as Record<string, unknown>;
    const category = String(row.category ?? '').trim();
    const catBlock = (props[category] ?? props.hurricane_typhoon ?? {}) as Record<string, unknown>;

    const candidates = [
        row.expiresAt,
        row.endsAt,
        row.expireTime,
        catBlock?.endsAt,
        catBlock?.expiresAt,
        catBlock?.incidentEndDate,
    ];

    for (const c of candidates) {
        if (c == null) continue;
        const s = String(c).trim();
        if (!s || /^see\b/i.test(s)) continue;
        const ms = Date.parse(s);
        if (Number.isFinite(ms)) return ms;
    }
    return null;
}

function isAutoTriggerEvent(row: Record<string, unknown>): boolean {
    const text = [row.name, row.description, row.location, row.severity, row.headline, row.type]
        .filter(Boolean)
        .join(' ');
    return AUTO_SEVERITY_PATTERN.test(text);
}

function mapCampaignListItem(c: Record<string, unknown>) {
    return {
        id: String(c._id),
        title: c.title,
        description: c.description,
        triggerType: c.triggerType,
        status: c.status,
        sourceEventId: c.sourceEventId,
        eventSummary: c.eventSummary,
        severity: c.severity,
        disasterType: c.disasterType,
        disasterDate: c.disasterDate,
        delayHours: c.delayHours,
        eligibleAt: c.eligibleAt,
        invitedCount: c.invitedCount,
        responseCount: c.responseCount,
        targetMode: (c.targetMode as string) || 'alert_area',
        targetUserCount: Array.isArray(c.targetUserIds) ? c.targetUserIds.length : 0,
        dispatchedAt: c.dispatchedAt,
        createdAt: c.createdAt,
    };
}

export async function createIdaCampaign(input: {
    title?: string;
    description?: string;
    triggerType?: IdaTriggerType;
    sourceEventId?: string;
    eventSummary?: string;
    severity?: string;
    disasterType?: string;
    disasterDate?: string;
    delayHours?: number;
    eligibleAt?: Date | string | null;
    stateCodes?: string[];
    createdByUserId?: string;
    autoTriggerKey?: string;
    targetMode?: IdaTargetMode;
    targetUserIds?: string[];
}) {
    await connectDB();
    const targetUserIds = [
        ...new Set((input.targetUserIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    const targetMode: IdaTargetMode =
        input.targetMode === 'specific' || input.targetMode === 'all_scope'
            ? input.targetMode
            : targetUserIds.length > 0
              ? 'specific'
              : 'alert_area';

    const title = String(input.title ?? '').trim() || IDA_DEFAULT_TITLE;
    const description = String(input.description ?? '').trim() || IDA_DEFAULT_DESCRIPTION;
    const delayHours =
        typeof input.delayHours === 'number' && Number.isFinite(input.delayHours)
            ? Math.max(0, input.delayHours)
            : IDA_DEFAULT_DELAY_HOURS;

    let eligibleAt: Date | null = null;
    if (input.eligibleAt != null && input.eligibleAt !== '') {
        const parsed = new Date(input.eligibleAt);
        if (Number.isFinite(parsed.getTime())) eligibleAt = parsed;
    }

    const doc = await IdaCampaign.create({
        title,
        description,
        triggerType: input.triggerType ?? 'manual',
        sourceEventId: input.sourceEventId?.trim() ?? '',
        eventSummary: input.eventSummary?.trim() ?? '',
        severity: input.severity?.trim() ?? '',
        disasterType: input.disasterType?.trim() ?? '',
        disasterDate: input.disasterDate?.trim() ?? '',
        delayHours,
        eligibleAt,
        stateCodes: (input.stateCodes ?? []).map((s) => s.toUpperCase()),
        createdByUserId: input.createdByUserId ?? null,
        autoTriggerKey: input.autoTriggerKey?.trim() ?? '',
        targetMode,
        targetUserIds: targetMode === 'specific' ? targetUserIds : [],
        status: 'draft',
    });
    return doc.toObject();
}

export async function dispatchIdaCampaign(
    campaignId: string,
    options?: { userIds?: string[]; actorRole?: string; actorUserId?: string },
) {
    await connectDB();
    const campaign = await IdaCampaign.findById(campaignId);
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

    if (options?.userIds?.length) {
        campaign.targetUserIds = [...new Set(options.userIds.map((id) => id.trim()).filter(Boolean))];
        campaign.targetMode = 'specific';
        await campaign.save();
    }

    const targets = await resolveDispatchTargets(campaign, options);
    const capped =
        targets.length > MAX_SCOPE_TARGETS ? targets.slice(0, MAX_SCOPE_TARGETS) : targets;

    let invited = 0;
    let pushSent = 0;
    let emailSent = 0;

    for (const user of capped) {
        const existing = (await IdaInvitation.findOne({
            campaignId: campaign._id,
            userId: user.id,
        }).lean()) as {
            _id: unknown;
            status?: string;
            pushSentAt?: Date | null;
            emailSentAt?: Date | null;
        } | null;

        if (existing) {
            const canRetryPush =
                !existing.pushSentAt &&
                (existing.status === 'pending' || existing.status === 'opened');
            if (!canRetryPush) continue;

            const notify = await sendInvitationNotifications(
                user,
                campaign.title,
                String(existing._id),
                String(campaign._id),
            );
            await IdaInvitation.updateOne(
                { _id: existing._id },
                {
                    $set: {
                        ...(notify.pushOk ? { pushSentAt: new Date() } : {}),
                        ...(notify.emailOk && !existing.emailSentAt
                            ? { emailSentAt: new Date() }
                            : {}),
                    },
                },
            );
            if (notify.pushOk) pushSent += 1;
            if (notify.emailOk && !existing.emailSentAt) emailSent += 1;
            continue;
        }

        const invitation = await IdaInvitation.create({
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

        await IdaInvitation.updateOne(
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

    await IdaCampaign.updateOne(
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

export async function listIdaCampaigns(role: string, adminUserId?: string) {
    await connectDB();
    const campaigns = (await IdaCampaign.find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()) as Record<string, unknown>[];

    if (role === 'super-admin') {
        return campaigns.map(mapCampaignListItem);
    }

    if (role !== 'sub-admin' || !adminUserId) return [];

    const jurisdiction = await resolveSubAdminJurisdiction(adminUserId);
    if (!jurisdiction) return [];

    return campaigns
        .filter((c) => {
            if (String(c.createdByUserId ?? '') === adminUserId) return true;
            const stateCodes = Array.isArray(c.stateCodes) ? (c.stateCodes as string[]) : [];
            if (!stateCodes.length) return true;
            if (!jurisdiction.stateCode) return true;
            return stateCodes.includes(jurisdiction.stateCode);
        })
        .map(mapCampaignListItem);
}

export async function getActiveIdaInvitation(userId: string) {
    await connectDB();
    const invitation = (await IdaInvitation.findOne({
        userId,
        status: { $in: ['pending', 'opened', 'needs_info'] },
    })
        .sort({ createdAt: -1 })
        .lean()) as {
        _id: unknown;
        campaignId: unknown;
        status: 'pending' | 'opened' | 'submitted' | 'needs_info';
    } | null;

    if (!invitation) return null;

    const campaign = (await IdaCampaign.findById(invitation.campaignId)
        .select(
            'title description status dispatchedAt disasterType disasterDate delayHours eligibleAt',
        )
        .lean()) as {
        title: string;
        description?: string;
        status: string;
        dispatchedAt?: Date;
        disasterType?: string;
        disasterDate?: string;
        delayHours?: number;
        eligibleAt?: Date | null;
    } | null;
    if (!campaign || campaign.status === 'closed') return null;

    const prefill = await buildIdaPrefill(userId, {
        disasterType: campaign.disasterType,
        dateOfImpact: campaign.disasterDate,
    });

    let applicationId: string | undefined;
    let requestedMissingFields: IdaMissingFieldId[] = [];
    let existingDocuments: Array<{ kind: string; fileName: string; url: string }> = [];
    let existingInsuranceCompany = '';
    let existingCurrentLocation = '';

    if (invitation.status === 'needs_info') {
        const application = (await IdaApplication.findOne({
            invitationId: invitation._id,
            userId,
        }).lean()) as Record<string, unknown> | null;
        if (application) {
            applicationId = String(application._id);
            const docs = normalizeIdaDocuments(application.documents);
            requestedMissingFields = Array.isArray(application.requestedMissingFields)
                ? (application.requestedMissingFields as IdaMissingFieldId[]).filter((f) =>
                      (IDA_MISSING_FIELD_IDS as readonly string[]).includes(f),
                  )
                : detectMissingIdaFields({
                      documents: docs,
                      insuranceCompany: String(application.insuranceCompany ?? ''),
                      currentLocation: String(application.currentLocation ?? ''),
                  });
            existingDocuments = docs.map((d) => ({
                kind: d.kind,
                fileName: d.fileName,
                url: d.url,
            }));
            existingInsuranceCompany = String(application.insuranceCompany ?? '');
            existingCurrentLocation = String(application.currentLocation ?? '');
        }
    }

    return {
        invitationId: String(invitation._id),
        campaignId: String(invitation.campaignId),
        status: invitation.status,
        campaign: {
            title: campaign.title,
            description: campaign.description ?? '',
            dispatchedAt: campaign.dispatchedAt,
            disasterType: campaign.disasterType ?? '',
            disasterDate: campaign.disasterDate ?? '',
        },
        prefill: {
            applicant: prefill.applicant,
            household: prefill.household,
            disaster: prefill.disaster,
        },
        ...(applicationId
            ? {
                  applicationId,
                  requestedMissingFields,
                  existingDocuments,
                  existingDocumentsSummary: {
                      count: existingDocuments.length,
                      kinds: [...new Set(existingDocuments.map((d) => d.kind))],
                  },
                  existingInsuranceCompany,
                  existingCurrentLocation,
              }
            : {}),
    };
}

export async function markIdaOpened(userId: string, invitationId: string) {
    await connectDB();
    await IdaInvitation.updateOne(
        { _id: invitationId, userId, status: 'pending' },
        { $set: { status: 'opened', openedAt: new Date() } },
    );
}

export async function submitIdaApplication(
    userId: string,
    input: {
        invitationId: string;
        applicant?: Partial<IdaApplicantPrefill>;
        household?: Partial<IdaHouseholdPrefill>;
        didEvacuate?: boolean | null;
        currentLocation?: string;
        homeAccessible?: boolean | null;
        housingDamage: IdaHousingDamageId;
        safeToLive: IdaSafeToLiveId;
        livingSituation: IdaLivingSituationId;
        livingSituationOther?: string;
        immediateNeeds: IdaImmediateNeedId[];
        immediateNeedsOther?: string;
        insuranceTypes: IdaInsuranceTypeId[];
        insuranceCompany?: string;
        contactedInsurance?: boolean | null;
        financialImpact: IdaFinancialImpactId;
        documents?: unknown[];
        lat?: number;
        lng?: number;
    },
) {
    await connectDB();

    const invitation = await IdaInvitation.findOne({
        _id: input.invitationId,
        userId,
        status: { $in: ['pending', 'opened'] },
    });
    if (!invitation) throw new Error('INVITATION_NOT_FOUND');

    const existing = await IdaApplication.findOne({ invitationId: invitation._id }).lean();
    if (existing) throw new Error('ALREADY_SUBMITTED');

    if (!isValidEnum(input.housingDamage, IDA_HOUSING_DAMAGE_IDS)) {
        throw new Error('HOUSING_DAMAGE_REQUIRED');
    }
    if (!isValidEnum(input.safeToLive, IDA_SAFE_TO_LIVE_IDS)) {
        throw new Error('SAFE_TO_LIVE_REQUIRED');
    }
    if (!isValidEnum(input.livingSituation, IDA_LIVING_SITUATION_IDS)) {
        throw new Error('LIVING_SITUATION_REQUIRED');
    }
    if (!isValidEnum(input.financialImpact, IDA_FINANCIAL_IMPACT_IDS)) {
        throw new Error('FINANCIAL_IMPACT_REQUIRED');
    }

    const immediateNeeds = filterEnumList(input.immediateNeeds, IDA_IMMEDIATE_NEED_IDS);
    if (immediateNeeds.length < 1) throw new Error('IMMEDIATE_NEEDS_REQUIRED');

    const insuranceTypes = filterEnumList(input.insuranceTypes, IDA_INSURANCE_TYPE_IDS);
    if (insuranceTypes.length < 1) throw new Error('INSURANCE_TYPES_REQUIRED');

    const campaign = (await IdaCampaign.findById(invitation.campaignId)
        .select('disasterType disasterDate title')
        .lean()) as {
        disasterType?: string;
        disasterDate?: string;
        title?: string;
    } | null;

    const prefill = await buildIdaPrefill(userId, {
        disasterType: campaign?.disasterType,
        dateOfImpact: campaign?.disasterDate,
    });
    const applicant = mergeApplicant(prefill.applicant, input.applicant);
    const household = mergeHousehold(prefill.household, input.household);
    if (input.currentLocation != null) {
        applicant.currentLocation = String(input.currentLocation).trim();
    }
    if (typeof input.lat === 'number' && Number.isFinite(input.lat)) {
        applicant.lat = input.lat;
    }
    if (typeof input.lng === 'number' && Number.isFinite(input.lng)) {
        applicant.lng = input.lng;
    }

    const documents = normalizeIdaDocuments(input.documents);
    const userSnapshot = await buildUserSnapshot(userId);
    const submittedAt = new Date();
    const claimNumber = generateClaimNumber();

    const application = await IdaApplication.create({
        campaignId: invitation.campaignId,
        invitationId: invitation._id,
        userId,
        claimNumber,
        applicant,
        household,
        disasterType: prefill.disaster.disasterType,
        dateOfImpact: prefill.disaster.dateOfImpact,
        didEvacuate: input.didEvacuate ?? null,
        currentLocation: String(input.currentLocation ?? applicant.currentLocation ?? '').trim(),
        homeAccessible: input.homeAccessible ?? null,
        housingDamage: input.housingDamage,
        safeToLive: input.safeToLive,
        livingSituation: input.livingSituation,
        livingSituationOther: String(input.livingSituationOther ?? '').trim().slice(0, 500),
        immediateNeeds,
        immediateNeedsOther: String(input.immediateNeedsOther ?? '').trim().slice(0, 500),
        insuranceTypes,
        insuranceCompany: String(input.insuranceCompany ?? '').trim().slice(0, 200),
        contactedInsurance: input.contactedInsurance ?? null,
        financialImpact: input.financialImpact,
        documents,
        profileSnapshot: prefill.profileSnapshot,
        userSnapshot,
        applicationStatus: 'pending',
        submittedAt,
        userState: userSnapshot.state,
        userLat:
            typeof input.lat === 'number' && Number.isFinite(input.lat)
                ? input.lat
                : userSnapshot.lat,
        userLng:
            typeof input.lng === 'number' && Number.isFinite(input.lng)
                ? input.lng
                : userSnapshot.lng,
    });

    await IdaInvitation.updateOne(
        { _id: invitation._id },
        { $set: { status: 'submitted', submittedAt } },
    );

    await IdaCampaign.updateOne({ _id: invitation.campaignId }, { $inc: { responseCount: 1 } });

    const receiptEmail = String(applicant.email || userSnapshot.email || '').trim();
    if (receiptEmail) {
        await sendIdaClaimReceiptEmail(
            receiptEmail,
            applicant.fullName || userSnapshot.name,
            claimNumber,
            buildClaimSummaryLines({
                housingDamage: input.housingDamage,
                safeToLive: input.safeToLive,
                livingSituation: input.livingSituation,
                immediateNeeds,
                financialImpact: input.financialImpact,
                disasterType: prefill.disaster.disasterType,
                dateOfImpact: prefill.disaster.dateOfImpact,
            }),
        );
    }

    return {
        claimNumber,
        applicationId: String(application._id),
        submittedAt: submittedAt.toISOString(),
    };
}

export async function supplementIdaApplication(
    userId: string,
    input: {
        invitationId: string;
        documents?: unknown[];
        insuranceCompany?: string;
        currentLocation?: string;
    },
) {
    await connectDB();

    const invitation = await IdaInvitation.findOne({
        _id: input.invitationId,
        userId,
        status: 'needs_info',
    });
    if (!invitation) throw new Error('INVITATION_NOT_FOUND');

    const application = await IdaApplication.findOne({
        invitationId: invitation._id,
        userId,
    });
    if (!application) throw new Error('APPLICATION_NOT_FOUND');

    const requested = Array.isArray(application.requestedMissingFields)
        ? (application.requestedMissingFields as IdaMissingFieldId[]).filter((f) =>
              (IDA_MISSING_FIELD_IDS as readonly string[]).includes(f),
          )
        : detectMissingIdaFields({
              documents: normalizeIdaDocuments(application.documents),
              insuranceCompany: application.insuranceCompany,
              currentLocation: application.currentLocation,
          });

    const setDoc: Record<string, unknown> = {};

    if (requested.includes('documents') && input.documents) {
        const merged = normalizeIdaDocuments([
            ...normalizeIdaDocuments(application.documents),
            ...normalizeIdaDocuments(input.documents),
        ]);
        setDoc.documents = merged;
    }

    if (requested.includes('insurance_company') && typeof input.insuranceCompany === 'string') {
        const company = input.insuranceCompany.trim().slice(0, 200);
        if (company) setDoc.insuranceCompany = company;
    }

    if (requested.includes('current_location') && typeof input.currentLocation === 'string') {
        const loc = input.currentLocation.trim().slice(0, 500);
        if (loc) setDoc.currentLocation = loc;
    }

    if (Object.keys(setDoc).length === 0) {
        throw new Error('NO_SUPPLEMENT_DATA');
    }

    await IdaApplication.updateOne({ _id: application._id }, { $set: setDoc });

    const refreshed = (await IdaApplication.findById(application._id).lean()) as Record<
        string,
        unknown
    > | null;
    const stillMissing = detectMissingIdaFields({
        documents: normalizeIdaDocuments(refreshed?.documents),
        insuranceCompany: String(refreshed?.insuranceCompany ?? ''),
        currentLocation: String(refreshed?.currentLocation ?? ''),
    }).filter((field) => requested.includes(field));

    if (stillMissing.length === 0) {
        await IdaApplication.updateOne(
            { _id: application._id },
            {
                $set: {
                    requestedMissingFields: [],
                    missingInfoRequestedAt: null,
                    applicationStatus: 'in_review',
                },
            },
        );
        await IdaInvitation.updateOne(
            { _id: invitation._id },
            { $set: { status: 'submitted' } },
        );
    } else {
        await IdaApplication.updateOne(
            { _id: application._id },
            { $set: { requestedMissingFields: stillMissing } },
        );
    }

    return {
        applicationId: String(application._id),
        remainingMissingFields: stillMissing,
        completed: stillMissing.length === 0,
    };
}

export async function listIdaApplications(
    role: string,
    adminUserId: string | undefined,
    statusFilter?: IdaApplicationStatus,
) {
    await connectDB();
    const query: Record<string, unknown> = {};
    if (statusFilter) query.applicationStatus = statusFilter;

    let jurisdiction: SubAdminJurisdiction | null = null;
    if (role === 'sub-admin' && adminUserId) {
        jurisdiction = await resolveSubAdminJurisdiction(adminUserId);
    }

    const rows = await IdaApplication.find(query).sort({ submittedAt: -1 }).limit(500).lean();

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
        const documents = normalizeIdaDocuments(row.documents);
        return {
            id: String(row._id),
            campaignId: String(row.campaignId),
            userId: String(row.userId),
            claimNumber: String(row.claimNumber ?? ''),
            userName: String(snap.name ?? 'User'),
            userEmail: String(snap.email ?? ''),
            userState: String(row.userState ?? ''),
            housingDamage: String(row.housingDamage ?? ''),
            immediateNeeds: (row.immediateNeeds as string[]) ?? [],
            documentCount: documents.length,
            applicationStatus: String(row.applicationStatus ?? 'pending'),
            submittedAt: row.submittedAt as Date,
        };
    });
}

export async function getIdaApplicationDetail(
    id: string,
    role: string,
    adminUserId?: string,
) {
    await connectDB();
    const row = (await IdaApplication.findById(id).lean()) as Record<string, unknown> | null;
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

    const documents = normalizeIdaDocuments(row.documents);
    const missingOptionalFields = detectMissingIdaFields({
        documents,
        insuranceCompany: String(row.insuranceCompany ?? ''),
        currentLocation: String(row.currentLocation ?? ''),
    });

    return {
        id: String(row._id),
        campaignId: String(row.campaignId),
        invitationId: String(row.invitationId),
        userId: String(row.userId),
        claimNumber: String(row.claimNumber ?? ''),
        applicant: row.applicant ?? {},
        household: row.household ?? {},
        disasterType: String(row.disasterType ?? ''),
        dateOfImpact: String(row.dateOfImpact ?? ''),
        didEvacuate: row.didEvacuate ?? null,
        currentLocation: String(row.currentLocation ?? ''),
        homeAccessible: row.homeAccessible ?? null,
        housingDamage: String(row.housingDamage ?? ''),
        safeToLive: String(row.safeToLive ?? ''),
        livingSituation: String(row.livingSituation ?? ''),
        livingSituationOther: String(row.livingSituationOther ?? ''),
        immediateNeeds: (row.immediateNeeds as string[]) ?? [],
        immediateNeedsOther: String(row.immediateNeedsOther ?? ''),
        insuranceTypes: (row.insuranceTypes as string[]) ?? [],
        insuranceCompany: String(row.insuranceCompany ?? ''),
        contactedInsurance: row.contactedInsurance ?? null,
        financialImpact: String(row.financialImpact ?? ''),
        documents,
        missingOptionalFields,
        requestedMissingFields: Array.isArray(row.requestedMissingFields)
            ? row.requestedMissingFields
            : [],
        missingInfoRequestedAt: row.missingInfoRequestedAt as Date | null | undefined,
        profileSnapshot: row.profileSnapshot ?? {},
        userSnapshot: row.userSnapshot ?? {},
        applicationStatus: String(row.applicationStatus ?? 'pending'),
        adminNotes: String(row.adminNotes ?? ''),
        reviewedAt: row.reviewedAt as Date | undefined,
        submittedAt: row.submittedAt as Date,
    };
}

export async function updateIdaApplicationStatus(
    id: string,
    adminUserId: string,
    input: { applicationStatus?: IdaApplicationStatus; adminNotes?: string },
) {
    await connectDB();

    const setDoc: Record<string, unknown> = {
        reviewedAt: new Date(),
        reviewedBy: adminUserId,
    };

    if (input.applicationStatus) {
        const allowed: IdaApplicationStatus[] = [
            'pending',
            'in_review',
            'needs_info',
            'referred',
            'closed',
        ];
        if (!allowed.includes(input.applicationStatus)) {
            throw new Error('INVALID_STATUS');
        }
        setDoc.applicationStatus = input.applicationStatus;
    }

    if (typeof input.adminNotes === 'string') {
        setDoc.adminNotes = input.adminNotes.trim().slice(0, 4000);
    }

    const row = (await IdaApplication.findByIdAndUpdate(
        id,
        { $set: setDoc },
        { new: true },
    ).lean()) as {
        _id: unknown;
        applicationStatus: string;
        adminNotes?: string;
        reviewedAt?: Date;
        invitationId?: unknown;
    } | null;

    if (!row) throw new Error('APPLICATION_NOT_FOUND');

    if (input.applicationStatus === 'needs_info' && row.invitationId) {
        await IdaInvitation.updateOne(
            { _id: row.invitationId },
            { $set: { status: 'needs_info' } },
        );
    }

    return {
        id: String(row._id),
        applicationStatus: row.applicationStatus,
        adminNotes: row.adminNotes,
        reviewedAt: row.reviewedAt,
    };
}

export async function requestIdaMissingInfo(
    id: string,
    adminUserId: string,
    fields: IdaMissingFieldId[],
) {
    await connectDB();

    const application = (await IdaApplication.findById(id)) as {
        _id: { toString(): string };
        userId: { toString(): string };
        invitationId: { toString(): string };
        campaignId: { toString(): string };
        documents?: IdaDocumentRef[];
        insuranceCompany?: string;
        currentLocation?: string;
        userSnapshot?: { email?: string; name?: string };
    } | null;
    if (!application) throw new Error('APPLICATION_NOT_FOUND');

    const autoMissing = detectMissingIdaFields({
        documents: normalizeIdaDocuments(application.documents),
        insuranceCompany: application.insuranceCompany,
        currentLocation: application.currentLocation,
    });

    const requested = (Array.isArray(fields) ? fields : [])
        .filter((f) => (IDA_MISSING_FIELD_IDS as readonly string[]).includes(f))
        .filter((f) => autoMissing.includes(f));

    const missing = requested.length > 0 ? requested : autoMissing;
    if (missing.length === 0) throw new Error('NOTHING_MISSING');

    const campaign = (await IdaCampaign.findById(application.campaignId)
        .select('title')
        .lean()) as { title?: string } | null;
    const campaignTitle = String(campaign?.title ?? IDA_DEFAULT_TITLE);

    const user = (await User.findById(application.userId)
        .select('email firstName name expoPushToken')
        .lean()) as {
        email?: string;
        firstName?: string;
        name?: string;
        expoPushToken?: string;
    } | null;
    if (!user?.email) throw new Error('USER_NOT_FOUND');

    await IdaApplication.updateOne(
        { _id: application._id },
        {
            $set: {
                requestedMissingFields: missing,
                missingInfoRequestedAt: new Date(),
                applicationStatus: 'needs_info',
                reviewedAt: new Date(),
                reviewedBy: adminUserId,
            },
        },
    );

    await IdaInvitation.updateOne(
        { _id: application.invitationId },
        { $set: { status: 'needs_info' } },
    );

    const labelList = missing.map((f) => MISSING_FIELD_LABELS[f]).join(', ');
    const body = `Please add the missing application details (${labelList}) for ${campaignTitle}.`;

    const notif = await dispatchUserNotification({
        userId: String(application.userId),
        type: 'ida_application',
        title: 'Additional IDA details needed',
        body,
        priority: 'high',
        audience: 'citizen',
        deepLink: IDA_PUSH_SCREEN,
        meta: {
            dedupeKey: `ida_missing:${String(application._id)}:${missing.sort().join(',')}:${Date.now()}`,
            invitationId: String(application.invitationId),
            applicationId: String(application._id),
            campaignId: String(application.campaignId),
            requestedMissingFields: missing,
        },
        push: {
            title: 'Additional IDA details needed',
            body,
            channelId: 'default',
            data: {
                screen: IDA_PUSH_SCREEN,
                notificationType: 'ida_application',
                invitationId: String(application.invitationId),
                applicationId: String(application._id),
            },
        },
    });

    let pushSent = notif.pushSent;
    if (!pushSent) {
        const token = String(user.expoPushToken ?? '').trim();
        if (token) {
            const push = await sendExpoPushNotification({
                to: token,
                title: 'Additional IDA details needed',
                body,
                data: {
                    screen: IDA_PUSH_SCREEN,
                    notificationType: 'ida_application',
                    invitationId: String(application.invitationId),
                    applicationId: String(application._id),
                },
                sound: 'default',
                channelId: 'default',
                priority: 'high',
            });
            pushSent = push.ok;
        }
    }

    const emailSent = await sendIdaMissingInfoEmail(
        user.email,
        user.firstName || user.name || '',
        campaignTitle,
        missing.map((f) => MISSING_FIELD_LABELS[f]),
    );

    return {
        applicationId: String(application._id),
        missingFields: missing,
        pushSent,
        emailSent,
        inboxSent: Boolean(notif.item),
    };
}

export async function processAutoIdaDispatch() {
    await connectDB();
    const now = new Date();
    const delayHours = IDA_DEFAULT_DELAY_HOURS;
    const delayMs = delayHours * 60 * 60 * 1000;
    const dedupeSince = new Date(Date.now() - AUTO_DEDUPE_DAYS * 24 * 60 * 60 * 1000);

    let dueDispatched = 0;
    let campaignsCreated = 0;
    let immediateDispatched = 0;
    let pendingScheduled = 0;

    // (a) Draft campaigns whose eligibleAt has arrived → dispatch
    const dueCampaigns = (await IdaCampaign.find({
        status: 'draft',
        eligibleAt: { $ne: null, $lte: now },
    })
        .sort({ eligibleAt: 1 })
        .limit(AUTO_DISPATCH_BATCH)
        .select('_id')
        .lean()) as { _id: unknown }[];

    for (const c of dueCampaigns) {
        await dispatchIdaCampaign(String(c._id), { actorRole: 'super-admin' });
        dueDispatched += 1;
    }

    // (b) Scan aligned feed for severe events and schedule / dispatch IDA campaigns
    const rows = await fetchPopulationAtRiskAlignedEventFeed({ role: 'super-admin' });
    const qualifying = rows.filter(isAutoTriggerEvent).slice(0, AUTO_FEED_BATCH);

    for (const row of qualifying) {
        const eventId = String(row.id ?? row._id ?? row.sourceId ?? row.externalId ?? '').trim();
        if (!eventId) continue;

        const autoTriggerKey = `ida:${eventId}`;
        const existing = await IdaCampaign.findOne({
            autoTriggerKey,
            createdAt: { $gte: dedupeSince },
        })
            .select('_id status')
            .lean();
        if (existing) continue;

        const endMs = parseEventEndMs(row);
        // No usable end time → skip auto creation from live feed
        if (endMs == null) continue;

        const title = String(row.name ?? row.headline ?? 'Disaster assistance follow-up').slice(
            0,
            160,
        );
        const disasterType = String(row.type ?? row.category ?? row.name ?? 'Disaster event').slice(
            0,
            120,
        );
        const issuedRaw = row.issuedAt ?? row.createdAt;
        const disasterDate = (() => {
            const ms = Date.parse(String(issuedRaw ?? ''));
            if (!Number.isFinite(ms)) return '';
            return new Date(ms).toISOString().slice(0, 10);
        })();

        const eligibleAtMs = endMs + delayMs;
        const readyNow = eligibleAtMs <= now.getTime();

        if (readyNow) {
            const campaign = await createIdaCampaign({
                title,
                description: String(row.description ?? '').slice(0, 500) || IDA_DEFAULT_DESCRIPTION,
                triggerType: 'auto',
                sourceEventId: eventId,
                eventSummary: String(row.location ?? ''),
                severity: String(row.severity ?? ''),
                disasterType,
                disasterDate,
                delayHours,
                eligibleAt: now,
                autoTriggerKey,
            });
            campaignsCreated += 1;
            await dispatchIdaCampaign(String(campaign._id), { actorRole: 'super-admin' });
            immediateDispatched += 1;
            continue;
        }

        // Event still active (or recently ended): schedule draft for (a) when eligibleAt arrives
        await createIdaCampaign({
            title,
            description: String(row.description ?? '').slice(0, 500) || IDA_DEFAULT_DESCRIPTION,
            triggerType: 'auto',
            sourceEventId: eventId,
            eventSummary: String(row.location ?? ''),
            severity: String(row.severity ?? ''),
            disasterType,
            disasterDate,
            delayHours,
            eligibleAt: new Date(eligibleAtMs),
            autoTriggerKey,
        });
        campaignsCreated += 1;
        pendingScheduled += 1;
    }

    return {
        qualifyingEvents: qualifying.length,
        dueDispatched,
        campaignsCreated,
        immediateDispatched,
        pendingScheduled,
    };
}
