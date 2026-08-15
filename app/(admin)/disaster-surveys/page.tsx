'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
import type { DisasterSurveyProfileSnapshot } from '@/lib/types/disaster-survey';
import { cn } from '@/lib/utils';
import { ExternalLink, Eye, FileText, Loader2, Send, X } from 'lucide-react';
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

type ResponseRow = {
    id: string;
    campaignId: string;
    userName: string;
    userEmail: string;
    userState: string;
    immediateNeeds: string[];
    fundingStatus: string;
    submittedAt: string;
};

type ResponseDetail = ResponseRow & {
    profileSnapshot: DisasterSurveyProfileSnapshot;
    userSnapshot: Record<string, unknown>;
    fundingNotes: string;
    comments?: string;
    incidentPictures?: Array<{ url: string; fileName?: string }>;
    incidentVideos?: Array<{ url: string; fileName?: string }>;
    missingOptionalFields?: string[];
    requestedMissingFields?: string[];
    missingInfoRequestedAt?: string | null;
};

const MISSING_FIELD_LABELS: Record<string, string> = {
    comments: 'Comments',
    incident_pictures: 'Incident pictures',
    incident_videos: 'Incident videos',
};

/** Cloudinary first-frame poster for video URLs (so_0 transformation). */
function cloudinaryVideoPoster(url: string): string | undefined {
    if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) {
        return undefined;
    }
    return url
        .replace('/video/upload/', '/video/upload/so_0/')
        .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg$2');
}

const FUNDING_LABELS: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    denied: 'Denied',
    needs_info: 'Needs info',
};

const NEED_LABELS: Record<string, string> = {
    rescue_evacuation: 'Rescue / Evacuation',
    lodging_hotel: 'Lodging (Hotel)',
    food_supplies: 'Food / Supplies',
    medical_assistance: 'Medical Assistance',
    pet_rescue: 'Pet Rescue',
    livestock_rescue: 'Livestock Rescue',
    transportation: 'Transportation',
};

type DocumentPreviewState = {
    title: string;
    url: string;
    fileName?: string;
} | null;

function isImageUrl(url: string, fileName?: string): boolean {
    const combined = `${url} ${fileName || ''}`.toLowerCase();
    return (
        combined.includes('res.cloudinary.com') ||
        /\.(png|jpe?g|webp|gif|svg|avif)($|\?)/i.test(combined)
    );
}

function DocumentThumbnailCard({
    title,
    url,
    fileName,
    onPreview,
}: {
    title: string;
    url: string;
    fileName?: string;
    onPreview: (doc: { title: string; url: string; fileName?: string }) => void;
}) {
    const isImage = isImageUrl(url, fileName);

    return (
        <div className="group relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all max-w-md">
            <button
                type="button"
                onClick={() => onPreview({ title, url, fileName })}
                className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-900 cursor-pointer focus:outline-hidden ring-offset-2 focus:ring-2 focus:ring-slate-400"
            >
                {isImage ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={url}
                            alt={fileName || title}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye className="h-5 w-5 text-white drop-shadow-md" />
                        </div>
                    </>
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-slate-500 group-hover:bg-slate-200 transition-colors">
                        <FileText className="h-7 w-7 text-slate-600 mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Document</span>
                    </div>
                )}
            </button>

            <div className="min-w-0 flex-1 pr-1">
                <p className="text-xs font-bold text-slate-900">{title}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{fileName || 'document.png'}</p>
                <button
                    type="button"
                    onClick={() => onPreview({ title, url, fileName })}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#33375D] hover:underline cursor-pointer"
                >
                    <Eye className="h-3.5 w-3.5" />
                    View {isImage ? 'image' : 'document'}
                </button>
            </div>
        </div>
    );
}

