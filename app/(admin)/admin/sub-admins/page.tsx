'use client'

import React, { useEffect, useState } from "react"
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
    Users, 
    CheckCircle, 
    XCircle, 
    Clock, 
    Shield, 
    User, 
    Search,
    RefreshCw,
    Mail,
    Calendar,
    ArrowLeft,
    Terminal,
    Activity,
    Briefcase,
    ShieldCheck,
    Globe,
    Plus,
    ShieldAlert
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { AdminPageHeader } from '@/components/admin-page-header'
import { AdminPageShell } from '@/components/admin-page-shell'
import { AddUserModal } from "@/components/modals/add-user-modal"
import { AdminPageLoader } from '@/components/admin-page-loader'

interface IUser {
    _id: string;
    name: string;
    email: string;
    role: string;
    accountStatus: string;
    createdAt: string;
}

export default function SubAdminManagementPage() {
    const router = useRouter()
    const [users, setUsers] = useState<IUser[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all') 
    const [search, setSearch] = useState('')
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)

    const fetchSubAdmins = async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/admin/users?role=sub-admin')
            const data = await response.json()
            if (response.ok) {
                setUsers(data.users)
            } else {
                toast.error(data.error || 'Failed to fetch sub-admins')
            }
        } catch (error) {
            toast.error('Error connecting to the server')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const userRole = localStorage.getItem('userRole')
        if (userRole !== 'super-admin' && userRole !== 'admin' && userRole !== 'sub-admin') {
            router.push('/admin-dashboard')
            return
        }
        fetchSubAdmins()
    }, [router])

    const handleStatusUpdate = async (userId: string, status: string) => {
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, accountStatus: status }),
            })

            if (response.ok) {
                toast.success(`Account ${status} successfully`)
                fetchSubAdmins()
            } else {
                const data = await response.json()
                toast.error(data.error || 'Failed to update status')
            }
        } catch (error) {
            toast.error('An error occurred during status update')
        }
    }

    const filteredUsers = users.filter(user => {
        const matchesFilter = filter === 'all' || user.accountStatus === filter
        const matchesSearch = user.name.toLowerCase().includes(search.toLowerCase()) || 
                             user.email.toLowerCase().includes(search.toLowerCase())
        return matchesFilter && matchesSearch
    })

    const stats = {
        total: users.length,
        approved: users.filter(u => u.accountStatus === 'approved').length,
        pending: users.filter(u => u.accountStatus === 'pending').length
    }

    if (loading && users.length === 0) {
        return <AdminPageLoader />
    }

    return (
        <AdminPageShell>
                
                <AdminPageHeader
                    title="Manage Sub-Admins"
                    description="Verify and manage permissions for all local administrators."
                    actions={
                        <Button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex h-12 gap-2 rounded-xl bg-slate-900 px-6 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-slate-800 active:scale-95"
                        >
                            <Plus size={18} />
                            Add Admin
                        </Button>
                    }
                />

                {/* Banner Gradient */}
                <div className="bg-[#33375D] rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl shadow-[#33375D]/20 group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl transition-all group-hover:bg-white/20" />
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-black uppercase tracking-widest mb-4">
                                <ShieldCheck size={12} /> Admin Control
                            </div>
                            <h2 className="text-3xl font-black tracking-tight mb-3">Admin Registry</h2>
                            <p className="max-w-2xl font-medium leading-relaxed text-white/90">View and update the status of sub-administrators across all locations.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-6 shrink-0">
                            {[
                                { label: 'TOTAL', value: stats.total, icon: Globe },
                                { label: 'ACTIVE', value: stats.approved, icon: ShieldCheck },
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
                    <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200">
                        {['all', 'pending', 'approved', 'rejected'].map((f) => (
                            <button 
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    filter === f 
                                        ? 'bg-slate-900 text-white shadow-lg' 
                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    <div className="relative group w-full md:w-96">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <Input
                            placeholder="Search by name or email..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-12 bg-white border-slate-200 text-slate-900 placeholder-slate-400 rounded-2xl h-14 text-sm font-medium focus:ring-2 focus:ring-blue-500/10 transition-all shadow-sm"
                        />
                    </div>
                </div>

                {/* Registry Table */}
                <div className="grid grid-cols-1 gap-4">
                    {filteredUsers.length === 0 ? (
                        <Card className="p-20 border-dashed border-2 border-slate-200 rounded-[40px] flex flex-col items-center justify-center text-center space-y-6">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 italic font-black text-slate-200 text-4xl">?</div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black text-slate-900 uppercase">No Admins Found</h3>
                                <p className="text-sm text-slate-500 max-w-xs mx-auto">No administrators match your current filter or search criteria.</p>
                            </div>
                        </Card>
                    ) : (
                        <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Admin Details</th>
                                            <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Date Joined</th>
                                            <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                            <th className="px-8 py-6 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredUsers.map((user) => (
                                            <tr key={user._id} className="group hover:bg-blue-50/30 transition-colors">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-white group-hover:text-blue-600 group-hover:shadow-md transition-all border border-slate-100">
                                                            <User size={24} />
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-slate-900 uppercase tracking-tight">{user.name}</p>
                                                            <p className="text-[10px] font-bold text-slate-400 tracking-widest">{user.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col text-slate-400 gap-1">
                                                        <span className="text-xs font-bold italic">{new Date(user.createdAt).toLocaleDateString()}</span>
                                                        <span className="text-[8px] font-black uppercase tracking-widest">ID: {user._id.slice(-8)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className={cn(
                                                        "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                                                        user.accountStatus === 'approved' 
                                                            ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                                                            : user.accountStatus === 'pending'
                                                            ? "bg-amber-50 text-amber-600 border-amber-100"
                                                            : "bg-rose-50 text-rose-600 border-rose-100"
                                                    )}>
                                                        <div className={cn(
                                                            "w-1.5 h-1.5 rounded-full",
                                                            user.accountStatus === 'approved' ? "bg-emerald-500 animate-pulse" : user.accountStatus === 'pending' ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                                                        )} />
                                                        {user.accountStatus === 'approved' ? 'Active' : user.accountStatus}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {user.accountStatus === 'pending' && (
                                                            <>
                                                                <Button 
                                                                    onClick={() => handleStatusUpdate(user._id, 'approved')}
                                                                    className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-widest transition-all"
                                                                >
                                                                    Approve
                                                                </Button>
                                                                <Button 
                                                                    variant="ghost"
                                                                    onClick={() => handleStatusUpdate(user._id, 'rejected')}
                                                                    className="h-9 px-4 rounded-xl text-rose-600 hover:bg-rose-600 hover:text-white font-black text-[9px] uppercase tracking-widest transition-all"
                                                                >
                                                                    Deny
                                                                </Button>
                                                            </>
                                                        )}
                                                        {user.accountStatus === 'approved' && (
                                                            <Button 
                                                                variant="ghost"
                                                                onClick={() => handleStatusUpdate(user._id, 'rejected')}
                                                                className="h-9 px-4 rounded-xl text-rose-600 hover:bg-rose-600 hover:text-white font-black text-[9px] uppercase tracking-widest transition-all"
                                                            >
                                                                Deactivate
                                                            </Button>
                                                        )}
                                                        {user.accountStatus === 'rejected' && (
                                                            <Button 
                                                                onClick={() => handleStatusUpdate(user._id, 'approved')}
                                                                className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-[9px] uppercase tracking-widest transition-all"
                                                            >
                                                                Activate
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

            <AddUserModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onSuccess={fetchSubAdmins} 
            />
        </AdminPageShell>
    )
}
