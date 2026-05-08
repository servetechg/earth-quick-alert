'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import {
    PlusCircle,
    UserCheck,
    UserX,
    Navigation,
    Search,
    Cloud,
    Activity,
    AlertTriangle,
    Shield,
    MapPin,
    Loader2,
    Users,
    Signal,
    Wifi,
    Zap,
    Heart,
    CheckCircle2,
    Pencil
} from 'lucide-react'

import { useSafety, SafetyStatus } from '@/lib/context/safety-context'
import { AddFamilyMemberModal } from '@/components/modals/add-family-member-modal'
import { useGeolocation } from '@/lib/hooks/use-geolocation'
import { reverseGeocode, geocodeAddress } from '@/lib/services/mock-map-service'
import { LocationSearchInput } from '@/components/ui/location-search-input'
import { cn } from '@/lib/utils'
import { weatherAPI } from '@/lib/services/weather-api'
import { earthquakeAPI } from '@/lib/services/earthquake-api'
import { WeatherData } from '@/lib/types/emergency'

export default function AreWeSafePage() {
    const router = useRouter()
    const {
        myStatus,
        updateMyStatus,
        familyMembers,
        updateFamilyMemberLocation,
        verifyFamilySafety,
        loading: safetyLoading
    } = useSafety()

    const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [tempLocation, setTempLocation] = useState('')
    const [isVerifying, setIsVerifying] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const { location: geoLoc, loading: geoLoading } = useGeolocation()
    const [myLocationName, setMyLocationName] = useState<string | null>(null)
    const [myLocLoading, setMyLocLoading] = useState(true)
    const [memberMetrics, setMemberMetrics] = useState<Record<string, { temp: number; condition: string; seismic: string }>>({})

    const handleUpdateStatus = async (status: SafetyStatus) => {
        setIsUpdatingStatus(true)
        await updateMyStatus(status)
        setIsUpdatingStatus(false)
        if (status === 'DANGER' || status === 'false') {
            router.push('/virtual-eoc')
        } else if (status === 'SAFE' || status === 'true') {
            router.push('/user-dashboard')
        }
    }

    // Resolve the user's own location name and metrics from GPS
    useEffect(() => {
        if (geoLoading) return
        if (geoLoc) {
            setMyLocLoading(true)

            // Fetch location name
            reverseGeocode(geoLoc.lat, geoLoc.lng)
                .then(name => setMyLocationName(name))
                .catch(() => setMyLocationName(`${geoLoc.lat.toFixed(4)}, ${geoLoc.lng.toFixed(4)}`))
                .finally(() => setMyLocLoading(false))

            // Fetch weather and seismic data
            Promise.all([
                weatherAPI.fetchFullWeatherData(geoLoc.lat, geoLoc.lng),
                earthquakeAPI.fetchEarthquakesByLocation(geoLoc.lat, geoLoc.lng, 500)
            ]).then(([wData, eqAlerts]) => {
                const latestEq = eqAlerts.length > 0 ? eqAlerts[0] : null
                setMemberMetrics(prev => ({
                    ...prev,
                    'me': {
                        temp: wData.current.temp,
                        condition: wData.current.condition.toUpperCase(),
                        seismic: latestEq ? `${latestEq.magnitude.toFixed(1)} ${latestEq.severity.toUpperCase()}` : 'STABLE'
                    }
                }))
            }).catch(err => console.error('Error fetching my metrics:', err))

        } else {
            const saved = typeof window !== 'undefined' ? localStorage.getItem('userLocation') : null
            setMyLocationName(saved || 'Location unavailable')
            setMyLocLoading(false)
        }
    }, [geoLoc, geoLoading])

    // Load metrics for family members
    useEffect(() => {
        const fetchMemberMetrics = async () => {
            const newMetrics: Record<string, { temp: number; condition: string; seismic: string }> = { ...memberMetrics }
            
            // Filter members that need fetching
            const membersToFetch = familyMembers.filter(member => member.location && !memberMetrics[member._id])
            
            if (membersToFetch.length === 0) return

            try {
                const fetchPromises = membersToFetch.map(async (member) => {
                    try {
                        const coords = await geocodeAddress(member.location)
                        const [wData, eqAlerts] = await Promise.all([
                            weatherAPI.fetchFullWeatherData(coords.lat, coords.lng),
                            earthquakeAPI.fetchEarthquakesByLocation(coords.lat, coords.lng, 500)
                        ])
                        const latestEq = eqAlerts.length > 0 ? eqAlerts[0] : null
                        return {
                            id: member._id,
                            metrics: {
                                temp: wData.current.temp,
                                condition: wData.current.condition.toUpperCase(),
                                seismic: latestEq ? `${latestEq.magnitude.toFixed(1)} ${latestEq.severity.toUpperCase()}` : 'STABLE'
                            }
                        }
                    } catch (err) {
                        console.error(`Error fetching metrics for ${member.name}:`, err)
                        return null
                    }
                })

                const results = await Promise.all(fetchPromises)
                
                let hasChanges = false
                results.forEach(res => {
                    if (res) {
                        newMetrics[res.id] = res.metrics
                        hasChanges = true
                    }
                })

                if (hasChanges) {
                    setMemberMetrics(newMetrics)
                }
            } catch (err) {
                console.error('Error in parallel metric fetching:', err)
            }
        }

        if (familyMembers.length > 0) {
            fetchMemberMetrics()
        }
    }, [familyMembers])

    // Trigger individual safety verification on mount
    useEffect(() => {
        const runVerification = async () => {
            setIsVerifying(true)
            await verifyFamilySafety()
            setIsVerifying(false)
        }
        runVerification()
    }, [verifyFamilySafety])

    const isSafe = myStatus === 'SAFE' || myStatus === 'true'
    const isDanger = myStatus === 'DANGER' || myStatus === 'false'

    if (safetyLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
                <Loader2 className="w-12 h-12 animate-spin text-[#33375D]" />
                <p className="font-bold text-slate-400">Synchronizing Safety Nexus...</p>
            </div>
        )
    }

    return (
        <main className="min-h-screen bg-slate-50/50 pb-24">
            <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
                <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#33375D] shadow-lg shadow-[#33375D]/20">
                                <Shield className="w-6 h-6 text-white" />
                            </div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Are We Safe?</h1>
                        </div>
                        <p className="text-slate-500 font-medium">Family and group safety status synchronization.</p>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="h-12 rounded-2xl bg-[#33375D] px-8 font-bold text-white shadow-lg shadow-[#33375D]/20 transition-all hover:-translate-y-0.5 hover:bg-[#2B2F50]"
                    >
                        <PlusCircle className="w-5 h-5 mr-2" />
                        Add Member
                    </Button>
                </header>

                <div className="space-y-12">
                    {/* Status Deck */}
                    <Card className={cn(
                        "p-10 border-none shadow-xl transition-all duration-500 rounded-[2rem] overflow-hidden group",
                        isDanger ? 'bg-red-50 ring-2 ring-red-100' : 'bg-white'
                    )}>
                        <div className="flex flex-col md:flex-row gap-12 relative z-10">
                            <div className="flex-1 space-y-8">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 mb-2">Personal Status Check-in</h2>
                                    <p className={cn("font-medium", isDanger ? "text-red-700" : "text-slate-500")}>
                                        Update your status to coordinate with your family and emergency responders.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className={cn(
                                        "h-20 flex items-center px-6 rounded-2xl border-2 transition-all shadow-sm",
                                        isSafe ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-50 border-slate-200 text-slate-400"
                                    )}>
                                        <UserCheck className={cn("w-6 h-6 mr-3", isSafe ? "text-green-600" : "text-slate-400")} />
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Current Status</p>
                                            <p className="text-lg font-black uppercase tracking-tight">{isSafe ? 'SECURE' : 'ACTION REQUIRED'}</p>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => handleUpdateStatus('DANGER')}
                                        disabled={isUpdatingStatus || isDanger}
                                        className={cn(
                                            "h-20 text-lg font-bold transition-all rounded-2xl shadow-lg",
                                            isDanger ? 'bg-red-600 ring-4 ring-red-100 shadow-red-200' : 'bg-red-500 hover:bg-red-600'
                                        )}
                                    >
                                        {isUpdatingStatus ? <Loader2 className="mr-3 h-6 w-6 animate-spin text-white" /> : <UserX className="mr-3 h-6 w-6" />}
                                        I NEED HELP
                                    </Button>
                                </div>
                            </div>

                            {isDanger && (<div className="w-full md:w-72 space-y-4">


                                <div className="p-6 bg-red-600 rounded-3xl text-white shadow-xl shadow-red-100 flex items-center gap-3 animate-pulse">
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    <p className="text-[11px] font-black uppercase leading-tight">
                                        Emergency Beacon Active
                                    </p>
                                </div>

                            </div>)}
                        </div>
                    </Card>

                    {/* Family Network Grid */}
                    <section className="space-y-8">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-100 rounded-2xl shadow-sm">
                                    <Users className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Family Safety Network</h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Real-time status synchronization</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 px-5 py-2.5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                                    {familyMembers.length + 1} Nodes Active
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {/* Current User Card */}
                            <Card className={cn(
                                "p-8 rounded-[2.5rem] border-none transition-all duration-500 flex flex-col space-y-8 shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:translate-y-[-4px] overflow-hidden relative group",
                                isSafe ? "bg-white" : "bg-red-50/30 ring-1 ring-red-100"
                            )}>
                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                    <Shield className="w-32 h-32 text-slate-900" />
                                </div>

                                <div className="flex items-center gap-5 relative z-10">
                                    <div className={cn(
                                        "w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg relative shrink-0",
                                        isSafe ? "bg-[#33375D] text-white shadow-[#33375D]/20" : "bg-red-600 text-white shadow-red-100"
                                    )}>
                                        Me
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate">You</h3>
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                                        </div>
                                        <div className={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                                            isSafe ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
                                        )}>
                                            <UserCheck className="w-3 h-3" />
                                            {isSafe ? 'Secure' : 'Needs Check-in'}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 relative z-10">
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <MapPin className="w-3 h-3 text-blue-500" />
                                            Last Known Position
                                        </p>
                                        <p className="text-xs font-bold text-slate-900 truncate">
                                            {myLocLoading ? 'Resolving...' : myLocationName}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex flex-col items-center group/metric hover:bg-white hover:border-blue-100 transition-colors">
                                            <Cloud className="w-4 h-4 text-blue-400 mb-1.5 group-hover/metric:scale-110 transition-transform" />
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Atmosphere</span>
                                            <span className="text-xs font-black text-slate-900 tracking-tight">
                                                {memberMetrics['me'] ? `${memberMetrics['me'].temp}° ${memberMetrics['me'].condition}` : 'FETCHING...'}
                                            </span>
                                        </div>
                                        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex flex-col items-center group/metric hover:bg-white hover:border-orange-100 transition-colors">
                                            <Zap className="w-4 h-4 text-orange-400 mb-1.5 group-hover/metric:scale-110 transition-transform" />
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Seismic</span>
                                            <span className="text-xs font-black text-slate-900 tracking-tight">
                                                {memberMetrics['me'] ? memberMetrics['me'].seismic : 'FETCHING...'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            {/* Family Members */}
                            {familyMembers.map((member) => {
                                const mSafe = member.status === 'SAFE' || member.status === 'true'
                                return (
                                    <Card
                                        key={member._id}
                                        className={cn(
                                            "p-8 rounded-[2.5rem] border-none transition-all duration-500 flex flex-col space-y-8 shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:translate-y-[-4px] overflow-hidden relative group",
                                            mSafe ? "bg-white" : "bg-red-50 shadow-red-100/50 ring-1 ring-red-100"
                                        )}
                                    >
                                        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                            <Heart className="w-32 h-32 text-slate-900" />
                                        </div>

                                        <div className="flex items-center gap-5 relative z-10">
                                            <div className={cn(
                                                "w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg relative shrink-0 uppercase transition-transform duration-500 group-hover:scale-105",
                                                mSafe ? "bg-slate-900 text-white shadow-slate-200" : "bg-red-600 text-white shadow-red-200"
                                            )}>
                                                {member.name.charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate">{member.name}</h3>
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        mSafe ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                                                    )} />
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="px-2 py-0.5 bg-slate-100 text-[8px] font-bold text-slate-400 rounded-md uppercase tracking-wider border border-slate-200/50">
                                                        {member.relationship}
                                                    </span>
                                                    <div className={cn(
                                                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border",
                                                        mSafe ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
                                                    )}>
                                                        {mSafe ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                                                        {mSafe ? 'Secure' : 'Needs Check-in'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4 relative z-10">
                                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 hover:bg-white hover:border-blue-100 transition-all duration-300">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                        <MapPin className="w-3 h-3 text-blue-500" />
                                                        Current Coordinates
                                                    </p>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-slate-300 hover:bg-[#33375D]/10 hover:text-[#33375D]" onClick={() => {
                                                        setEditingMemberId(member._id)
                                                        setTempLocation(member.location || '')
                                                    }}>
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>

                                                {editingMemberId === member._id ? (
                                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                                        <LocationSearchInput
                                                            value={tempLocation}
                                                            onChange={setTempLocation}
                                                            placeholder="Enter location..."
                                                            inputClassName="h-9 rounded-xl border-blue-100 bg-white font-bold text-xs"
                                                            onSelect={(name) => setTempLocation(name)}
                                                        />
                                                        <div className="flex gap-2">
                                                            <Button size="sm" className="h-8 flex-1 rounded-lg bg-[#33375D] font-black text-[9px] uppercase tracking-widest text-white hover:bg-[#2B2F50]" onClick={() => {
                                                                updateFamilyMemberLocation(member._id, tempLocation)
                                                                setEditingMemberId(null)
                                                            }}>Confirm</Button>
                                                            <Button size="sm" variant="ghost" className="h-8 rounded-lg font-black text-[9px] uppercase tracking-widest text-slate-400" onClick={() => setEditingMemberId(null)}>Cancel</Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs font-bold text-slate-900 truncate">
                                                        {member.location || 'Location Not Broadcasted'}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col items-center group/metric hover:border-blue-100 hover:shadow-md transition-all">
                                                    <Cloud className="w-4 h-4 text-blue-400 mb-1.5 group-hover/metric:scale-110 transition-transform" />
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Environment</span>
                                                    <span className="text-xs font-black text-slate-900 tracking-tight text-center">
                                                        {memberMetrics[member._id] ? `${memberMetrics[member._id].temp}° ${memberMetrics[member._id].condition}` : 'FETCHING...'}
                                                    </span>
                                                </div>
                                                <div className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col items-center group/metric hover:border-orange-100 hover:shadow-md transition-all">
                                                    <Zap className="w-4 h-4 text-orange-400 mb-1.5 group-hover/metric:scale-110 transition-transform" />
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Seismic</span>
                                                    <span className="text-xs font-black text-slate-900 tracking-tight text-center">
                                                        {memberMetrics[member._id] ? memberMetrics[member._id].seismic : 'FETCHING...'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    </section>
                </div>
            </div>

            <AddFamilyMemberModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />
        </main>
    )
}
