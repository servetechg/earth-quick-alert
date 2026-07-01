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
import { Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';

type Campaign = {
    id: string;
    title: string;
    description: string;
    triggerType: string;
    status: string;
    invitedCount: number;
    responseCount: number;
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
};

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

function ProfileSnapshotView({ snapshot }: { snapshot: DisasterSurveyProfileSnapshot }) {
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
                <div>
                    <dt className="font-medium text-slate-800">Proof of ownership</dt>
                    <dd className="mt-0.5">
                        <a
                            href={snapshot.proofOfOwnership.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 underline"
                        >
                            {snapshot.proofOfOwnership.fileName}
                        </a>
                    </dd>
                </div>
            ) : null}
            {snapshot.proofOfResidency?.url ? (
                <div>
                    <dt className="font-medium text-slate-800">Proof of residency</dt>
                    <dd className="mt-0.5">
                        <a
                            href={snapshot.proofOfResidency.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 underline"
                        >
                            {snapshot.proofOfResidency.fileName}
                        </a>
                    </dd>
                </div>
            ) : null}
        </dl>
    );
}

export default function DisasterSurveysPage() {
    const [tab, setTab] = useState<'campaigns' | 'responses'>('responses');
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [responses, setResponses] = useState<ResponseRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [dispatchingId, setDispatchingId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [targetMode, setTargetMode] = useState<'alert_area' | 'specific'>('alert_area');
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
            toast.error('Campaign title is required');
            return;
        }
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
                    userIds:
                        targetMode === 'specific' ? selectedUsers.map((u) => u.id) : undefined,
                }),
            });
            if (!res.ok) throw new Error('Create failed');
            const data = await res.json();
            toast.success(
                dispatch
                    ? `Campaign dispatched to ${data.dispatch?.invited ?? 0} users`
                    : 'Campaign created',
            );
            setNewTitle('');
            setNewDescription('');
            setTargetMode('alert_area');
            setUserSearch('');
            setSearchResults([]);
            setSelectedUsers([]);
            await loadCampaigns();
            if (dispatch) await loadResponses();
        } catch {
            toast.error('Failed to create campaign');
        } finally {
            setCreating(false);
        }
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
            toast.success(`Invited ${data.invited} users (${data.pushSent} push, ${data.emailSent} email)`);
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
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="e.g. Tornado — Central Arkansas"
                                />
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
                                        setTargetMode(v as 'alert_area' | 'specific')
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
                                    </SelectContent>
                                </Select>
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
                                        {c.triggerType} ·{' '}
                                        {c.targetUserCount
                                            ? `${c.targetUserCount} specific users`
                                            : 'alert area targeting'}{' '}
                                        · {c.invitedCount} invited · {c.responseCount} responses
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
                                <div className="font-medium mb-1">Profile snapshot</div>
                                <ProfileSnapshotView snapshot={detail.profileSnapshot} />
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
        </AdminPageShell>
    );
}
