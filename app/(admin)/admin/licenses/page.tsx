'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Plus,
    Search,
    Building2,
    Shield,
    Terminal,
    Activity,
    Cpu,
    MousePointerClick,
    ShieldCheck,
    Globe,
    ExternalLink,
    Loader2,
    Briefcase,
    Calendar,
    ArrowUpRight,
    Users,
    Trash2,
    User,
    X,
} from 'lucide-react'
import { ProvisionLicenseModal } from '@/components/modals/provision-license-modal'
import { GrantLicenseModal } from '@/components/modals/grant-license-modal'
import { cn } from "@/lib/utils"
import { AdminPageHeader } from '@/components/admin-page-header'
import { toast } from 'sonner'

interface License {
    _id: string;
    organizationName: string;
    status: string;
    subscriptionDetails: {
        planType: string;
        endDate: string | null;
    };
    assignedSubAdminId: {
        _id: string;
        name: string;
        email: string;
        accountStatus: string;
    };
    createdAt: string;
}

/** Users who requested a license (not yet provisioned) — same source as super-admin dashboard list */
interface LicenseRequestUser {
    _id: string
    name: string
    email: string
    role?: string
    createdAt: string
    requestedOrgName?: string
    city?: string
    country?: string
}

type LicenseTableRow =
    | { kind: 'pending'; user: LicenseRequestUser }
    | { kind: 'license'; lic: License }

