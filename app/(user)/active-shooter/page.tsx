'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, Phone, ShieldAlert, Footprints, EyeOff, Hand, ChevronRight, MapPin, Users, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useSafety } from '@/lib/context/safety-context'
import { useGeolocation } from '@/lib/hooks/use-geolocation'
import { useEvents } from '@/lib/store/event-store'
import { cn } from '@/lib/utils'
import { reverseGeocode } from '@/lib/services/mock-map-service'

export default function ActiveShooterPage() {
    const router = useRouter()
    const [step, setStep] = useState<number>(0)
    const { myStatus, familyMembers, updateMyStatus, loading: safetyLoading } = useSafety()
    const familySafeCount = familyMembers.filter(m => m.status === 'SAFE' || m.status === 'true').length
    const { location, error: geoError, loading: geoLoading } = useGeolocation()
    const { getActiveEvents } = useEvents()
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [address, setAddress] = useState<string | null>(null)

    useEffect(() => {
        async function fetchAddress() {
            if (location) {
                try {
                    const addr = await reverseGeocode(location.lat, location.lng)
                    setAddress(addr)
                } catch (error) {
                    console.error("Failed to reverse geocode:", error)
                    setAddress(`${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`)
                }
            }
        }
        fetchAddress()
    }, [location])

    // Detect if there's an active shooter event in siblings or nearby
    const activeEvents = getActiveEvents()
    const shooterEvent = activeEvents.find(e => e.type.toLowerCase().includes('shooter') || e.title.toLowerCase().includes('shooter'))

    const handleReportStatus = async (status: 'SAFE' | 'DANGER') => {
        setIsUpdatingStatus(true)
        try {
            await updateMyStatus(status)
        } finally {
            setIsUpdatingStatus(false)
        }
    }

    const steps = [
        {
            title: 'RUN',
            icon: Footprints,
            color: 'bg-green-600',
            desc: 'If there is an accessible escape path, attempt to evacuate the premises.',
            points: [
                'Have an escape route and plan in mind',
                'Leave your belongings behind',
                'Keep your hands visible',
                'Follow police instructions'
            ]
        },
        {
            title: 'HIDE',
            icon: EyeOff,
            color: 'bg-blue-600',
            desc: 'If evacuation is not possible, find a place to hide where the active shooter is less likely to find you.',
            points: [
                'Hide in an area out of the active shooter’s view',
                'Block entry to your hiding place and lock the doors',
                'Silence your cell phone and/or pager',
                'Remain quiet'
            ]
        },
        {
            title: 'FIGHT',
            icon: Hand,
            color: 'bg-red-600',
            desc: 'As a last resort, and only when your life is in imminent danger, attempt to disrupt and/or incapacitate the active shooter.',
            points: [
                'Act as aggressively as possible against him/her',
                'Throw items and improvise weapons',
                'Yell',
                'Commit to your actions'
            ]
        }
    ]

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col pb-20">
            {/* Dynamic Critical Header */}
            {shooterEvent && (
                <div className="bg-red-600 p-4 flex items-center justify-between animate-pulse shadow-2xl z-50">
                    <div className="flex items-center gap-3">
                        <ShieldAlert className="w-6 h-6 text-white" />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1 text-red-100">Critical Threat Detected</p>
                            <h2 className="font-black text-white text-lg leading-none uppercase tracking-tighter">{shooterEvent.title}</h2>
                        </div>
                    </div>
                </div>
            )}

            <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">

                {/* Personal Safety Quick Actions */}
                {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className={cn(
                        "p-6 border-0 shadow-2xl transition-all duration-500 overflow-hidden relative",
                        myStatus === 'SAFE' ? "bg-green-600" : "bg-red-600"
                    )}>
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Your Personal Status</p>
                                <h3 className="text-3xl font-black italic tracking-tighter text-white uppercase">{myStatus}</h3>
                            </div>
                            {myStatus === 'SAFE' ? <ShieldCheck className="w-12 h-12 text-white/20" /> : <AlertTriangle className="w-12 h-12 text-white/20" />}
                        </div>
                        <div className="mt-6 flex gap-2">
                            <Button
                                disabled={isUpdatingStatus || myStatus === 'SAFE'}
                                onClick={() => handleReportStatus('SAFE')}
                                className="flex-1 bg-white text-green-600 font-black uppercase tracking-widest h-12 rounded-xl hover:bg-green-50 shadow-xl"
                            >
                                {isUpdatingStatus ? <Loader2 className="h-4 w-4 animate-spin text-green-600" /> : "I AM SAFE"}
                            </Button>
                            <Button
                                disabled={isUpdatingStatus || myStatus === 'DANGER'}
                                onClick={() => handleReportStatus('DANGER')}
                                className="flex-1 bg-red-900/40 text-white border border-white/20 font-black uppercase tracking-widest h-12 rounded-xl hover:bg-red-900/60"
                            >
                                NEED HELP
                            </Button>
                        </div>
                    </Card>

                    <Card className="p-6 bg-slate-800 border-slate-700 shadow-2xl flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Family Safety Hub</p>
                                <h3 className="text-2xl font-black italic tracking-tighter text-white uppercase">
                                    {familySafeCount}/{familyMembers.length} Safe
                                </h3>
                            </div>
                            <Users className="w-8 h-8 text-blue-500/40" />
                        </div>
                        <div className="space-y-2">
                            {familyMembers.slice(0, 3).map((member, i) => (
                                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                                    <span className="text-xs font-bold text-slate-300">{member.name}</span>
                                    <span className={cn(
                                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                                        member.status === 'SAFE' || member.status === 'true' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                    )}>
                                        {member.status === 'SAFE' || member.status === 'true' ? 'SAFE' : 'DANGER'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div> */}

                {/* RUN HIDE FIGHT Selector */}
                <div className="grid grid-cols-3 gap-3">
                    {steps.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => setStep(i)}
                            className={cn(
                                "p-4 rounded-2xl text-center transition-all duration-300 border h-24 flex flex-col items-center justify-center gap-1",
                                step === i ? cn(s.color, "border-white shadow-xl scale-105") : "bg-slate-800/50 border-slate-700 opacity-40 hover:opacity-100"
                            )}
                        >
                            <s.icon className="w-6 h-6" />
                            <span className="font-black text-[10px] uppercase tracking-widest">{s.title}</span>
                        </button>
                    ))}
                </div>

                <div className="space-y-6">
                    {/* Proximity Awareness */}
                    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping" />
                            <div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block leading-none mb-1">Live Telemetry Active</span>
                                <p className="text-xs font-bold text-white uppercase tracking-tighter truncate max-w-[200px]">
                                    {geoLoading ? "Acquiring Satellites..." : address ? address : location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : "GPS Unavailable"}
                                </p>
                            </div>
                        </div>
                        <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/20 uppercase tracking-widest">READY2GO™ AI</span>
                    </div>

                    <div className={cn("p-8 rounded-3xl shadow-2xl transition-all duration-700 min-h-[300px] flex flex-col justify-center", steps[step].color)}>
                        <div className="flex items-center gap-6 mb-6">
                            <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner rotate-3">
                                {React.createElement(steps[step].icon, { className: 'w-10 h-10 text-white' })}
                            </div>
                            <h2 className="text-6xl font-black italic tracking-tighter text-white uppercase">{steps[step].title}</h2>
                        </div>
                        <p className="font-bold text-xl mb-8 leading-relaxed text-white/90 max-w-lg">
                            {steps[step].desc}
                        </p>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {steps[step].points.map((p, i) => (
                                <li key={i} className="flex items-start gap-3 bg-black/10 p-3 rounded-xl border border-white/10">
                                    <ShieldCheck className="w-5 h-5 text-white/50 shrink-0" />
                                    <span className="text-sm font-bold text-white/90 leading-tight">{p}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Smart 911 Block */}
                    <div className="space-y-4">
                        <Button
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-black h-20 text-2xl shadow-2xl border-b-8 border-red-800 active:border-b-0 active:translate-y-2 transition-all rounded-3xl"
                            onClick={() => router.push('/virtual-eoc/911')}
                        >
                            <Phone className="w-8 h-8 mr-4 animate-bounce" />
                            CALL 911 NOW
                        </Button>

                        <div className="bg-slate-800 border-2 border-slate-700 p-6 rounded-3xl space-y-3 shadow-xl">
                            <div className="flex items-center gap-3 text-sm font-black text-red-500 uppercase tracking-[0.2em]">
                                <ShieldAlert className="w-5 h-5 animate-pulse" />
                                Smart Dispatch Interface
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
                                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2">My Location (GPS)</p>
                                    <p className="text-xs font-bold text-blue-400">
                                        {location ? `${location.lat.toFixed(4)} N, ${location.lng.toFixed(4)} W` : "Locating..."}
                                    </p>
                                </div>
                                <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
                                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Family Readiness</p>
                                    <p className="text-xs font-bold text-green-400">
                                        {Math.round((familySafeCount / (familyMembers.length || 1)) * 100)}% Marked Safe
                                    </p>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed pt-2">
                                When you call via Ready2Go, local dispatch automatically receives your <span className="text-white font-black uppercase">Identity Profile</span>, current <span className="text-white font-black uppercase">Geocoded Address</span>, and precise <span className="text-white font-black uppercase">GPS Telemetry</span>.
                            </p>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    )
}
