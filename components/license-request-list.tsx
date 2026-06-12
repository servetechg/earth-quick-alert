'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    ShieldAlert,
    User,
    RefreshCw,
    ShieldPlus,
    X,
} from "lucide-react"
import Link from 'next/link'
import { toast } from "sonner"
import { GrantLicenseModal } from "@/components/modals/grant-license-modal"
import { cn } from "@/lib/utils"

interface IUser {
    _id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    requestedOrgName?: string;
    city?: string;
    country?: string;
    requestedLicenseType?: string;
}

export function LicenseRequestList() {
    const [requests, setRequests] = useState<IUser[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedUser, setSelectedUser] = useState<IUser | null>(null)

    const fetchRequests = async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/admin/users?requestedLicense=true')
            const data = await response.json()
            if (response.ok) {
                setRequests(data.users || [])
            } else {
                toast.error(data.error || 'Failed to fetch license requests')
            }
        } catch (error) {
            toast.error('Error connecting to the server')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchRequests()
    }, [])

    const handleGrantClick = (user: IUser) => {
        setSelectedUser(user)
        setIsModalOpen(true)
    }

    const handleReject = async (userId: string) => {
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    accountStatus: 'rejected',
                    requestedLicense: false
                })
            })

            if (response.ok) {
                toast.success("Request rejected successfully")
                fetchRequests() // Refresh the list
            } else {
                const data = await response.json()
                toast.error(data.error || "Failed to reject request")
            }
        } catch (error) {
            toast.error("Error connecting to server")
        }
    }

    if (!loading && requests.length === 0) {
        return (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-slate-100 shadow-sm text-slate-300">
                    <User size={24} />
                </div>
                <div className="space-y-1">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No Pending Requests</h3>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchRequests}
                    className="text-[9px] font-black text-[#33375D] uppercase tracking-widest hover:bg-[#33375D]/10"
                >
                    Refresh List
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {loading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 animate-pulse">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg" />
                            <div className="h-3 w-16 bg-slate-100 rounded" />
                        </div>
                        <div className="h-7 w-12 bg-slate-100 rounded-md" />
                    </div>
                ))
            ) : (
                requests.map((user) => (
                    <div key={user._id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-all group border-b border-slate-50 last:border-0 grow min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-8 h-8 shrink-0 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center border border-slate-200 group-hover:border-[#33375D]/20 transition-colors">
                                <User size={14} />
                            </div>
                            <h4 className="text-[11px] font-black text-[#33375D] uppercase truncate" title={user.name}>{user.name}</h4>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <Button
                                onClick={() => handleGrantClick(user)}
                                className="bg-[#33375D] hover:bg-[#2B2F50] text-white rounded-lg h-7 px-3 font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all"
                            >
                                Approve
                            </Button>
                            <button
                                onClick={() => handleReject(user._id)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                title="Reject Request"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                ))
            )}

            {selectedUser && (
                <GrantLicenseModal
                    user={selectedUser}
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false)
                        setSelectedUser(null)
                    }}
                    onSuccess={fetchRequests}
                />
            )}
        </div>
    )
}
