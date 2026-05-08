'use client'

import { X, UserPlus, ShieldCheck, MapPin, Users, Info } from 'lucide-react'
import { useState } from 'react'
import { useSafety } from '@/lib/context/safety-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { LocationSearchInput } from '@/components/ui/location-search-input'

interface AddFamilyMemberModalProps {
    isOpen: boolean
    onClose: () => void
}

export function AddFamilyMemberModal({ isOpen, onClose }: AddFamilyMemberModalProps) {
    const { addFamilyMember } = useSafety()
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [member, setMember] = useState({
        name: '',
        relationship: '',
        location: ''
    })

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!member.name || !member.relationship) return

        setIsProcessing(true)
        setError(null)
        try {
            const res = await addFamilyMember(member)
            if (res && res.success === false) {
                setError(res.error || 'Failed to add family member')
                return
            }
            setMember({ name: '', relationship: '', location: '' })
            onClose()
        } catch (err: any) {
            console.error('Failed to add family member:', err)
            setError(err.message || 'Unknown error')
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-[#34385E] text-white p-7 flex items-center justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-blue-500/20 p-3 rounded-2xl border border-white/10">
                            <UserPlus className="w-7 h-7 text-blue-300" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight">Add Family</h2>
                            <p className="text-blue-200/60 text-[10px] font-bold uppercase tracking-widest">Connect your loved ones</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="relative z-10 p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {/* Error display */}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-xl animate-in fade-in">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</Label>
                            <Input
                                placeholder="e.g. Noor"
                                value={member.name}
                                onChange={(e) => setMember({ ...member, name: e.target.value })}
                                className="h-12 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-0 transition-all font-bold px-5"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Relationship</Label>
                            <Input
                                placeholder="e.g. Wife, Son, Mother"
                                value={member.relationship}
                                onChange={(e) => setMember({ ...member, relationship: e.target.value })}
                                className="h-12 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-0 transition-all font-bold px-5"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Location (Optional)</Label>
                            <LocationSearchInput
                                placeholder="e.g. Larkana"
                                value={member.location}
                                onChange={(val) => setMember({ ...member, location: val })}
                                inputClassName="h-12 border-2 border-slate-100 focus:border-blue-500 focus:ring-0"
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button
                            type="submit"
                            disabled={isProcessing}
                            className="h-14 w-full rounded-2xl bg-[#33375D] font-black uppercase tracking-widest text-white shadow-lg shadow-[#33375D]/25 transition-all hover:bg-[#2B2F50] active:scale-[0.98] disabled:opacity-50"
                        >
                            {isProcessing ? 'Adding...' : 'Add to Safety Hub'}
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                        <Info className="w-4 h-4 text-blue-500 shrink-0" />
                        <p className="text-[10px] font-bold text-blue-700/70 leading-relaxed uppercase tracking-tight">
                            Safety status will be automatically tracked based on this location.
                        </p>
                    </div>
                </form>
            </div>
        </div>
    )
}
