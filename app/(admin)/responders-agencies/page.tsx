'use client'

import React, { useState, useEffect } from 'react'
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
    MapPin,
    Shield,
    Activity,
    Settings,
    Search,
    Plus,
    ExternalLink,
    Clock,
    CheckCircle2,
    Briefcase,
    Building2,
    Users,
    MoreHorizontal,
    LayoutGrid,
    List,
    Filter,
    ArrowUpRight,
    RefreshCw
} from 'lucide-react'
import { toast } from "sonner"

export default function RespondersAgenciesPage() {
    const [adminUsers, setAdminUsers] = useState<any[]>([
        { id: 1, name: 'Mayor Helena Rivers', role: 'City Leader', org: 'Municipal Command', access: true, incidentRole: 'Executive Oversight', status: 'Active' },
        { id: 2, name: 'Commander Maria Garcia', role: 'Incident Commander', org: 'Ready2Go HQ', access: true, incidentRole: 'Strategic Lead', status: 'Active' },
        { id: 3, name: 'Director James Wilson', role: 'Operations Chief', org: 'Local EOC', access: true, incidentRole: 'Tactical Director', status: 'Active' },
    ])
    const [activePersonnel, setActivePersonnel] = useState<any[]>([
        { id: 101, name: 'L. Brown', role: 'Comms Lead', agency: 'City EM', assigned: 'Tornado Warning', status: 'Active' },
        { id: 102, name: 'M. Patel', role: 'Fire Ops', agency: 'Fire Dept', assigned: 'Tornado Warning', status: 'Active' },
        { id: 103, name: 'Ops Team A', role: 'Facilities', agency: 'Public Works', assigned: 'Tornado Warning', status: 'Standby' },
    ])
    const [nonprofits, setNonprofits] = useState<any[]>([
        { id: 'N1', name: 'Red Cross', function: 'Sheltering', area: 'North Zone', status: 'Active', contact: 'Assigned' },
        { id: 'N2', name: 'World Central Kitchen', function: 'Food Services', area: 'Central Hub', status: 'Active', contact: 'Assigned' }
    ])
    const [businesses, setBusinesses] = useState<any[]>([
        { id: 'B1', name: 'PowerCo', sector: 'Utilities', role: 'Power Restoration', area: 'Industrial Zone', status: 'Active' },
        { id: 'B2', name: 'PharmaPlus', sector: 'Pharmacy', role: 'Medication Access', area: 'East District', status: 'Active' }
    ])
    const [loading, setLoading] = useState(false)

    return (
        <AdminPageShell>

                <AdminPageHeader
                    title="Responders & Agencies"
                    titleUppercase={false}
                    description="Manage administrative access, essential personnel, and responder actions for active and planned incidents."
                />

                {/* Administrative Users & Decision Makers Section */}
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
                                            <Switch
                                                checked={user.access}
                                                onCheckedChange={() => { }}
                                                className="data-[state=checked]:bg-[#33375D]"
                                            />
                                        </td>
                                        <td className="px-6 py-5">
                                            <button className="text-slate-900 underline underline-offset-4 text-sm font-medium hover:text-blue-600 transition-colors">
                                                {user.incidentRole}
                                            </button>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex justify-end items-center gap-3">
                                                <button className="p-2 text-[#3B82F6] hover:bg-blue-50 rounded-lg transition-colors">
                                                    <Eye size={16} />
                                                </button>
                                                <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
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

                {/* Active Response Personnel Section */}
                <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Active Response Personnel</h2>
                        <div className="flex items-center gap-2 bg-[#EFF6FF] px-4 py-2 rounded-lg border border-[#DBEAFE]">
                            <Info size={14} className="text-[#3B82F6]" />
                            <span className="text-[11px] font-medium text-[#3B82F6]">Activated personnel display Essential Personnel banner on mobile</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-[#FAFBFC] border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Agency</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assigned Incident</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {activePersonnel.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-5">
                                            <span className="font-bold text-slate-900">{user.name}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-slate-600 text-sm">{user.role}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-slate-600 text-sm">{user.agency}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-slate-600 text-sm">{user.assigned}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <Badge className={cn(
                                                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-none shadow-none",
                                                user.status === 'Active' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF9C3] text-[#854D0E]'
                                            )}>
                                                {user.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" className="h-8 rounded-lg border-none bg-[#33375D] px-4 text-xs font-bold text-white shadow-none transition-all hover:bg-[#2B2F50] active:scale-95">
                                                    View
                                                </Button>
                                                <Button variant="outline" size="sm" className="h-8 px-4 bg-slate-100 text-slate-600 hover:bg-slate-200 border-none rounded-lg text-xs font-bold shadow-none active:scale-95 transition-all">
                                                    Assign
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Non-Profit Response Partners Section */}
                <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
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

                {/* Private Sector Response Partners Section */}
                <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
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

                {/* Actions */}
                <div className="fixed bottom-10 right-10 flex flex-col gap-4 z-50">
                    <Button
                        className="w-16 h-16 rounded-full bg-[#33375D] hover:bg-[#44496B] text-white shadow-2xl flex items-center justify-center p-0 active:scale-95 transition-all group overflow-hidden"
                    >
                        <UserPlus size={24} className="group-hover:scale-110 transition-transform" />
                    </Button>
                </div>

        </AdminPageShell>
    )
}
