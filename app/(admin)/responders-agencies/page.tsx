'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageShell } from '@/components/admin-page-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
    Eye,
    UserPlus,
    Info,
    Users,
    Clock,
    Edit,
    Trash2,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { RESPONDER_VERTICAL_LABELS, type ResponderVertical } from '@/lib/responder-verticals'
import { RESPONDER_INVITE_OPTIONS } from '@/lib/responder-invite-options'

type ResponderRow = {
    _id: string
    name: string
    email: string
    responderFunction?: string
    responderVertical?: string
    accountStatus?: string
    city?: string
    state?: string
}

type InviteRow = {
    id: string
    email: string
    responderFunction: string
    responderVertical: string
    expiresAt: string
    createdAt: string
}

export default function RespondersAgenciesPage() {
    const [adminUsers] = useState<any[]>([
        { id: 1, name: 'Mayor Helena Rivers', role: 'City Leader', org: 'Municipal Command', access: true, incidentRole: 'Executive Oversight', status: 'Active' },
        { id: 2, name: 'Commander Maria Garcia', role: 'Incident Commander', org: 'Ready2Go HQ', access: true, incidentRole: 'Strategic Lead', status: 'Active' },
        { id: 3, name: 'Director James Wilson', role: 'Operations Chief', org: 'Local EOC', access: true, incidentRole: 'Tactical Director', status: 'Active' },
    ])
    const [nonprofits] = useState<any[]>([
        { id: 'N1', name: 'Red Cross', function: 'Sheltering', area: 'North Zone', status: 'Active', contact: 'Assigned' },
        { id: 'N2', name: 'World Central Kitchen', function: 'Food Services', area: 'Central Hub', status: 'Active', contact: 'Assigned' },
    ])
    const [businesses] = useState<any[]>([
        { id: 'B1', name: 'PowerCo', sector: 'Utilities', role: 'Power Restoration', area: 'Industrial Zone', status: 'Active' },
        { id: 'B2', name: 'PharmaPlus', sector: 'Pharmacy', role: 'Medication Access', area: 'East District', status: 'Active' },
    ])

    const [responders, setResponders] = useState<ResponderRow[]>([])
    const [invites, setInvites] = useState<InviteRow[]>([])
    const [inviteOptions, setInviteOptions] = useState<{ id: string; label: string }[]>([])
    const [dialogOpen, setDialogOpen] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteOptionId, setInviteOptionId] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const [usersPage, setUsersPage] = useState(1);
    const [usersTotal, setUsersTotal] = useState(0);
    const [invitesPage, setInvitesPage] = useState(1);
    const [invitesTotal, setInvitesTotal] = useState(0);

    const [editOpen, setEditOpen] = useState(false);
    const [editResponder, setEditResponder] = useState<ResponderRow | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            const [usersRes, invRes] = await Promise.all([
                fetch(`/api/admin/users?role=responder&page=${usersPage}&limit=10`),
                fetch(`/api/admin/responder-invites?page=${invitesPage}&limit=10`),
            ])
            if (usersRes.ok) {
                const data = await usersRes.json()
                const list = (data.users || []).map((u: any) => ({
                    _id: u._id,
                    name: u.name,
                    email: u.email,
                    responderFunction: u.responderFunction,
                    responderVertical: u.responderVertical,
                    accountStatus: u.accountStatus,
                    city: u.city,
                    state: u.state,
                }))
                setResponders(list)
                setUsersTotal(data.total || 0)
            }
            if (invRes.ok) {
                const data = await invRes.json()
                setInvites(data.invites || [])
                setInvitesTotal(data.total || 0)
                setInviteOptions((data.options || []).map((o: { id: string; label: string }) => ({ id: o.id, label: o.label })))
                setInviteOptionId((prev) => prev || (data.options?.[0]?.id as string) || '')
            }
        } catch {
            toast.error('Could not load responders or invites')
        }
    }, [usersPage, invitesPage])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const verticalLabel = (v: string | undefined) => {
        if (!v) return ''
        const key = v as ResponderVertical
        return RESPONDER_VERTICAL_LABELS[key] || v
    }

    const sendInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!inviteEmail.trim() || !inviteOptionId) {
            toast.error('Email and role/function are required')
            return
        }
        setSubmitting(true)
        try {
            const res = await fetch('/api/admin/responder-invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail.trim(), inviteOptionId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                toast.error(data.error || 'Invite failed')
                return
            }
            if (data.emailSent) {
                toast.success('Invitation email sent.')
            } else if (typeof data.emailError === 'string' && data.emailError.trim()) {
                toast.error('Invite saved; email could not be sent', {
                    description: data.emailError.slice(0, 500),
                })
            } else {
                toast.message('Invite created — email transport not configured', {
                    description:
                        'Copy the signup link below or set SMTP for invites: RESPONDER_INVITE_SMTP_URL and RESPONDER_INVITE_SMTP_FROM (or SMTP_HOST / SMTP_USER / SMTP_PASS plus SMTP_FROM).',
                })
            }
            if (data.inviteLink) {
                try {
                    await navigator.clipboard.writeText(data.inviteLink)
                    toast.info('Signup link copied to clipboard')
                } catch {
                    /* ignore */
                }
            }
            setInviteEmail('')
            setDialogOpen(false)
            void loadData()
        } finally {
            setSubmitting(false)
        }
    }

    const openEdit = (user: ResponderRow) => {
        setEditResponder({ ...user });
        setEditOpen(true);
    };

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editResponder) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: editResponder._id,
                    name: editResponder.name,
                    responderFunction: editResponder.responderFunction,
                    responderVertical: editResponder.responderVertical,
                    accountStatus: editResponder.accountStatus
                }),
            });
            if (!res.ok) throw new Error('Failed to update responder');
            toast.success('Responder updated');
            setEditOpen(false);
            void loadData();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/admin/users?userId=${deleteId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete responder');
            toast.success('Responder deleted');
            setDeleteOpen(false);
            void loadData();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const renderPagination = (page: number, total: number, setPage: (p: number) => void) => {
        const totalPages = Math.ceil(total / 10);
        if (totalPages <= 1) return null;
        return (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] font-medium text-slate-500">
                    Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="h-7 px-2 text-[11px]"
                    >
                        <ChevronLeft size={14} />
                        Prev
                    </Button>
                    <span className="text-[11px] font-bold text-slate-700 px-2">{page} / {totalPages}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="h-7 px-2 text-[11px]"
                    >
                        Next
                        <ChevronRight size={14} />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <AdminPageShell>
            <AdminPageHeader
                title="Responders & Agencies"
                titleUppercase={false}
                description="Manage administrative access, essential personnel, and responder actions for active and planned incidents."
            />

            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-white">
                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Administrative Users & Decision Makers</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#FAFBFC] border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Organization</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Admin Access</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Incident Role</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {adminUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-5">
                                        <span className="font-bold text-slate-900">{user.name}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-slate-600 text-sm">{user.role}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-slate-600 text-sm">{user.org}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <Switch checked={user.access} onCheckedChange={() => {}} className="data-[state=checked]:bg-[#33375D]" />
                                    </td>
                                    <td className="px-6 py-5">
                                        <button type="button" className="text-slate-900 underline underline-offset-4 text-sm font-medium hover:text-blue-600 transition-colors">
                                            {user.incidentRole}
                                        </button>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex justify-end items-center gap-3">
                                            <button type="button" className="p-2 text-[#3B82F6] hover:bg-blue-50 rounded-lg transition-colors">
                                                <Eye size={16} />
                                            </button>
                                            <button type="button" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                                <Users size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden mt-8">
                <div className="p-6 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">External responders</h2>
                    <div className="flex items-center gap-2 bg-[#EFF6FF] px-4 py-2 rounded-lg border border-[#DBEAFE]">
                        <Info size={14} className="text-[#3B82F6]" />
                        <span className="text-[11px] font-medium text-[#3B82F6]">Invited responders complete signup via email link and appear here.</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#FAFBFC] border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role / function</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vertical</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Area</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {responders.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500 text-sm">
                                        No responders yet. Use “Add responder” to send an invitation.
                                    </td>
                                </tr>
                            ) : (
                                responders.map((user) => (
                                    <tr key={user._id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-5">
                                            <span className="font-bold text-slate-900">{user.name}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-slate-600 text-sm">{user.email}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-slate-600 text-sm">{user.responderFunction || '—'}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-slate-600 text-sm">{verticalLabel(user.responderVertical)}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-slate-600 text-sm">
                                                {[user.city, user.state].filter(Boolean).join(', ') || '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <Badge
                                                className={cn(
                                                    'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-none shadow-none',
                                                    user.accountStatus === 'approved'
                                                        ? 'bg-[#DCFCE7] text-[#166534]'
                                                        : 'bg-[#FEF9C3] text-[#854D0E]',
                                                )}
                                            >
                                                {user.accountStatus || 'approved'}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    title="Edit responder"
                                                    size="icon"
                                                    onClick={() => openEdit(user)}
                                                    className="h-8 w-8 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors"
                                                >
                                                    <Edit size={14} />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    title="Delete responder"
                                                    size="icon"
                                                    onClick={() => {
                                                        setDeleteId(user._id);
                                                        setDeleteOpen(true);
                                                    }}
                                                    className="h-8 w-8 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {renderPagination(usersPage, usersTotal, setUsersPage)}
            </Card>

            {invites.length > 0 && (
                <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden mt-8">
                    <div className="p-6 border-b border-slate-100 bg-white flex items-center gap-2">
                        <Clock size={18} className="text-slate-500" />
                        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Pending invitations</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-[#FAFBFC] border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role / function</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Expires</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {invites.map((inv) => (
                                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{inv.email}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{inv.responderFunction}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(inv.expiresAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {renderPagination(invitesPage, invitesTotal, setInvitesPage)}
                </Card>
            )}

            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden mt-8">
                <div className="p-6 border-b border-slate-100 bg-white">
                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Non-Profit Response Partners</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#FAFBFC] border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Organization</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Function</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Response Area</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Contact</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {nonprofits.map((org) => (
                                <tr key={org.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-5">
                                        <span className="font-bold text-slate-900">{org.name}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-slate-600 text-sm">{org.function}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-slate-600 text-sm">{org.area}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <Badge className="bg-[#DCFCE7] text-[#166534] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-none shadow-none">
                                            {org.status}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <span className="text-slate-500 text-sm">{org.contact}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden mt-8">
                <div className="p-6 border-b border-slate-100 bg-white">
                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Private Sector Response Partners</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#FAFBFC] border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Business</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sector</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Support Role</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Response Area</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {businesses.map((biz) => (
                                <tr key={biz.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-5">
                                        <span className="font-bold text-slate-900">{biz.name}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-slate-600 text-sm">{biz.sector}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-slate-600 text-sm">{biz.role}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-slate-600 text-sm">{biz.area}</span>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <Badge className="bg-[#DCFCE7] text-[#166534] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-none shadow-none">
                                            {biz.status}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add responder</DialogTitle>
                        <DialogDescription>
                            Send an email with a secure signup link. The invitee must sign up using the same address they were invited with.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={sendInvite} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="invite-email">Email</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="partner@agency.org"
                                required
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Role / function</Label>
                            <Select value={inviteOptionId} onValueChange={setInviteOptionId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {inviteOptions.map((o) => (
                                        <SelectItem key={o.id} value={o.id}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting} className="bg-[#33375D] hover:bg-[#44496B]">
                                {submitting ? 'Sending…' : 'Send invite'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit responder</DialogTitle>
                        <DialogDescription>Update the details and permissions for this responder.</DialogDescription>
                    </DialogHeader>
                    {editResponder && (
                        <form onSubmit={handleEditSave} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input
                                    value={editResponder.name || ''}
                                    onChange={(e) => setEditResponder({ ...editResponder, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Function / Role</Label>
                                <Select
                                    value={
                                        RESPONDER_INVITE_OPTIONS.find(
                                            (o) => o.responderFunction === editResponder.responderFunction
                                        )?.id || ''
                                    }
                                    onValueChange={(val) => {
                                        const opt = RESPONDER_INVITE_OPTIONS.find((o) => o.id === val)
                                        if (opt) {
                                            setEditResponder({
                                                ...editResponder,
                                                responderFunction: opt.responderFunction,
                                                responderVertical: opt.responderVertical,
                                            })
                                        }
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {RESPONDER_INVITE_OPTIONS.map((o) => (
                                            <SelectItem key={o.id} value={o.id}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Account Status</Label>
                                <Select
                                    value={editResponder.accountStatus || 'approved'}
                                    onValueChange={(val) => setEditResponder({ ...editResponder, accountStatus: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="approved">Approved</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="suspended">Suspended</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={submitting} className="bg-[#33375D] hover:bg-[#44496B]">
                                    {submitting ? 'Saving…' : 'Save changes'}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete responder?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to permanently delete this responder account? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <Button type="button" className="bg-rose-600 hover:bg-rose-700 text-white" disabled={submitting} onClick={() => void handleDelete()}>
                            {submitting ? 'Deleting…' : 'Yes, delete'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="fixed bottom-10 right-10 flex flex-col gap-4 z-50">
                <Button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className="w-16 h-16 rounded-full bg-[#33375D] hover:bg-[#44496B] text-white shadow-2xl flex items-center justify-center p-0 active:scale-95 transition-all group overflow-hidden"
                    aria-label="Add responder"
                >
                    <UserPlus size={24} className="group-hover:scale-110 transition-transform" />
                </Button>
            </div>
        </AdminPageShell>
    )
}
