'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    MapPin,
    Plus,
    Trash2,
    Home,
    Briefcase,
    School,
    Star,
    Search,
    Loader2,
    ChevronRight,
    ArrowLeft
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LocationSearchInput } from '@/components/ui/location-search-input'
import { geocodeAddress } from '@/lib/services/mock-map-service'
import { toast } from 'sonner'

interface FavoritePlace {
    _id: string;
    name: string;
    address: string;
    coordinates: {
        lat: number;
        lng: number;
    };
    icon: string;
}

const ICON_MAP: Record<string, any> = {
    Home: Home,
    Office: Briefcase,
    School: School,
    Other: MapPin,
    Star: Star
}

export default function FavoritePlacesPage() {
    const [places, setPlaces] = useState<FavoritePlace[]>([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [newName, setNewName] = useState('')
    const [newAddress, setNewAddress] = useState('')
    const [selectedIcon, setSelectedIcon] = useState('Home')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        fetchPlaces()
    }, [])

    const fetchPlaces = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/user/favorite-places')
            const data = await res.json()
            if (data.success) {
                setPlaces(data.data)
            } else {
                toast.error('Failed to load favorite places')
            }
        } catch (error) {
            console.error('Error fetching places:', error)
            toast.error('Error connecting to server')
        } finally {
            setLoading(false)
        }
    }

    const handleAddPlace = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName || !newAddress) {
            toast.error('Please fill in all fields')
            return
        }

        try {
            setSubmitting(true)
            // Get coordinates for the address
            const coords = await geocodeAddress(newAddress)

            const res = await fetch('/api/user/favorite-places', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    address: newAddress,
                    coordinates: { lat: coords.lat, lng: coords.lng },
                    icon: selectedIcon
                })
            })

            const data = await res.json()
            if (data.success) {
                toast.success('Place added successfully')
                setPlaces([data.data, ...places])
                setIsAdding(false)
                setNewName('')
                setNewAddress('')
            } else {
                toast.error(data.error || 'Failed to add place')
            }
        } catch (error) {
            console.error('Error adding place:', error)
            toast.error('Could not resolve location or save place')
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeletePlace = async (id: string) => {
        if (!confirm('Are you sure you want to remove this place?')) return

        try {
            const res = await fetch(`/api/user/favorite-places/${id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            if (data.success) {
                toast.success('Place removed')
                setPlaces(places.filter(p => p._id !== id))
            } else {
                toast.error('Failed to remove place')
            }
        } catch (error) {
            console.error('Error deleting place:', error)
            toast.error('Error connecting to server')
        }
    }

    return (
        <main className="min-h-screen bg-[#F8FAFC] pb-20">
            <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <Link href="/user-dashboard" className="flex items-center gap-2 text-slate-400 hover:text-blue-500 transition-colors mb-4 group">
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            <span className="text-xs font-bold uppercase tracking-widest">Back to Dashboard</span>
                        </Link>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <Star className="w-8 h-8 text-blue-500 fill-blue-500" />
                            Favorite Places
                        </h1>
                        <p className="text-slate-500 font-medium mt-2">Manage settings for your most-visited locations.</p>
                    </div>
                    {!isAdding && (
                        <Button
                            onClick={() => setIsAdding(true)}
                            className="h-12 rounded-2xl bg-[#33375D] px-6 font-bold text-white shadow-lg shadow-[#33375D]/20 transition-all hover:scale-105 hover:bg-[#2B2F50]"
                        >
                            <Plus className="w-5 h-5 mr-2" />
                            Add New Place
                        </Button>
                    )}
                </div>

                {/* Add Place Form */}
                {isAdding && (
                    <Card className="p-8 border-none shadow-xl rounded-3xl bg-white animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-bold text-slate-900">Add Favorite Place</h2>
                            <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">Cancel</Button>
                        </div>
                        <form onSubmit={handleAddPlace} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Place Name</label>
                                    <Input
                                        placeholder="e.g. Home, Office, Child's School"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="h-12 rounded-xl border-slate-100 bg-slate-50/50 font-bold focus:bg-white transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Location Icon</label>
                                    <div className="flex gap-2">
                                        {Object.keys(ICON_MAP).map((key) => {
                                            const Icon = ICON_MAP[key]
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setSelectedIcon(key)}
                                                    className={cn(
                                                        "w-12 h-12 rounded-xl flex items-center justify-center border transition-all",
                                                        selectedIcon === key ? "border-[#33375D] bg-[#33375D] text-white shadow-lg shadow-[#33375D]/20" : "border-slate-100 bg-slate-50 text-slate-400 hover:border-[#33375D]/30 hover:text-[#33375D]"
                                                    )}
                                                >
                                                    <Icon className="w-5 h-5" />
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Address</label>
                                <LocationSearchInput
                                    value={newAddress}
                                    onChange={setNewAddress}
                                    placeholder="Search for an address..."
                                    onSelect={(address) => setNewAddress(address)}
                                    inputClassName="h-12 rounded-xl border-slate-100 bg-slate-50/50 font-bold focus:bg-white transition-all"
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-slate-900 hover:bg-slate-800 text-white h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"
                            >
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : 'Save Favorite Place'}
                            </Button>
                        </form>
                    </Card>
                )}

                {/* Places List */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {loading ? (
                        Array(2).fill(0).map((_, i) => (
                            <Card key={i} className="h-40 bg-white border-none shadow-sm animate-pulse rounded-3xl" />
                        ))
                    ) : places.length === 0 ? (
                        <div className="lg:col-span-2 py-20 flex flex-col items-center justify-center space-y-4 text-center">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                                <MapPin className="w-10 h-10 text-slate-300" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">No favorite places yet</h3>
                                <p className="text-slate-400 font-medium">Add locations like home or school to get priority alerts.</p>
                            </div>
                            <Button variant="outline" onClick={() => setIsAdding(true)} className="rounded-xl border-slate-200 font-bold">
                                Create your first favorite place
                            </Button>
                        </div>
                    ) : (
                        places.map((place) => {
                            const Icon = ICON_MAP[place.icon] || MapPin
                            return (
                                <Card key={place._id} className="group p-6 bg-white border-none shadow-sm hover:shadow-xl transition-all duration-500 rounded-3xl overflow-hidden relative">
                                    <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.1] transition-opacity">
                                        <Icon className="w-24 h-24 text-slate-900" />
                                    </div>
                                    <div className="flex items-start justify-between relative z-10">
                                        <div className="flex items-start gap-4">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#33375D]/10 text-[#33375D] shadow-inner transition-colors duration-500 group-hover:bg-[#33375D] group-hover:text-white">
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-lg font-black text-slate-900 leading-tight mb-1 truncate">{place.name}</h3>
                                                <p className="text-xs font-medium text-slate-400 line-clamp-2 leading-relaxed">{place.address}</p>
                                                <div className="flex items-center gap-4 mt-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                                    <span className="flex items-center gap-1">
                                                        <Search className="w-3 h-3" />
                                                        {place.coordinates.lat.toFixed(4)}, {place.coordinates.lng.toFixed(4)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeletePlace(place._id)}
                                            className="text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </Card>
                            )
                        })
                    )}
                </div>
            </div>
        </main>
    )
}
