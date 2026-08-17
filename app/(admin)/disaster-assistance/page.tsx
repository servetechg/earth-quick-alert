'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPageHeader } from '@/components/admin-page-header';
import { AdminPageShell } from '@/components/admin-page-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
    IDA_DEFAULT_DESCRIPTION,
    IDA_DEFAULT_TITLE,
    type IdaMissingFieldId,
} from '@/lib/types/ida';
import { cn } from '@/lib/utils';
import { Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@/lib/store/user-store';

type Campaign = {
    id: string;
    title: string;
    description: string;
    triggerType: string;
    status: string;
    invitedCount: number;
    responseCount: number;
    disasterType?: string;
    disasterDate?: string;
    eligibleAt?: string;
    targetMode?: string;
    targetUserCount?: number;
    dispatchedAt?: string;
    createdAt: string;
};

type TargetUser = {
    id: string;
    name: string;
    email: string;
    state: string;
    city: string;
};

type ApplicationRow = {
    id: string;
    claimNumber: string;
    userName: string;
    userEmail: string;
    userState: string;
    housingDamage: string;
    immediateNeeds: string[];
    documentCount: number;
    applicationStatus: string;
    submittedAt: string;
};

type ApplicationDetail = {
    id: string;
    claimNumber: string;
    applicant: Record<string, unknown>;
    household: Record<string, unknown>;
    disasterType: string;
    dateOfImpact: string;
    didEvacuate: boolean | null;
    currentLocation: string;
    homeAccessible: boolean | null;
    housingDamage: string;
    safeToLive: string;
    livingSituation: string;
    livingSituationOther: string;
    immediateNeeds: string[];
    immediateNeedsOther: string;
    insuranceTypes: string[];
    insuranceCompany: string;
    contactedInsurance: boolean | null;
    financialImpact: string;
    documents: Array<{
        url: string;
        fileName?: string;
        mimeType?: string;
        kind?: string;
        resourceType?: string;
    }>;
    missingOptionalFields?: string[];
    requestedMissingFields?: string[];
    missingInfoRequestedAt?: string | null;
    userSnapshot: Record<string, unknown>;
    applicationStatus: string;
    adminNotes: string;
    submittedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    in_review: 'In review',
    needs_info: 'Needs info',
    referred: 'Referred',
    closed: 'Closed',
};

const HOUSING_LABELS: Record<string, string> = {
    no_damage: 'No damage',
    minor_damage: 'Minor damage',
    moderate_damage: 'Moderate damage',
    major_damage: 'Major damage',
    destroyed: 'Destroyed',
    unknown: 'Unknown',
};

const NEED_LABELS: Record<string, string> = {
    food: 'Food',
    drinking_water: 'Drinking water',
    temporary_housing: 'Temporary housing',
    medical_assistance: 'Medical assistance',
    prescription_medications: 'Prescription medications',
    transportation: 'Transportation',
    fuel: 'Fuel',
    clothing: 'Clothing',
    child_care: 'Child care',
    elder_care: 'Elder care',
    pet_assistance: 'Pet assistance',
    mental_health_support: 'Mental health support',
    debris_removal: 'Debris removal',
    generator: 'Generator',
    other: 'Other',
};

const INSURANCE_LABELS: Record<string, string> = {
    homeowners: 'Homeowners',
    renters: 'Renters',
    flood: 'Flood',
    vehicle: 'Vehicle',
    business: 'Business',
    none: 'None',
};

const FINANCIAL_LABELS: Record<string, string> = {
    under_5k: 'Under $5k',
    '5k_25k': '$5k–$25k',
    '25k_50k': '$25k–$50k',
    '50k_100k': '$50k–$100k',
    over_100k: 'Over $100k',
    unknown: 'Unknown',
};

const SAFE_TO_LIVE_LABELS: Record<string, string> = {
    yes: 'Yes',
    no: 'No',
    unsure: 'Unsure',
};

const LIVING_LABELS: Record<string, string> = {
    home: 'Home',
    hotel: 'Hotel',
    shelter: 'Shelter',
    friends_family: 'Friends / family',
    vehicle: 'Vehicle',
    other: 'Other',
};

const DOC_KIND_LABELS: Record<string, string> = {
    gov_id: 'Government ID',
    insurance_policy: 'Insurance policy',
    damage_photo: 'Damage photo',
    utility_bill: 'Utility bill',
    lease_or_deed: 'Lease or deed',
};

const MISSING_FIELD_LABELS: Record<IdaMissingFieldId, string> = {
    documents: 'Supporting documents',
    insurance_company: 'Insurance company',
    current_location: 'Current location',
};

function formatBool(v: boolean | null | undefined): string {
    if (v === true) return 'Yes';
    if (v === false) return 'No';
    return '—';
}

function displayValue(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v).trim();
}