function DocumentPreviewModal({
    doc,
    onClose,
}: {
    doc: DocumentPreviewState;
    onClose: () => void;
}) {
    if (!doc) return null;
    const isImage = isImageUrl(doc.url, doc.fileName);

    return (
        <Dialog open={Boolean(doc)} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent elevated className="max-w-3xl overflow-hidden rounded-2xl bg-white p-0 gap-0 border-0 shadow-2xl sm:max-w-2xl">
                <DialogHeader className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 text-left">
                    <div className="pr-6">
                        <DialogTitle className="text-base font-bold text-slate-900">
                            {doc.title}
                        </DialogTitle>
                        {doc.fileName ? (
                            <p className="mt-0.5 text-xs text-slate-500">{doc.fileName}</p>
                        ) : null}
                    </div>
                </DialogHeader>

                <div className="flex min-h-[300px] max-h-[70vh] w-full items-center justify-center bg-slate-950 p-4">
                    {isImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={doc.url}
                            alt={doc.fileName || doc.title}
                            className="max-h-[65vh] w-auto max-w-full rounded-lg object-contain shadow-lg"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-white">
                            <FileText className="h-16 w-16 text-slate-400 mb-3" />
                            <p className="text-sm font-semibold">{doc.fileName || 'Document File'}</p>
                            <p className="text-xs text-slate-400 mt-1 mb-4">Click below to open or download the full document</p>
                            <a
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
                            >
                                Open document
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-3.5 text-xs text-slate-500">
                    <span className="font-medium truncate max-w-[60%]">{doc.fileName || doc.title}</span>
                    <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-[#33375D] hover:underline"
                    >
                        Open full size in new tab
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ProfileSnapshotView({
    snapshot,
    onPreviewDoc,
}: {
    snapshot: DisasterSurveyProfileSnapshot;
    onPreviewDoc: (doc: { title: string; url: string; fileName?: string }) => void;
}) {
    const rows: Array<{ label: string; value: React.ReactNode }> = [
        { label: 'Address', value: snapshot.address },
        {
            label: 'Household size',
            value: snapshot.householdSize != null ? String(snapshot.householdSize) : undefined,
        },
        { label: 'ADA / accessibility', value: snapshot.ada },
        { label: 'Medical needs', value: snapshot.medical },
        { label: 'Pets & livestock', value: snapshot.pets },
        { label: 'Transportation', value: snapshot.transport },
        { label: 'Lodging preferences', value: snapshot.lodging },
        {
            label: 'Primary residence',
            value: snapshot.isPrimaryAddress,
        },
        {
            label: 'Residence inspection allowed',
            value: snapshot.allowResidenceInspection,
        },
    ];

    return (
        <dl className="space-y-3 rounded-lg bg-slate-50 p-4">
            {rows.map(({ label, value }) =>
                value != null && String(value).trim() !== '' ? (
                    <div key={label}>
                        <dt className="font-medium text-slate-800">{label}</dt>
                        <dd className="text-slate-600 mt-0.5 whitespace-pre-wrap">{value}</dd>
                    </div>
                ) : null,
            )}
            {snapshot.alertLocations && snapshot.alertLocations.length > 0 ? (
                <div>
                    <dt className="font-medium text-slate-800">Alert locations</dt>
                    <dd className="text-slate-600 mt-0.5">
                        <ul className="list-disc pl-5 space-y-1">
                            {snapshot.alertLocations.map((loc) => (
                                <li key={loc}>{loc}</li>
                            ))}
                        </ul>
                    </dd>
                </div>
            ) : null}
            {snapshot.proofOfOwnership?.url ? (
                <div className="pt-1">
                    <dt className="font-medium text-slate-800 mb-1.5">Proof of ownership</dt>
                    <dd className="mt-0.5">
                        <DocumentThumbnailCard
                            title="Proof of Ownership"
                            url={snapshot.proofOfOwnership.url}
                            fileName={snapshot.proofOfOwnership.fileName}
                            onPreview={onPreviewDoc}
                        />
                    </dd>
                </div>
            ) : null}
            {snapshot.proofOfResidency?.url ? (
                <div className="pt-1">
                    <dt className="font-medium text-slate-800 mb-1.5">Proof of residency</dt>
                    <dd className="mt-0.5">
                        <DocumentThumbnailCard
                            title="Proof of Residency"
                            url={snapshot.proofOfResidency.url}
                            fileName={snapshot.proofOfResidency.fileName}
                            onPreview={onPreviewDoc}
                        />
                    </dd>
                </div>
            ) : null}
        </dl>
    );
}

export default function DisasterSurveysPage() {
    const { me } = useUser();
    const role = (me?.role || '').toLowerCase();
    const isSuperAdmin = role === 'super-admin';
    const allScopeLabel = isSuperAdmin
        ? 'All users of our app'
        : 'All users in allocated full area';

    const [tab, setTab] = useState<'campaigns' | 'responses'>('responses');
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [responses, setResponses] = useState<ResponseRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [dispatchingId, setDispatchingId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [titleError, setTitleError] = useState('');
    const [targetMode, setTargetMode] = useState<'alert_area' | 'specific' | 'all_scope'>(
        'alert_area',
    );
    const [userSearch, setUserSearch] = useState('');
    const [searchResults, setSearchResults] = useState<TargetUser[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<TargetUser[]>([]);
    const [fundingFilter, setFundingFilter] = useState<string>('all');
    const [detail, setDetail] = useState<ResponseDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [fundingStatus, setFundingStatus] = useState('pending');
    const [fundingNotes, setFundingNotes] = useState('');
    const [savingFunding, setSavingFunding] = useState(false);
    const [requestingMissing, setRequestingMissing] = useState(false);
    const [previewDoc, setPreviewDoc] = useState<DocumentPreviewState>(null);

    const loadCampaigns = useCallback(async () => {
        const res = await fetch('/api/admin/disaster-surveys/campaigns', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load campaigns');
        const data = await res.json();
        setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    }, []);

    const loadResponses = useCallback(async () => {
        const qs =
            fundingFilter !== 'all' ? `?fundingStatus=${encodeURIComponent(fundingFilter)}` : '';
        const res = await fetch(`/api/admin/disaster-surveys/responses${qs}`, {
            credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load responses');
        const data = await res.json();
        setResponses(Array.isArray(data.responses) ? data.responses : []);
    }, [fundingFilter]);

    useEffect(() => {
        setLoading(true);
        Promise.all([loadCampaigns(), loadResponses()])
            .catch(() => toast.error('Failed to load disaster surveys'))
            .finally(() => setLoading(false));
    }, [loadCampaigns, loadResponses]);

    useEffect(() => {
        if (targetMode !== 'specific') {
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
            fetch(`/api/admin/disaster-surveys/target-users?q=${encodeURIComponent(q)}`, {
                credentials: 'include',
            })
                .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Search failed'))))
                .then((data) => setSearchResults(Array.isArray(data.users) ? data.users : []))
                .catch(() => setSearchResults([]))
                .finally(() => setSearchLoading(false));
        }, 300);

        return () => window.clearTimeout(timer);
    }, [userSearch, targetMode]);

    const toggleSelectedUser = (user: TargetUser, checked: boolean) => {
        setSelectedUsers((prev) => {
            if (checked) {
                if (prev.some((u) => u.id === user.id)) return prev;
                return [...prev, user];
            }
            return prev.filter((u) => u.id !== user.id);
        });
    };

    const createCampaign = async (dispatch: boolean) => {
        if (!newTitle.trim()) {
            setTitleError('Campaign title is required');
            toast.error('Campaign title is required');
            return;
        }
        setTitleError('');
        if (targetMode === 'specific' && dispatch && selectedUsers.length === 0) {
            toast.error('Select at least one user to dispatch');
            return;
        }
        setCreating(true);
        try {
            const res = await fetch('/api/admin/disaster-surveys/campaigns', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTitle.trim(),
                    description: newDescription.trim(),
                    dispatch,
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
                    ? `Campaign dispatched to ${data.dispatch?.invited ?? 0} users (${data.dispatch?.pushSent ?? 0} push, ${data.dispatch?.emailSent ?? 0} email)`
                    : 'Campaign created',
            );
            if (
                dispatch &&
                (data.dispatch?.invited ?? 0) > 0 &&
                (data.dispatch?.pushSent ?? 0) === 0
            ) {
                toast.message(
                    'No remote Expo push tokens on device yet — users still get in-app notifications. Open the mobile app once (with notification permission) then re-dispatch, or ensure FCM is configured for the Android build.',
                );
            }
            setNewTitle('');
            setNewDescription('');
            setTitleError('');
            setTargetMode('alert_area');
            setUserSearch('');
            setSearchResults([]);
            setSelectedUsers([]);
            await loadCampaigns();
            if (dispatch) await loadResponses();
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
            const res = await fetch(`/api/admin/disaster-surveys/campaigns/${id}/dispatch`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Dispatch failed');
            const data = await res.json();
            toast.success(
                `Invited ${data.invited} users (${data.pushSent} push, ${data.emailSent} email)`,
            );
            if ((data.invited ?? 0) > 0 && (data.pushSent ?? 0) === 0) {
                toast.message(
                    'No remote Expo push tokens saved for those users yet. They still receive in-app notifications; open the app on-device to register push, then re-dispatch.',
                );
            }
            await loadCampaigns();
        } catch {
            toast.error('Failed to dispatch campaign');
        } finally {
            setDispatchingId(null);
        }
    };

    const openDetail = async (id: string) => {
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/admin/disaster-surveys/responses/${id}`, {
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setDetail(data.response);
            setFundingStatus(data.response.fundingStatus);
            setFundingNotes(data.response.fundingNotes ?? '');
        } catch {
            toast.error('Failed to load response detail');
        } finally {
            setDetailLoading(false);
        }
    };

    const saveFunding = async () => {
        if (!detail) return;
        setSavingFunding(true);
        try {
            const res = await fetch(`/api/admin/disaster-surveys/responses/${detail.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fundingStatus, fundingNotes }),
            });
            if (!res.ok) throw new Error('Update failed');
            toast.success('Funding status updated');
            setDetail(null);
            await loadResponses();
        } catch {
            toast.error('Failed to update funding');
        } finally {
            setSavingFunding(false);
        }
    };

    const requestMissingDetails = async () => {
        if (!detail) return;
        const missing = detail.missingOptionalFields ?? [];
        if (missing.length === 0) {
            toast.message('This user already provided comments, pictures, and videos');
            return;
        }
        setRequestingMissing(true);
        try {
            const res = await fetch(
                `/api/admin/disaster-surveys/responses/${detail.id}/request-missing-info`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: missing }),
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
            await loadResponses();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to send reminder');
        } finally {
            setRequestingMissing(false);
        }
    };

    return (
        <AdminPageShell>
            <AdminPageHeader
                title="Disaster Surveys"
                description="Relief survey invitations, citizen responses, and funding review"
            />

            <div className="flex gap-2 mb-6">
                {(['responses', 'campaigns'] as const).map((key) => (
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
                <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading…
                </div>
            ) : tab === 'campaigns' ? (
                <div className="space-y-6">
                    <Card className="p-6 space-y-4">
                        <h3 className="font-bold text-slate-900">Create manual campaign</h3>
                        <div className="grid gap-3 max-w-xl">
                            <div>
                                <Label htmlFor="camp-title">Title</Label>
                                <Input
                                    id="camp-title"
                                    value={newTitle}
                                    onChange={(e) => {
                                        setNewTitle(e.target.value);
                                        if (titleError) setTitleError('');
                                    }}
                                    placeholder="e.g. Tornado — Central Arkansas"
                                    aria-invalid={Boolean(titleError)}
                                    className={titleError ? 'border-red-500 focus-visible:ring-red-500' : undefined}
                                />
                                {titleError ? (
                                    <p className="mt-1 text-sm text-red-600">{titleError}</p>
                                ) : null}
                            </div>
                            <div>
                                <Label htmlFor="camp-desc">Description</Label>
                                <Textarea
                                    id="camp-desc"
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    rows={3}
                                />
                            </div>
                            <div>
                                <Label>Recipients</Label>
                                <Select
                                    value={targetMode}
                                    onValueChange={(v) =>
                                        setTargetMode(v as 'alert_area' | 'specific' | 'all_scope')
                                    }
                                >
                                    <SelectTrigger className="max-w-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="alert_area">
                                            All users in active alert areas
                                        </SelectItem>
                                        <SelectItem value="specific">Select specific users</SelectItem>
                                        <SelectItem value="all_scope">{allScopeLabel}</SelectItem>
                                    </SelectContent>
                                </Select>
                                {targetMode === 'all_scope' ? (
                                    <p className="text-xs text-slate-500 mt-1.5">
                                        {isSuperAdmin
                                            ? 'Survey invitations will be sent to every approved mobile app user.'
                                            : 'Survey invitations will be sent to all approved mobile users inside your license area (state, county, or radius).'}
                                    </p>
                                ) : null}
                            </div>
                            {targetMode === 'specific' && (
                                <div className="space-y-3 max-w-xl border rounded-lg p-4 bg-slate-50/50">
                                    <div>
                                        <Label htmlFor="user-search">Search users</Label>
                                        <Input
                                            id="user-search"
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.target.value)}
                                            placeholder="Name or email (min 2 characters)"
                                        />
                                    </div>
                                    {searchLoading && (
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Searching…
                                        </div>
                                    )}
                                    {searchResults.length > 0 && (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {searchResults.map((user) => {
                                                const checked = selectedUsers.some(
                                                    (u) => u.id === user.id,
                                                );
                                                return (
                                                    <label
                                                        key={user.id}
                                                        className="flex items-start gap-3 p-2 rounded-md hover:bg-white cursor-pointer"
                                                    >
                                                        <Checkbox
                                                            checked={checked}
                                                            onCheckedChange={(v) =>
                                                                toggleSelectedUser(user, v === true)
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
                                                            toggleSelectedUser(user, false)
                                                        }
                                                        aria-label={`Remove ${user.name}`}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs text-slate-500">
                                        Only approved mobile users can be selected.
                                    </p>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <Button disabled={creating} onClick={() => void createCampaign(false)}>
                                    Save draft
                                </Button>
                                <Button disabled={creating} onClick={() => void createCampaign(true)}>
                                    {creating ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Send className="w-4 h-4 mr-2" />
                                    )}
                                    Create &amp; dispatch
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <div className="space-y-3">
                        {campaigns.map((c) => (
                            <Card key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="font-semibold text-slate-900">{c.title}</div>
                                    <div className="text-sm text-slate-500 mt-1">
                                        {c.triggerType} · {targetModeLabel(c)} · {c.invitedCount}{' '}
                                        invited · {c.responseCount} responses
                                    </div>
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
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                'Dispatch'
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </Card>
                        ))}
                        {campaigns.length === 0 && (
                            <p className="text-slate-500 text-sm">No campaigns yet.</p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 max-w-xs">
                        <Label>Funding status</Label>
                        <Select value={fundingFilter} onValueChange={setFundingFilter}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                {Object.entries(FUNDING_LABELS).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>
                                        {v}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        {responses.map((r) => (
                            <Card
                                key={r.id}
                                className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => void openDetail(r.id)}
                            >
                                <div className="flex flex-wrap justify-between gap-2">
                                    <div>
                                        <div className="font-semibold">{r.userName}</div>
                                        <div className="text-sm text-slate-500">
                                            {r.userEmail} · {r.userState || '—'}
                                        </div>
                                        <div className="text-xs text-slate-400 mt-1">
                                            {new Date(r.submittedAt).toLocaleString()}
                                        </div>
                                    </div>
                                    <Badge
                                        className={cn(
                                            r.fundingStatus === 'approved' && 'bg-green-600',
                                            r.fundingStatus === 'denied' && 'bg-red-600',
                                        )}
                                    >
                                        {FUNDING_LABELS[r.fundingStatus] ?? r.fundingStatus}
                                    </Badge>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {r.immediateNeeds.map((n) => (
                                        <Badge key={n} variant="secondary" className="text-xs">
                                            {NEED_LABELS[n] ?? n}
                                        </Badge>
                                    ))}
                                </div>
                            </Card>
                        ))}
                        {responses.length === 0 && (
                            <p className="text-slate-500 text-sm">No survey responses yet.</p>
                        )}
                    </div>
                </div>
            )}

            <Dialog open={Boolean(detail) || detailLoading} onOpenChange={() => setDetail(null)}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Survey response</DialogTitle>
                    </DialogHeader>
                    {detailLoading && !detail ? (
                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    ) : detail ? (
                        <div className="space-y-4 text-sm">
                            <div>
                                <div className="font-semibold">{String(detail.userSnapshot?.name ?? detail.userName)}</div>
                                <div className="text-slate-500">{String(detail.userSnapshot?.email ?? detail.userEmail)}</div>
                                <div className="text-slate-500">{String(detail.userSnapshot?.address ?? '')}</div>
                            </div>

                            <div>
                                <div className="font-medium mb-1">Immediate needs</div>
                                <div className="flex flex-wrap gap-1">
                                    {detail.immediateNeeds.map((n) => (
                                        <Badge key={n} variant="secondary">
                                            {NEED_LABELS[n] ?? n}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="font-medium mb-1">Optional incident details</div>
                                <div className="space-y-3 rounded-lg bg-slate-50 p-4">
                                    <div>
                                        <div className="font-medium text-slate-800">Comments</div>
                                        <p className="text-slate-600 mt-0.5 whitespace-pre-wrap">
                                            {detail.comments?.trim()
                                                ? detail.comments
                                                : 'Not provided'}
                                        </p>
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-800">
                                            Incident pictures
                                        </div>
                                        {detail.incidentPictures &&
                                        detail.incidentPictures.length > 0 ? (
                                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {detail.incidentPictures.map((pic, idx) => (
                                                    <button
                                                        key={pic.url + idx}
                                                        type="button"
                                                        onClick={() =>
                                                            setPreviewDoc({
                                                                title: 'Incident Picture',
                                                                url: pic.url,
                                                                fileName: pic.fileName || `Picture ${idx + 1}`,
                                                            })
                                                        }
                                                        className="group relative block h-24 w-full overflow-hidden rounded-xl border border-slate-200 bg-white cursor-pointer"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={pic.url}
                                                            alt={pic.fileName || 'Incident picture'}
                                                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Eye className="h-5 w-5 text-white drop-shadow-md" />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-slate-600 mt-0.5">Not provided</p>
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-800">
                                            Incident videos
                                        </div>
                                        {detail.incidentVideos &&
                                        detail.incidentVideos.length > 0 ? (
                                            <div className="mt-2 space-y-3">
                                                {detail.incidentVideos.map((vid) => {
                                                    const poster = cloudinaryVideoPoster(vid.url);
                                                    return (
                                                        <div
                                                            key={vid.url}
                                                            className="overflow-hidden rounded-md border bg-black"
                                                        >
                                                            <video
                                                                src={vid.url}
                                                                controls
                                                                preload="metadata"
                                                                playsInline
                                                                poster={poster}
                                                                className="aspect-video w-full max-h-64 bg-black object-contain"
                                                            >
                                                                Your browser does not support video playback.
                                                            </video>
                                                            <div className="flex items-center justify-between gap-2 bg-white px-3 py-2">
                                                                <span className="truncate text-xs text-slate-600">
                                                                    {vid.fileName || 'Incident video'}
                                                                </span>
                                                                <a
                                                                    href={vid.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="shrink-0 text-xs text-blue-600 underline"
                                                                >
                                                                    Open full size
                                                                </a>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-slate-600 mt-0.5">Not provided</p>
                                        )}
                                    </div>

                                    {(detail.missingOptionalFields?.length ?? 0) > 0 ? (
                                        <div className="border-t pt-3 space-y-2">
                                            <p className="text-xs text-amber-700">
                                                Missing:{' '}
                                                {(detail.missingOptionalFields ?? [])
                                                    .map((f) => MISSING_FIELD_LABELS[f] ?? f)
                                                    .join(', ')}
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={requestingMissing}
                                                onClick={() => void requestMissingDetails()}
                                            >
                                                {requestingMissing ? (
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                ) : (
                                                    <Send className="w-4 h-4 mr-2" />
                                                )}
                                                Request missing details (push, email &amp; in-app)
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
                                    ) : (
                                        <p className="text-xs text-emerald-700">
                                            All optional details were provided.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="font-medium mb-1">Profile snapshot</div>
                                <ProfileSnapshotView
                                    snapshot={detail.profileSnapshot}
                                    onPreviewDoc={(doc) => setPreviewDoc(doc)}
                                />
                            </div>

                            <div className="border-t pt-4 space-y-3">
                                <div className="font-medium">Funding review</div>
                                <Select value={fundingStatus} onValueChange={setFundingStatus}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(FUNDING_LABELS).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Textarea
                                    value={fundingNotes}
                                    onChange={(e) => setFundingNotes(e.target.value)}
                                    placeholder="Internal notes for funding decision"
                                    rows={3}
                                />
                                <Button disabled={savingFunding} onClick={() => void saveFunding()}>
                                    {savingFunding ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : null}
                                    Save funding decision
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            {/* Document Lightbox Modal Popup */}
            <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
        </AdminPageShell>
    );
}
