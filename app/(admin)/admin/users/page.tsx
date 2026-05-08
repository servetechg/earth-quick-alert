'use client'

import React, { useEffect, useState, useCallback } from "react"
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
    Users,
    CheckCircle,
    XCircle,
    Clock,
    Shield,
    User,
    Search,
    Filter,
    RefreshCw,
    MoreVertical,
    Mail,
    Calendar,
    ArrowUpRight,
    Building2,
    UserPlus,
    Activity,
    Lock,
    Unlock,
    Info,
    Eye,
    Settings,
    MapPin,
    Briefcase,
    Bell,
    ArrowLeft
} from "lucide-react"
import { toast } from "sonner"
import { GrantLicenseModal } from "@/components/modals/grant-license-modal"
import { AddUserModal } from "@/components/modals/add-user-modal"
import { cn } from "@/lib/utils"
import { AdminPageHeader } from '@/components/admin-page-header'

interface IUser {
    _id: string;
    name: string;
    email: string;
    role: string;
    accountStatus: string;
    licenseId?: string;
    requestedLicense?: boolean;
    city?: string;
    state?: string;
    zipcode?: string;
    country?: string;
    responderFunction?: string;
    createdAt: string;
}

export default function AdminUsersPage() {
    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    const [users, setUsers] = useState<IUser[]>([])
    const [organizations, setOrganizations] = useState<any[]>([])
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
    const [selectedOrgName, setSelectedOrgName] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [loadingOrgs, setLoadingOrgs] = useState(false)
    const [search, setSearch] = useState('')
    const [userRole, setUserRole] = useState<string | null>(null)
    const [selectedUser, setSelectedUser] = useState<IUser | null>(null)
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview')
    const [isGrantModalOpen, setIsGrantModalOpen] = useState(false)
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)

    const fetchOrganizations = async () => {
        setLoadingOrgs(true)
        try {
            const res = await fetch('/api/admin/licenses')
            const data = await res.json()
            if (res.ok) {
                setOrganizations(data.licenses || [])
            }
        } catch (error) {
            console.error('Failed to fetch orgs', error)
        } finally {
            setLoadingOrgs(false)
        }
    }

    const fetchUsers = useCallback(async (orgId: string | null = null) => {
        setLoading(true)
        try {
            const url = orgId
                ? `/api/admin/users?licenseId=${orgId}`
                : `/api/admin/users`;

            const response = await fetch(url)
            const data = await response.json()
            if (response.ok) {
                setUsers((data.users || []) as IUser[])
            } else {
                toast.error(data.error || 'Failed to fetch users')
            }
        } catch (error) {
            toast.error('Error connecting to the server')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        setMounted(true)
        const role = localStorage.getItem('userRole')
        setUserRole(role)

        if (role === 'super-admin') {
            fetchOrganizations()
        }
        fetchUsers()
    }, [fetchUsers])

    const handleOrgSelect = (orgId: string, orgName: string) => {
        if (selectedOrgId === orgId && viewMode === 'detail') {
            setViewMode('overview')
            setSelectedOrgId(null)
            setSelectedOrgName('')
            setSelectedUserId(null)
            fetchUsers(null)
        } else {
            setSelectedOrgId(orgId)
            setSelectedOrgName(orgName)
            setSelectedUserId(null)
            fetchUsers(orgId)
            setViewMode('detail')
        }
    }

    const handleUserSelect = (user: IUser) => {
        setSelectedUserId(user._id)
        if (user.licenseId) {
            const org = organizations.find(o => o._id === user.licenseId)
            setSelectedOrgId(user.licenseId)
            setSelectedOrgName(org?.organizationName || 'Linked Node')
            fetchUsers(user.licenseId)
            setViewMode('detail')
        } else {
            toast.info("This user is not yet associated with an organization node.")
        }
    }

    const handleStatusUpdate = async (userId: string, status: string) => {
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, accountStatus: status }),
            })

            if (response.ok) {
                toast.success(`User access updated successfully`)
                fetchUsers(selectedOrgId)
            } else {
                const data = await response.json()
                toast.error(data.error || 'Failed to update status')
            }
        } catch (error) {
            toast.error('An error occurred during status update')
        }
    }

    const filteredUsers = (users || []).filter(user => {
        const query = search.toLowerCase()
        return (user?.name?.toLowerCase() || '').includes(query) ||
            (user?.email?.toLowerCase() || '').includes(query)
    })

    const adminNodes = filteredUsers.filter(u => ['super-admin', 'sub-admin', 'admin'].includes(u.role))
    const fieldResponders = filteredUsers.filter(u => ['responder', 'eoc-manager', 'eoc-observer', 'manager'].includes(u.role))

    // Partners data logic (as per original requirements)
    const nonprofits = [
        { id: 'N1', name: 'Red Cross', function: 'Sheltering', area: 'North Zone', status: 'Active' },
        { id: 'N2', name: 'World Central Kitchen', function: 'Food Services', area: 'Central Hub', status: 'Active' }
    ]

    const privatePartners = [
        { id: 'P1', name: 'PowerCo', sector: 'Utilities', role: 'Power Restoration', area: 'All Zones', status: 'Active' },
        { id: 'P2', name: 'PharmaPlus', sector: 'Medical', role: 'Prescription Access', area: 'East District', status: 'Active' }
    ]

    if (!mounted) return null;

    if (loading && users.length === 0) return (
        <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]">
            <div className="flex flex-col items-center gap-4">
                <RefreshCw className="w-12 h-12 text-[#33375D] animate-spin" />
                <p className="text-[#33375D] font-black uppercase tracking-widest text-xs">Accessing Personnel Matrix...</p>
            </div>
        </div>
    )

    return (
        <div className="flex-1 overflow-auto bg-[#F8FAFC]">
            <main className="p-6 md:p-10 space-y-8 max-w-[1600px] mx-auto">

                <AdminPageHeader
                    title="Responders & Agencies"
                    description="System configuration for operational personnel, decision makers, and agency partners."
                />

                {viewMode === 'overview' ? (
                    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {/* Licensee Portal (Super Admin Only) */}
                        {userRole === 'super-admin' && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-1 bg-[#33375D] rounded-full" />
                                    <h2 className="text-[12px] font-black text-slate-500 uppercase tracking-[0.4em]">Active Licensees Portal</h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {organizations.map((org) => (
                                        <Card
                                            key={org._id}
                                            onClick={() => handleOrgSelect(org._id, org.organizationName)}
                                            className={cn(
                                                "cursor-pointer transition-all duration-500 border-none overflow-hidden rounded-[32px] relative group",
                                                selectedOrgId === org._id
                                                    ? "bg-[#33375D] text-white scale-[1.02] shadow-[0_20px_50px_rgba(51,55,93,0.3)]"
                                                    : "bg-white hover:bg-slate-50 border border-slate-100 shadow-sm hover:shadow-xl"
                                            )}
                                        >
                                            <div className="p-8">
                                                <div className="flex items-start justify-between mb-6">
                                                    <div className={cn(
                                                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110",
                                                        selectedOrgId === org._id
                                                            ? "bg-white/10 border border-white/10"
                                                            : "bg-slate-100 group-hover:bg-[#33375D]/5 text-slate-400 group-hover:text-[#33375D]"
                                                    )}>
                                                        <Building2 size={24} />
                                                    </div>
                                                    {selectedOrgId === org._id && (
                                                        <Badge className="bg-emerald-500 text-white border-none text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full">
                                                            Selected
                                                        </Badge>
                                                    )}
                                                </div>

                                                <h3 className={cn(
                                                    "text-lg font-black uppercase tracking-tight mb-1",
                                                    selectedOrgId === org._id ? "text-white" : "text-slate-900"
                                                )}>
                                                    {org.organizationName}
                                                </h3>

                                                <div className={cn(
                                                    "text-[10px] font-bold uppercase tracking-[0.2em]",
                                                    selectedOrgId === org._id ? "text-slate-300" : "text-slate-400"
                                                )}>
                                                    Tier: {org.subscriptionDetails?.planType || 'Enterprise'}
                                                </div>

                                                <div className="mt-8 pt-6 border-t border-white/10 flex flex-col gap-5">
                                                    <Button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOrgSelect(org._id, org.organizationName);
                                                        }}
                                                        className={cn(
                                                            "w-full h-12 rounded-2xl text-[8px] font-black uppercase tracking-[0.2em] shadow-xl group/btn transition-all active:scale-95 flex items-center justify-center gap-3",
                                                            selectedOrgId === org._id
                                                                ? "bg-white/20 hover:bg-white/30 text-white border border-white/20"
                                                                : "bg-[#33375D] text-white hover:bg-[#1E293B] border-none"
                                                        )}
                                                    >
                                                        View All Responders <ArrowUpRight size={18} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform text-white" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-1 bg-[#33375D] rounded-full" />
                                <h2 className="text-[12px] font-black text-slate-500 uppercase tracking-[0.4em]">Administrative Infrastructure</h2>
                            </div>

                            <div className="relative max-w-md group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#33375D] transition-colors w-4 h-4" />
                                <input
                                    type="search"
                                    placeholder="Search Identity Registry..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] transition-all shadow-sm"
                                />
                            </div>

                           <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                                <CardHeader className="p-6 border-b border-slate-100 bg-white flex flex-row items-center justify-between">
                                    <CardTitle className="text-lg font-black text-slate-900 uppercase tracking-tight">Decision Makers & Dispatchers</CardTitle>
                                    <Badge className="bg-[#33375D] text-white px-3 py-1 rounded-full text-[10px] font-bold border-none">{adminNodes.length} Verified Accounts</Badge>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 border-b border-slate-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Access</th>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Oversight</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {adminNodes.length === 0 ? (
                                                    <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Zero administrative nodes detected</td></tr>
                                                ) : (
                                                    adminNodes.map((user) => (
                                                        <tr
                                                            key={user._id}
                                                            onClick={() => handleUserSelect(user)}
                                                            className={cn(
                                                                "transition-colors cursor-pointer",
                                                                selectedUserId === user._id ? "bg-blue-50/50" : "hover:bg-slate-50"
                                                            )}
                                                        >
                                                            <td className="px-6 py-5 text-sm font-bold text-slate-900 leading-none">{user.name}</td>
                                                            <td className="px-6 py-5">
                                                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{user.role?.replace('-', ' ')}</span>
                                                            </td>
                                                            <td className="px-6 py-5 text-sm">
                                                                <Badge className={cn("px-2 py-0.5 rounded-md border-none", user.accountStatus === 'approved' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                                                                    {user.accountStatus}
                                                                </Badge>
                                                            </td>
                                                            <td className="px-6 py-5 text-right">
                                                                {user.role === 'sub-admin' && !user.licenseId ? (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setIsGrantModalOpen(true); }}
                                                                        className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                                        title="Grant License"
                                                                    >
                                                                        <Shield size={16} />
                                                                    </Button>
                                                                ) : user.licenseId ? (
                                                                    <div className="flex justify-end pr-2 text-emerald-500" title="License Active">
                                                                        <CheckCircle size={16} />
                                                                    </div>
                                                                ) : <MoreVertical size={16} className="text-slate-300 ml-auto" />}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div> */}
                    </div>
                ) : (
                    <div className="space-y-10 animate-in slide-in-from-right-10 fade-in duration-500">
                        {/* Detail View Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-white border border-slate-200 rounded-[32px] shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                            <div className="flex items-center gap-6 relative z-10">
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setViewMode('overview')
                                        setSelectedUserId(null)
                                        setSelectedOrgId(null)
                                        setSelectedOrgName('')
                                        fetchUsers(null)
                                    }}
                                    className="px-6 h-12 bg-slate-100 hover:bg-[#33375D] hover:text-white rounded-2xl flex items-center justify-center gap-3 transition-all font-black uppercase tracking-widest text-[10px]"
                                >
                                    <ArrowLeft size={18} />
                                    <span>Back</span>
                                </Button>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">{selectedOrgName || 'Operational Node'}</h2>
                                    <div className="flex items-center gap-3">
                                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Active Personnel Matrix</p>
                                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                                        <div className="text-emerald-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Status
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <Button
                                onClick={() => setIsAddUserModalOpen(true)}
                                className="bg-[#33375D] hover:bg-[#33375D]/90 text-white px-8 py-3 rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-blue-900/10 flex items-center gap-3 relative z-10"
                            >
                                <UserPlus size={18} /> Add New Operator
                            </Button>
                        </div>

                        {/* Search in Detail View */}
                        <div className="relative max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <input
                                type="search"
                                placeholder="Filter node personnel..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] shadow-sm"
                            />
                        </div>

                        {/* Responders Table */}
                        <Card id="responders-registry" className="border-slate-200 shadow-sm rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
                            <CardHeader className="p-8 border-b border-slate-100 bg-white">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-blue-50 text-[#33375D] rounded-xl flex items-center justify-center">
                                        <Users size={20} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none mb-1">Active Duty Responders</CardTitle>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verified Tactical Personnel</p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50/50 border-b border-slate-100">
                                            <tr>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Personnel</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Assignment</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                                                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Protocol</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {fieldResponders.length === 0 ? (
                                                <tr><td colSpan={4} className="px-8 py-16 text-center text-slate-400 italic">No operators activated in this sector</td></tr>
                                            ) : (
                                                fieldResponders.map((user) => (
                                                    <tr key={user._id} className="hover:bg-slate-50/50 transition-colors group">
                                                        <td className="px-8 py-6">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[10px] uppercase">
                                                                    {user.name.charAt(0)}
                                                                </div>
                                                                <span className="text-sm font-black text-slate-900 group-hover:text-[#33375D] transition-colors">{user.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">{user.responderFunction || 'General Support'}</span>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <Badge className={cn("text-[8px] font-black uppercase px-3 py-1 rounded-full border-none shadow-sm", user.accountStatus === 'approved' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                                                                {user.accountStatus === 'approved' ? 'Active' : 'Standby'}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-8 py-6 text-right">
                                                            <Button variant="outline" size="sm" className="h-9 px-4 text-[9px] font-black uppercase border-slate-200 rounded-xl hover:bg-[#33375D] hover:text-white hover:border-[#33375D] transition-all">Tactical Profile</Button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Partner Tables Logic */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white/50 backdrop-blur-sm">
                                <CardHeader className="p-8 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
                                            <Building2 size={16} />
                                        </div>
                                        <CardTitle className="text-sm font-black text-slate-900 uppercase tracking-tight">Non-Profit Partners</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <table className="w-full text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        <tbody className="divide-y divide-slate-50">
                                            {nonprofits.map(org => (
                                                <tr key={org.id} className="hover:bg-slate-50/50">
                                                    <td className="px-8 py-5 text-slate-900">{org.name}</td>
                                                    <td className="px-8 py-5 text-slate-500">{org.function}</td>
                                                    <td className="px-8 py-5 text-emerald-600">{org.status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>

                            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white/50 backdrop-blur-sm">
                                <CardHeader className="p-8 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
                                            <Shield size={16} />
                                        </div>
                                        <CardTitle className="text-sm font-black text-slate-900 uppercase tracking-tight">Private Sector Assets</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <table className="w-full text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        <tbody className="divide-y divide-slate-50">
                                            {privatePartners.map(biz => (
                                                <tr key={biz.id} className="hover:bg-slate-50/50">
                                                    <td className="px-8 py-5 text-slate-900">{biz.name}</td>
                                                    <td className="px-8 py-5 text-slate-500">{biz.sector}</td>
                                                    <td className="px-8 py-5 text-emerald-600">{biz.status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}

            </main>

            {/* Fab Section */}


            {/* Modal Logic */}
            {selectedUser && (
                <GrantLicenseModal
                    user={selectedUser}
                    isOpen={isGrantModalOpen}
                    onClose={() => {
                        setIsGrantModalOpen(false)
                        setSelectedUser(null)
                    }}
                    onSuccess={() => fetchUsers(selectedOrgId)}
                />
            )}
            <AddUserModal
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                onSuccess={() => fetchUsers(selectedOrgId)}
            />
        </div>
    )
}