/** Only fields that are actually blank/missing on the application. */
function getRequestableMissingFields(app: ApplicationDetail): IdaMissingFieldId[] {
    const fields: IdaMissingFieldId[] = [];
    if ((app.documents ?? []).length === 0) fields.push('documents');
    if (!displayValue(app.insuranceCompany)) fields.push('insurance_company');
    if (
        !displayValue(app.currentLocation) &&
        !displayValue(app.applicant?.currentLocation)
    ) {
        fields.push('current_location');
    }
    return fields;
}

function DetailSection({
    title,
    children,
    confidential,
}: {
    title: string;
    children: React.ReactNode;
    confidential?: boolean;
}) {
    return (
        <div>
            <div className="mb-1 flex items-center gap-2">
                <div className="font-medium">{title}</div>
                {confidential ? (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-amber-700 border-amber-300">
                        Confidential
                    </Badge>
                ) : null}
            </div>
            <div className="space-y-3 rounded-lg bg-slate-50 p-4">{children}</div>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    const empty =
        value == null ||
        (typeof value === 'string' && value.trim() === '');
    if (empty) return null;
    return (
        <div>
            <dt className="font-medium text-slate-800">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-slate-600">{value}</dd>
        </div>
    );
}

export default function DisasterAssistancePage() {
    const { me } = useUser();
    const role = (me?.role || '').toLowerCase();
    const isSuperAdmin = role === 'super-admin';
    const allScopeLabel = isSuperAdmin
        ? 'All users of our app'
        : 'All users in allocated full area';

    const [tab, setTab] = useState<'applications' | 'campaigns'>('applications');
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [applications, setApplications] = useState<ApplicationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [dispatchingId, setDispatchingId] = useState<string | null>(null);

    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newDisasterType, setNewDisasterType] = useState('');
    const [newDisasterDate, setNewDisasterDate] = useState('');
    const [targetMode, setTargetMode] = useState<'alert_area' | 'specific' | 'all_scope'>(
        'alert_area',
    );
    const [userSearch, setUserSearch] = useState('');
    const [searchResults, setSearchResults] = useState<TargetUser[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<TargetUser[]>([]);

    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [detail, setDetail] = useState<ApplicationDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [applicationStatus, setApplicationStatus] = useState('pending');
    const [adminNotes, setAdminNotes] = useState('');
    const [savingStatus, setSavingStatus] = useState(false);
    const [requestingMissing, setRequestingMissing] = useState(false);
    const [missingChecks, setMissingChecks] = useState<Record<IdaMissingFieldId, boolean>>({
        documents: false,
        insurance_company: false,
        current_location: false,
    });

    const loadCampaigns = useCallback(async () => {
        const res = await fetch('/api/admin/disaster-assistance/campaigns', {
            credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load campaigns');
        const data = await res.json();
        setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    }, []);

    const loadApplications = useCallback(async () => {
        const qs =
            statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
        const res = await fetch(`/api/admin/disaster-assistance/applications${qs}`, {
            credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load applications');
        const data = await res.json();
        setApplications(Array.isArray(data.applications) ? data.applications : []);
    }, [statusFilter]);

    useEffect(() => {
        setLoading(true);
        Promise.all([loadCampaigns(), loadApplications()])
            .catch(() => toast.error('Failed to load disaster assistance'))
            .finally(() => setLoading(false));
    }, [loadCampaigns, loadApplications]);

    useEffect(() => {
        if (targetMode !== 'specific' || !isSuperAdmin) {
            setSearchResults([]);
            return;
        }
        const q = userSearch.trim();
        if (q.length < 2) {
            setSearchResults([]);
            return;
        }

        const timer = window.setTimeout(() => {
            setSearchLoading(true);
            fetch(
                `/api/admin/disaster-assistance/target-users?q=${encodeURIComponent(q)}`,
                { credentials: 'include' },
            )
                .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Search failed'))))
                .then((data) => setSearchResults(Array.isArray(data.users) ? data.users : []))
                .catch(() => setSearchResults([]))
                .finally(() => setSearchLoading(false));
        }, 300);

        return () => window.clearTimeout(timer);
    }, [userSearch, targetMode, isSuperAdmin]);

    const toggleSelectedUser = (user: TargetUser, checked: boolean) => {
        setSelectedUsers((prev) => {
            if (checked) {
                if (prev.some((u) => u.id === user.id)) return prev;
                return [...prev, user];
            }
            return prev.filter((u) => u.id !== user.id);
        });
    };

    const resetCampaignForm = () => {
        setNewTitle('');
        setNewDescription('');
        setNewDisasterType('');
        setNewDisasterDate('');
        setTargetMode('alert_area');
        setUserSearch('');
        setSearchResults([]);
        setSelectedUsers([]);
    };

    const createCampaign = async (dispatch: boolean) => {
        if (targetMode === 'specific' && dispatch && selectedUsers.length === 0) {
            toast.error('Select at least one user to dispatch');
            return;
        }
        if (targetMode === 'specific' && !isSuperAdmin && selectedUsers.length === 0 && dispatch) {
            toast.error('User search is available to super-admins only');
            return;
        }
        setCreating(true);
        try {
            const res = await fetch('/api/admin/disaster-assistance/campaigns', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTitle.trim(),
                    description: newDescription.trim(),
                    disasterType: newDisasterType.trim() || undefined,
                    disasterDate: newDisasterDate.trim() || undefined,
                    dispatch,
                    bypassDelay: dispatch,
                    targetMode,
                    userIds:
                        targetMode === 'specific' ? selectedUsers.map((u) => u.id) : undefined,
                }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(
                    typeof errBody?.error === 'string' ? errBody.error : 'Create failed',
                );
            }
            const data = await res.json();
            toast.success(
                dispatch
                    ? `Campaign dispatched to ${data.invited ?? data.dispatch?.invited ?? 0} users (${data.pushSent ?? data.dispatch?.pushSent ?? 0} push, ${data.emailSent ?? data.dispatch?.emailSent ?? 0} email)`
                    : 'Campaign draft saved',
            );
            if (
                dispatch &&
                (data.invited ?? data.dispatch?.invited ?? 0) > 0 &&
                (data.pushSent ?? data.dispatch?.pushSent ?? 0) === 0
            ) {
                toast.message(
                    'No remote Expo push tokens on device yet — users still get in-app notifications. Open the mobile app once (with notification permission) then re-dispatch, or ensure FCM is configured for the Android build.',
                );
            }
            resetCampaignForm();
            await loadCampaigns();
            if (dispatch) await loadApplications();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create campaign');
        } finally {
            setCreating(false);
        }
    };

    const targetModeLabel = (c: Campaign) => {
        if (c.targetMode === 'all_scope') {
            return isSuperAdmin ? 'all app users' : 'jurisdiction-wide';
        }
        if (c.targetMode === 'specific' || (c.targetUserCount && c.targetUserCount > 0)) {
            return `${c.targetUserCount ?? 0} specific users`;
        }
        return 'alert area targeting';
    };

    const dispatchCampaign = async (id: string) => {
        setDispatchingId(id);
        try {
            const res = await fetch(
                `/api/admin/disaster-assistance/campaigns/${id}/dispatch`,
                {
                    method: 'POST',
                    credentials: 'include',
                },
            );
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(
                    typeof errBody?.error === 'string' ? errBody.error : 'Dispatch failed',
                );
            }
            const data = await res.json();
            toast.success(
                `Invited ${data.invited ?? 0} users (${data.pushSent ?? 0} push, ${data.emailSent ?? 0} email)`,
            );
            if ((data.invited ?? 0) > 0 && (data.pushSent ?? 0) === 0) {
                toast.message(
                    'No remote Expo push tokens saved for those users yet. They still receive in-app notifications; open the app on-device to register push, then re-dispatch.',
                );
            }
            await loadCampaigns();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to dispatch campaign');
        } finally {
            setDispatchingId(null);
        }
    };

    const openDetail = async (id: string) => {
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/admin/disaster-assistance/applications/${id}`, {
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            const app = data.application as ApplicationDetail;
            setDetail(app);
            setApplicationStatus(app.applicationStatus || 'pending');
            setAdminNotes(app.adminNotes ?? '');
            const requestable = new Set(getRequestableMissingFields(app));
            setMissingChecks({
                documents: requestable.has('documents'),
                insurance_company: requestable.has('insurance_company'),
                current_location: requestable.has('current_location'),
            });
        } catch {
            toast.error('Failed to load application detail');
        } finally {
            setDetailLoading(false);
        }
    };

    const saveStatus = async () => {
        if (!detail) return;
        setSavingStatus(true);
        try {
            const res = await fetch(
                `/api/admin/disaster-assistance/applications/${detail.id}`,
                {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        applicationStatus,
                        adminNotes,
                    }),
                },
            );
            if (!res.ok) throw new Error('Update failed');
            toast.success('Application updated');
            setDetail(null);
            await loadApplications();
        } catch {
            toast.error('Failed to update application');
        } finally {
            setSavingStatus(false);
        }
    };

    const requestableMissingFields = useMemo(
        () => (detail ? getRequestableMissingFields(detail) : []),
        [detail],
    );

    const requestMissingInfo = async () => {
        if (!detail) return;
        const fields = requestableMissingFields.filter((f) => missingChecks[f]);
        if (fields.length === 0) {
            toast.message('Select at least one missing field to request');
            return;
        }
        setRequestingMissing(true);
        try {
            const res = await fetch(
                `/api/admin/disaster-assistance/applications/${detail.id}/request-missing-info`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields }),
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(
                    typeof data?.error === 'string' ? data.error : 'Request failed',
                );
            }
            toast.success(
                `Reminder sent (${data.pushSent ? 'push' : 'no push'}, ${data.emailSent ? 'email' : 'no email'}, in-app)`,
            );
            await openDetail(detail.id);
            await loadApplications();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to send reminder');
        } finally {
            setRequestingMissing(false);
        }
    };

    const applicant = (detail?.applicant ?? {}) as Record<string, unknown>;
    const household = (detail?.household ?? {}) as Record<string, unknown>;

    return (
        <AdminPageShell>
            <AdminPageHeader
                title="Disaster Assistance"
                description="Initial Disaster Assistance Applications — post life-safety reimbursement intake"
            />

            <div className="mb-6 flex gap-2">
                {(['applications', 'campaigns'] as const).map((key) => (
                    <Button
                        key={key}
                        variant={tab === key ? 'default' : 'outline'}
                        onClick={() => setTab(key)}
                        className="capitalize"
                    >
                        {key}
                    </Button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading…
                </div>
            ) : tab === 'campaigns' ? (
                <div className="space-y-6">
                    <Card className="space-y-4 p-6">
                        <h3 className="font-bold text-slate-900">Create IDA campaign</h3>
                        <div className="grid max-w-xl gap-3">
                            <div>
                                <Label htmlFor="ida-title">Title</Label>
                                <Input
                                    id="ida-title"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder={IDA_DEFAULT_TITLE}
                                />
                            </div>
                            <div>
                                <Label htmlFor="ida-desc">Description</Label>
                                <Textarea
                                    id="ida-desc"
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    placeholder={IDA_DEFAULT_DESCRIPTION}
                                    rows={4}
                                />
                            </div>
                            <div>
                                <Label htmlFor="ida-disaster-type">Disaster type</Label>
                                <Input
                                    id="ida-disaster-type"
                                    value={newDisasterType}
                                    onChange={(e) => setNewDisasterType(e.target.value)}
                                    placeholder="e.g. Tornado, Flood, Wildfire"
                                />
                            </div>
                            <div>
                                <Label htmlFor="ida-disaster-date">Disaster date</Label>
                                <Input
                                    id="ida-disaster-date"
                                    type="date"
                                    value={newDisasterDate}
                                    onChange={(e) => setNewDisasterDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Recipients</Label>
                                <Select
                                    value={targetMode}
                                    onValueChange={(v) =>
                                        setTargetMode(
                                            v as 'alert_area' | 'specific' | 'all_scope',
                                        )
                                    }
                                >
                                    <SelectTrigger className="max-w-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="alert_area">
                                            All users in active alert areas
                                        </SelectItem>
                                        <SelectItem value="specific">
                                            Select specific users
                                        </SelectItem>
                                        <SelectItem value="all_scope">
                                            {allScopeLabel}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                {targetMode === 'all_scope' ? (
                                    <p className="mt-1.5 text-xs text-slate-500">
                                        {isSuperAdmin
                                            ? 'Invitations will be sent to every approved mobile app user.'
                                            : 'Invitations will be sent to all approved mobile users inside your license area (state, county, or radius).'}
                                    </p>
                                ) : null}
                            </div>
                            {targetMode === 'specific' && (
                                <div className="max-w-xl space-y-3 rounded-lg border bg-slate-50/50 p-4">
                                    {isSuperAdmin ? (
                                        <>
                                            <div>
                                                <Label htmlFor="ida-user-search">
                                                    Search users
                                                </Label>
                                                <Input
                                                    id="ida-user-search"
                                                    value={userSearch}
                                                    onChange={(e) =>
                                                        setUserSearch(e.target.value)
                                                    }
                                                    placeholder="Name or email (min 2 characters)"
                                                />
                                            </div>
                                            {searchLoading && (
                                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Searching…
                                                </div>
                                            )}
                                            {searchResults.length > 0 && (
                                                <div className="max-h-48 space-y-2 overflow-y-auto">
                                                    {searchResults.map((user) => {
                                                        const checked = selectedUsers.some(
                                                            (u) => u.id === user.id,
                                                        );
                                                        return (
                                                            <label
                                                                key={user.id}
                                                                className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-white"
                                                            >
                                                                <Checkbox
                                                                    checked={checked}
                                                                    onCheckedChange={(v) =>
                                                                        toggleSelectedUser(
                                                                            user,
                                                                            v === true,
                                                                        )
                                                                    }
                                                                />
                                                                <span className="text-sm">
                                                                    <span className="font-medium text-slate-900">
                                                                        {user.name}
                                                                    </span>
                                                                    <span className="block text-slate-500">
                                                                        {user.email}
                                                                        {user.state || user.city
                                                                            ? ` · ${[user.city, user.state].filter(Boolean).join(', ')}`
                                                                            : ''}
                                                                    </span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {selectedUsers.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedUsers.map((user) => (
                                                        <Badge
                                                            key={user.id}
                                                            variant="secondary"
                                                            className="gap-1 pr-1"
                                                        >
                                                            {user.name}
                                                            <button
                                                                type="button"
                                                                className="ml-1 rounded-full p-0.5 hover:bg-slate-200"
                                                                onClick={() =>
                                                                    toggleSelectedUser(
                                                                        user,
                                                                        false,
                                                                    )
                                                                }
                                                                aria-label={`Remove ${user.name}`}
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-xs text-slate-500">
                                                Only approved mobile users can be selected.
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-slate-600">
                                            Specific-user search is available to super-admins
                                            only. Choose alert-area or jurisdiction-wide
                                            targeting, or ask a super-admin to invite named
                                            citizens.
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    disabled={creating}
                                    onClick={() => void createCampaign(false)}
                                >
                                    Save draft
                                </Button>
                                <Button
                                    disabled={creating}
                                    onClick={() => void createCampaign(true)}
                                >
                                    {creating ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="mr-2 h-4 w-4" />
                                    )}
                                    Create &amp; dispatch (bypass delay for manual test)
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <div className="space-y-3">
                        {campaigns.map((c) => (
                            <Card
                                key={c.id}
                                className="flex flex-wrap items-center justify-between gap-3 p-4"
                            >
                                <div>
                                    <div className="font-semibold text-slate-900">
                                        {c.title}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-500">
                                        {c.triggerType} · {targetModeLabel(c)} ·{' '}
                                        {c.disasterType || '—'} · {c.invitedCount} invited ·{' '}
                                        {c.responseCount} responses
                                    </div>
                                    {c.eligibleAt ? (
                                        <div className="mt-0.5 text-xs text-slate-400">
                                            Eligible{' '}
                                            {new Date(c.eligibleAt).toLocaleString()}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline">{c.status}</Badge>
                                    {c.status === 'draft' && (
                                        <Button
                                            size="sm"
                                            disabled={dispatchingId === c.id}
                                            onClick={() => void dispatchCampaign(c.id)}
                                        >
                                            {dispatchingId === c.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                'Dispatch'
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </Card>
                        ))}
                        {campaigns.length === 0 && (
                            <p className="text-sm text-slate-500">No campaigns yet.</p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex max-w-xs items-center gap-3">
                        <Label>Application status</Label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>
                                        {v}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        {applications.map((a) => (
                            <Card
                                key={a.id}
                                className="cursor-pointer p-4 transition-colors hover:bg-slate-50"
                                onClick={() => void openDetail(a.id)}
                            >
                                <div className="flex flex-wrap justify-between gap-2">
                                    <div>
                                        <div className="font-semibold text-slate-900">
                                            {a.claimNumber || 'No claim #'}
                                        </div>
                                        <div className="text-sm text-slate-500">
                                            {a.userName} · {a.userEmail || '—'}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-400">
                                            {(HOUSING_LABELS[a.housingDamage] ??
                                                a.housingDamage) ||
                                                '—'}{' '}
                                            · {a.immediateNeeds?.length ?? 0} needs ·{' '}
                                            {a.documentCount ?? 0} docs ·{' '}
                                            {a.submittedAt
                                                ? new Date(a.submittedAt).toLocaleString()
                                                : '—'}
                                        </div>
                                    </div>
                                    <Badge
                                        className={cn(
                                            a.applicationStatus === 'closed' &&
                                                'bg-slate-600',
                                            a.applicationStatus === 'referred' &&
                                                'bg-blue-600',
                                            a.applicationStatus === 'needs_info' &&
                                                'bg-amber-600',
                                            a.applicationStatus === 'in_review' &&
                                                'bg-indigo-600',
                                        )}
                                    >
                                        {STATUS_LABELS[a.applicationStatus] ??
                                            a.applicationStatus}
                                    </Badge>
                                </div>
                            </Card>
                        ))}
                        {applications.length === 0 && (
                            <p className="text-sm text-slate-500">
                                No assistance applications yet.
                            </p>
                        )}
                    </div>
                </div>
            )}

            <Dialog
                open={Boolean(detail) || detailLoading}
                onOpenChange={() => setDetail(null)}
            >
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {detail?.claimNumber
                                ? `Application ${detail.claimNumber}`
                                : 'IDA application'}
                        </DialogTitle>
                    </DialogHeader>
                    {detailLoading && !detail ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    ) : detail ? (
                        <div className="space-y-4 text-sm">
                            <div>
                                <div className="font-semibold">
                                    {displayValue(applicant.fullName) ||
                                        displayValue(detail.userSnapshot?.name) ||
                                        'Applicant'}
                                </div>
                                <div className="text-slate-500">
                                    {displayValue(applicant.email) ||
                                        displayValue(detail.userSnapshot?.email)}
                                </div>
                                <div className="text-slate-500">
                                    {displayValue(applicant.phoneNumber) ||
                                        displayValue(detail.userSnapshot?.phone)}
                                </div>
                            </div>

                            <DetailSection title="Applicant">
                                <dl className="space-y-3">
                                    <DetailRow
                                        label="Full name"
                                        value={displayValue(applicant.fullName)}
                                    />
                                    <DetailRow
                                        label="Date of birth"
                                        value={displayValue(applicant.dateOfBirth)}
                                    />
                                    <DetailRow
                                        label="Phone"
                                        value={displayValue(applicant.phoneNumber)}
                                    />
                                    <DetailRow
                                        label="Email"
                                        value={displayValue(applicant.email)}
                                    />
                                    <DetailRow
                                        label="Preferred contact"
                                        value={displayValue(applicant.preferredContactMethod)}
                                    />
                                    <DetailRow
                                        label="Current location"
                                        value={
                                            displayValue(detail.currentLocation) ||
                                            displayValue(applicant.currentLocation)
                                        }
                                    />
                                    <DetailRow
                                        label="Preferred language"
                                        value={displayValue(applicant.preferredLanguage)}
                                    />
                                </dl>
                            </DetailSection>

                            <DetailSection title="Household">
                                <dl className="space-y-3">
                                    <DetailRow
                                        label="Disaster-affected address"
                                        value={displayValue(
                                            household.disasterAffectedAddress,
                                        )}
                                    />
                                    <DetailRow
                                        label="Primary residence"
                                        value={
                                            household.isPrimaryResidence == null
                                                ? ''
                                                : formatBool(
                                                      Boolean(household.isPrimaryResidence),
                                                  )
                                        }
                                    />
                                    <DetailRow
                                        label="Household size"
                                        value={
                                            household.householdSize != null
                                                ? String(household.householdSize)
                                                : ''
                                        }
                                    />
                                    <DetailRow
                                        label="Adults / children / seniors"
                                        value={
                                            [
                                                household.adults != null
                                                    ? `${household.adults} adults`
                                                    : null,
                                                household.children != null
                                                    ? `${household.children} children`
                                                    : null,
                                                household.seniors != null
                                                    ? `${household.seniors} seniors`
                                                    : null,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ') || ''
                                        }
                                    />
                                    <DetailRow
                                        label="Disabilities / access needs"
                                        value={displayValue(
                                            household.disabilitiesOrAccessNeeds,
                                        )}
                                    />
                                    <DetailRow
                                        label="Electricity-dependent medical"
                                        value={displayValue(
                                            household.electricityDependentMedical,
                                        )}
                                    />
                                    <DetailRow
                                        label="Pets / livestock"
                                        value={displayValue(household.petsOrLivestock)}
                                    />
                                </dl>
                            </DetailSection>

                            <DetailSection title="Disaster">
                                <dl className="space-y-3">
                                    <DetailRow
                                        label="Disaster type"
                                        value={detail.disasterType}
                                    />
                                    <DetailRow
                                        label="Date of impact"
                                        value={detail.dateOfImpact}
                                    />
                                    <DetailRow
                                        label="Did evacuate"
                                        value={formatBool(detail.didEvacuate)}
                                    />
                                    <DetailRow
                                        label="Home accessible"
                                        value={formatBool(detail.homeAccessible)}
                                    />
                                    <DetailRow
                                        label="Current location"
                                        value={detail.currentLocation}
                                    />
                                </dl>
                            </DetailSection>

                            <DetailSection title="Housing">
                                <dl className="space-y-3">
                                    <DetailRow
                                        label="Housing damage"
                                        value={
                                            HOUSING_LABELS[detail.housingDamage] ??
                                            detail.housingDamage
                                        }
                                    />
                                    <DetailRow
                                        label="Safe to live"
                                        value={
                                            SAFE_TO_LIVE_LABELS[detail.safeToLive] ??
                                            detail.safeToLive
                                        }
                                    />
                                    <DetailRow
                                        label="Living situation"
                                        value={
                                            detail.livingSituation === 'other' &&
                                            detail.livingSituationOther
                                                ? `Other: ${detail.livingSituationOther}`
                                                : (LIVING_LABELS[detail.livingSituation] ??
                                                  detail.livingSituation)
                                        }
                                    />
                                </dl>
                            </DetailSection>

                            <DetailSection title="Immediate needs">
                                <div className="flex flex-wrap gap-1">
                                    {(detail.immediateNeeds ?? []).map((n) => (
                                        <Badge key={n} variant="secondary">
                                            {NEED_LABELS[n] ?? n}
                                        </Badge>
                                    ))}
                                    {(detail.immediateNeeds ?? []).length === 0 ? (
                                        <span className="text-slate-500">None listed</span>
                                    ) : null}
                                </div>
                                {detail.immediateNeedsOther ? (
                                    <p className="mt-2 text-slate-600">
                                        Other: {detail.immediateNeedsOther}
                                    </p>
                                ) : null}
                            </DetailSection>

                            <DetailSection title="Insurance" confidential>
                                <dl className="space-y-3">
                                    <div>
                                        <dt className="font-medium text-slate-800">Types</dt>
                                        <dd className="mt-1 flex flex-wrap gap-1">
                                            {(detail.insuranceTypes ?? []).length > 0 ? (
                                                detail.insuranceTypes.map((t) => (
                                                    <Badge key={t} variant="secondary">
                                                        {INSURANCE_LABELS[t] ?? t}
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-slate-500">—</span>
                                            )}
                                        </dd>
                                    </div>
                                    <DetailRow
                                        label="Insurance company"
                                        value={detail.insuranceCompany}
                                    />
                                    <DetailRow
                                        label="Contacted insurance"
                                        value={formatBool(detail.contactedInsurance)}
                                    />
                                </dl>
                            </DetailSection>

                            <DetailSection title="Financial impact">
                                <DetailRow
                                    label="Estimated impact"
                                    value={
                                        (FINANCIAL_LABELS[detail.financialImpact] ??
                                            detail.financialImpact) ||
                                        '—'
                                    }
                                />
                            </DetailSection>

                            <DetailSection title="Documents">
                                {(detail.documents ?? []).length > 0 ? (
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {detail.documents.map((doc) => {
                                            const isImage =
                                                doc.resourceType === 'image' ||
                                                (doc.mimeType ?? '').startsWith('image/') ||
                                                /\.(jpe?g|png|gif|webp)(\?|$)/i.test(doc.url);
                                            return (
                                                <a
                                                    key={doc.url + (doc.fileName ?? '')}
                                                    href={doc.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block overflow-hidden rounded-md border bg-white"
                                                >
                                                    {isImage ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={doc.url}
                                                            alt={doc.fileName || 'Document'}
                                                            className="h-28 w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-28 items-center justify-center bg-slate-100 px-2 text-center text-xs text-blue-600 underline">
                                                            {doc.fileName || 'Open document'}
                                                        </div>
                                                    )}
                                                    <div className="truncate px-2 py-1 text-[11px] text-slate-500">
                                                        {DOC_KIND_LABELS[doc.kind ?? ''] ??
                                                            doc.kind ??
                                                            'Document'}
                                                    </div>
                                                </a>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-slate-600">No documents uploaded</p>
                                )}
                            </DetailSection>

                            {requestableMissingFields.length > 0 ? (
                                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                                    <div className="font-medium text-slate-900">
                                        Request missing info
                                    </div>
                                    <div className="space-y-2">
                                        {requestableMissingFields.map((field) => (
                                            <label
                                                key={field}
                                                className="flex cursor-pointer items-center gap-2 text-sm"
                                            >
                                                <Checkbox
                                                    checked={missingChecks[field]}
                                                    onCheckedChange={(v) =>
                                                        setMissingChecks((prev) => ({
                                                            ...prev,
                                                            [field]: v === true,
                                                        }))
                                                    }
                                                />
                                                {MISSING_FIELD_LABELS[field]}
                                            </label>
                                        ))}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={requestingMissing}
                                        onClick={() => void requestMissingInfo()}
                                    >
                                        {requestingMissing ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Send className="mr-2 h-4 w-4" />
                                        )}
                                        Request missing info
                                    </Button>
                                    {detail.missingInfoRequestedAt ? (
                                        <p className="text-xs text-slate-500">
                                            Last requested{' '}
                                            {new Date(
                                                detail.missingInfoRequestedAt,
                                            ).toLocaleString()}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            <div className="space-y-3 border-t pt-4">
                                <div className="font-medium">Status &amp; admin notes</div>
                                <Select
                                    value={applicationStatus}
                                    onValueChange={setApplicationStatus}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Textarea
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="Internal admin notes"
                                    rows={3}
                                />
                                <Button
                                    disabled={savingStatus}
                                    onClick={() => void saveStatus()}
                                >
                                    {savingStatus ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : null}
                                    Save status
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </AdminPageShell>
    );
}
