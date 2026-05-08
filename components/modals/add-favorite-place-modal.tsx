'use client'

import React, { useState } from 'react'
import { X, MapPin, Loader2, Home, Briefcase, School, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LocationSearchInput } from '@/components/ui/location-search-input'
import { geocodeAddress } from '@/lib/services/mock-map-service'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AddFavoritePlaceModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

const ICON_OPTIONS = [
    { id: 'Home', icon: Home },
    { id: 'Office', icon: Briefcase },
    { id: 'School', icon: School },
    { id: 'Star', icon: Star },
    { id: 'Other', icon: MapPin },
]

export function AddFavoritePlaceModal({ isOpen, onClose, onSuccess }: AddFavoritePlaceModalProps) {
    const [name, setName] = useState('')
    const [address, setAddress] = useState('')
    const [selectedIcon, setSelectedIcon] = useState('Home')
    const [submitting, setSubmitting] = useState(false)

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name || !address) {
            toast.error('Please fill in all fields')
            return
        }

        try {
            setSubmitting(true)
            const coords = await geocodeAddress(address)

            const res = await fetch('/api/user/favorite-places', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    address,
                    coordinates: { lat: coords.lat, lng: coords.lng },
                    icon: selectedIcon
                })
            })

            const data = await res.json()
            if (data.success) {
                toast.success('Place added successfully')
                onSuccess()
                handleClose()
            } else {
                toast.error(data.error || 'Failed to add place')
            }
        } catch (error) {
            console.error('Error adding place:', error)
            toast.error('Could not resolve location')
        } finally {
            setSubmitting(false)
        }
    }

    const handleClose = () => {
        setName('')
        setAddress('')
        setSelectedIcon('Home')
        onClose()
    }

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between p-8 border-b border-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                            <PlusIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Add New Location</h2>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Save a frequent spot</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Location Nickname</label>
                            <Input
                                placeholder="e.g. Home, Office, Kid's School"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="h-12 rounded-xl border-slate-100 bg-slate-50/50 font-bold focus:bg-white transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Select Icon</label>
                            <div className="flex gap-3">
                                {ICON_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setSelectedIcon(opt.id)}
                                        className={cn(
                                            "w-12 h-12 rounded-xl flex items-center justify-center border transition-all",
                                            selectedIcon === opt.id
                                                ? "scale-110 border-[#33375D] bg-[#33375D] text-white shadow-lg shadow-[#33375D]/20"
                                                : "bg-slate-50 border-slate-100 text-slate-400 hover:border-blue-200 hover:text-blue-500"
                                        )}
                                    >
                                        <opt.icon className="w-5 h-5" />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Full Address</label>
                            <LocationSearchInput
                                value={address}
                                onChange={setAddress}
                                placeholder="Search for an address..."
                                onSelect={(addr) => setAddress(addr)}
                                inputClassName="h-12 rounded-xl border-slate-100 bg-slate-50/50 font-bold focus:bg-white transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleClose}
                            className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-slate-400"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting}
                            className="flex-[2] bg-slate-900 hover:bg-slate-800 text-white h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"
                        >
                            {submitting ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : 'Save Location'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function PlusIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    )
}