export default function LicenseManagement() {
    const [licenses, setLicenses] = useState<License[]>([])
    const [licenseRequests, setLicenseRequests] = useState<LicenseRequestUser[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [grantModalUser, setGrantModalUser] = useState<LicenseRequestUser | null>(null)
    const [isGrantModalOpen, setIsGrantModalOpen] = useState(false)

    const fetchLicenses = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/licenses')
            if (res.ok) {
                const data = await res.json()
                setLicenses(data.licenses)
            }
        } catch (error) {
            console.error('Error fetching licenses:', error)
        }
    }, [])

    const fetchLicenseRequests = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/users?requestedLicense=true')
            const data = await res.json()
            if (res.ok) {
                setLicenseRequests(data.users || [])
            } else {
                toast.error(data.error || 'Failed to load license requests')
            }
        } catch {
            toast.error('Failed to load license requests')
        }
    }, [])

    const refreshAll = useCallback(async () => {
        setIsLoading(true)
        try {
            await Promise.all([fetchLicenses(), fetchLicenseRequests()])
        } finally {
            setIsLoading(false)
        }
    }, [fetchLicenses, fetchLicenseRequests])

    useEffect(() => {
        refreshAll()
    }, [refreshAll])

    const handleDeleteLicense = async (licenseId: string) => {
        if (!confirm('Are you sure you want to remove this organization and all its settings?')) return

        setDeletingId(licenseId)
        try {
            const res = await fetch(`/api/admin/licenses?licenseId=${licenseId}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                refreshAll()
            } else {
                const data = await res.json()
                alert(data.error || 'Failed to remove license')
            }
        } catch (error) {
            console.error('Error deleting license:', error)
            alert('An error occurred while removing the license')
        } finally {
            setDeletingId(null)
        }
    }

    const tableRows: LicenseTableRow[] = [
        ...licenseRequests.map((user) => ({ kind: 'pending' as const, user })),
        ...licenses.map((lic) => ({ kind: 'license' as const, lic })),
    ]

    const q = searchQuery.toLowerCase().trim()
    const filteredRows = tableRows.filter((row) => {
        if (!q) return true
        if (row.kind === 'license') {
            const lic = row.lic
            return (
                lic.organizationName.toLowerCase().includes(q) ||
                (lic.assignedSubAdminId?.email || '').toLowerCase().includes(q) ||
                (lic.assignedSubAdminId?.name || '').toLowerCase().includes(q)
            )
        }
        const u = row.user
        const org = (u.requestedOrgName || '').toLowerCase()
        return (
            org.includes(q) ||
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.city || '').toLowerCase().includes(q) ||
            (u.country || '').toLowerCase().includes(q)
        )
    })

    const stats = {
        total: licenses.length + licenseRequests.length,
        active: licenses.filter((l) => l.status === 'active').length,
        pending: licenses.filter((l) => l.status !== 'active').length + licenseRequests.length,
    }

    const openGrant = (user: LicenseRequestUser) => {
        setGrantModalUser(user)
        setIsGrantModalOpen(true)
    }

    const handleRejectRequest = async (userId: string) => {
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    accountStatus: 'rejected',
                    requestedLicense: false,
                }),
            })
            if (res.ok) {
                toast.success('Request rejected')
                refreshAll()
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to reject')
            }
        } catch {
            toast.error('Error rejecting request')
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[#33375D]" />
                    <p className="text-slate-500 font-bold animate-pulse">Loading licenses...</p>
                </div>
            </div>
        )
    }

    return (
        <main className="min-h-screen bg-slate-50/50 pb-20">
            <div className="px-6 lg:px-12 pt-8 space-y-8 max-w-[1600px] mx-auto">

                <AdminPageHeader
                    title="Manage Licenses"
                    description="View and manage all organization licenses in one place."
                    actions={
                        <Button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex h-12 gap-2 rounded-xl bg-slate-900 px-6 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-slate-800 active:scale-95"
                        >
                            <Plus size={18} />
                            New License
                        </Button>
                    }
                />

                {/* Banner Gradient */}
                <div className="bg-[#33375D] rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl shadow-[#33375D]/20 group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl transition-all group-hover:bg-white/20" />
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-black uppercase tracking-widest mb-4">
                                <ShieldCheck size={12} /> License Overview
                            </div>
                            <h2 className="text-3xl font-black tracking-tight mb-3">Organization List</h2>
                            <p className="max-w-2xl font-medium leading-relaxed text-white/90">Manage your organizations, assign admins, and check active licenses for the entire network.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-6 shrink-0">
                            {[
                                { label: 'TOTAL', value: stats.total, icon: Globe },
                                { label: 'ACTIVE', value: stats.active, icon: ShieldCheck },
                                { label: 'PENDING', value: stats.pending, icon: Activity }
                            ].map((stat, i) => (
                                <div key={i} className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex flex-col items-center">
                                    <stat.icon className="w-5 h-5 mb-2 opacity-60" />
                                    <p className="text-3xl font-black">{stat.value}</p>
                                    <p className="text-[9px] font-bold opacity-60 tracking-widest">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-3 border-l-4 border-l-[#33375D] pl-4 text-slate-900">
                        <h2 className="text-2xl font-black tracking-tight uppercase">License List</h2>
                    </div>
                    <div className="relative group w-full md:w-96">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <Input
                            placeholder="Search by organization or admin..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-12 bg-white border-slate-200 text-slate-900 placeholder-slate-400 rounded-2xl h-14 text-sm font-medium focus:ring-2 focus:ring-blue-500/10 transition-all shadow-sm"
                        />
                    </div>
                </div>

                {/* License Table/Grid */}
                <div className="grid grid-cols-1 gap-4">
                    {filteredRows.length === 0 ? (
                        <Card className="p-20 border-dashed border-2 border-slate-200 rounded-[40px] flex flex-col items-center justify-center text-center space-y-6">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 italic font-black text-slate-200 text-4xl">?</div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black text-slate-900 uppercase">No Licenses Found</h3>
                                <p className="text-sm text-slate-500 max-w-xs mx-auto">No operational nodes match your current search criteria in the master registry.</p>
                            </div>
                        </Card>
                    ) : (
                        <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Organization</th>
                                            <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Admin</th>
                                            <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                            <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Date Created</th>
                                            <th className="px-8 py-6 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredRows.map((row) =>
                                            row.kind === 'pending' ? (
                                                <tr key={`req-${row.user._id}`} className="group hover:bg-amber-50/20 transition-colors bg-amber-50/10">
                                                    <td className="px-8 py-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                                                                <User size={22} />
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-slate-900 uppercase tracking-tight">
                                                                    {row.user.requestedOrgName?.trim() || 'License request'}
                                                                </p>
                                                                <p className="text-[10px] font-bold text-slate-400 tracking-widest">
                                                                    Applicant · ID {row.user._id.slice(-8).toUpperCase()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-sm font-black text-slate-700">{row.user.name}</span>
                                                            <span className="text-[10px] font-bold text-slate-400">{row.user.email}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm bg-slate-100 text-slate-600 border-slate-200">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                                                            pending
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <span className="text-xs font-bold italic text-slate-400">
                                                            {new Date(row.user.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                type="button"
                                                                onClick={() => openGrant(row.user)}
                                                                className="h-10 rounded-xl bg-[#33375D] px-4 font-black text-[10px] uppercase tracking-widest text-white hover:bg-[#2B2F50]"
                                                            >
                                                                Approve
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                onClick={() => handleRejectRequest(row.user._id)}
                                                                className="h-10 w-10 p-0 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                                title="Reject request"
                                                            >
                                                                <X size={18} />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                <tr key={row.lic._id} className="group hover:bg-blue-50/30 transition-colors">
                                                    <td className="px-8 py-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-white group-hover:text-blue-600 group-hover:shadow-md transition-all border border-slate-100">
                                                                <Building2 size={24} />
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-slate-900 uppercase tracking-tight">{row.lic.organizationName}</p>
                                                                <p className="text-[10px] font-bold text-slate-400 tracking-widest">Code: {row.lic._id.slice(-8).toUpperCase()}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-sm font-black text-slate-700">{row.lic.assignedSubAdminId?.name || 'UNASSIGNED'}</span>
                                                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                                {row.lic.assignedSubAdminId?.email || 'N/A'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className={cn(
                                                            "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                                                            row.lic.status === 'active'
                                                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                                : "bg-amber-50 text-amber-600 border-amber-100"
                                                        )}>
                                                            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", row.lic.status === 'active' ? "bg-emerald-500" : "bg-amber-500")} />
                                                            {row.lic.status}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="flex flex-col text-slate-400">
                                                            <span className="text-xs font-bold italic">{new Date(row.lic.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6 text-right">
                                                        {row.lic.status === 'active' && (
                                                            <Button
                                                                variant="ghost"
                                                                onClick={() => handleDeleteLicense(row.lic._id)}
                                                                disabled={deletingId === row.lic._id}
                                                                className="h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-600 hover:text-white transition-all flex gap-2 ml-auto"
                                                            >
                                                                {deletingId === row.lic._id ? <Loader2 size={14} className="animate-spin text-[#33375D]" /> : <Trash2 size={14} />}
                                                                Remove
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        )}
                                    </tbody>
                                </table>
                            </div>

                        </div>
                    )}
                </div>
            </div>

            <ProvisionLicenseModal 
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={refreshAll}
            />

            {grantModalUser && (
                <GrantLicenseModal
                    user={grantModalUser}
                    isOpen={isGrantModalOpen}
                    onClose={() => {
                        setIsGrantModalOpen(false)
                        setGrantModalUser(null)
                    }}
                    onSuccess={refreshAll}
                />
            )}
        </main>
    )
}
