'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Hospital,
    Fuel,
    Pill,
    Search,
    Map as MapIcon,
    AlertCircle,
    Hotel,
    Navigation,
    Shield,
    Activity,
    Loader2,
    ChevronRight,
    ChevronLeft,
    Coffee,
    DollarSign,
    Car
} from 'lucide-react'
import { useGeolocation } from '@/lib/hooks/use-geolocation'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { fetchNearbyResources } from '@/lib/services/places-service'
import { calculateDistance } from '@/lib/services/mock-map-service'
import { EmergencyResource } from '@/lib/types/emergency'
import { cn } from '@/lib/utils'

const LeafletMap = dynamic<{
    center: { lat: number; lng: number }
    resources: EmergencyResource[]
    zoom?: number
    className?: string
    interactive?: boolean
}>(() => import('@/components/leaflet-map'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-100 animate-pulse flex items-center justify-center">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Synchronizing Tactical Map...</p>
    </div>
})

function ResourcesContent() {
    const searchParams = useSearchParams()
    const urlType = searchParams?.get('type')
    const { location: geoLoc } = useGeolocation()

    const [activeCategory, setActiveCategory] = useState<string>(urlType || 'hospital')
    const [resources, setResources] = useState<EmergencyResource[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)

    const userLocation = useMemo(() => ({
        lat: geoLoc?.lat || 37.7749,
        lng: geoLoc?.lng || -122.4194
    }), [geoLoc])

    useEffect(() => {
        if (urlType) setActiveCategory(urlType)
    }, [urlType])

    useEffect(() => {
        async function loadResources() {
            setIsLoading(true)
            try {
                const results = await fetchNearbyResources(userLocation.lat, userLocation.lng, activeCategory);
                const resourcesWithDistance = results.map(r => ({
                    ...r,
                    distance: calculateDistance(userLocation.lat, userLocation.lng, r.location.lat, r.location.lng)
                })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
                setResources(resourcesWithDistance);
            } catch (error) {
                console.error('Error loading resources:', error);
            } finally {
                setIsLoading(false)
            }
        }
        loadResources()
    }, [userLocation, activeCategory])

    const resourceTypes = [
        { id: 'hospital', label: 'Hospitals', icon: Hospital, color: 'bg-red-600', shadow: 'shadow-red-50' },
        { id: 'pharmacy', label: 'Pharmacies', icon: Pill, color: 'bg-green-600', shadow: 'shadow-green-50' },
        { id: 'lodging', label: 'Lodging', icon: Hotel, color: 'bg-blue-600', shadow: 'shadow-blue-50' },
        { id: 'food', label: 'Food & Essentials', icon: Coffee, color: 'bg-orange-600', shadow: 'shadow-orange-50' },
        { id: 'financial', label: 'Financial Services', icon: DollarSign, color: 'bg-purple-600', shadow: 'shadow-purple-50' },
        { id: 'traffic', label: 'Traffic Status', icon: Car, color: 'bg-yellow-600', shadow: 'shadow-yellow-50' },
    ]

    const ResourceItem = ({ resource }: { resource: EmergencyResource }) => (
        <Card className="p-5 border-none bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                <Shield className="w-12 h-12 text-indigo-900" />
            </div>
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-1.5">
                    <h4 className="font-black text-slate-900 text-base leading-tight group-hover:text-blue-600 transition-colors uppercase pr-4">{resource.name}</h4>
                    <Badge className={cn(
                        "text-[8px] font-black uppercase tracking-tighter border-none py-0.5 px-2 rounded-full",
                        resource.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    )}>
                        {resource.status}
                    </Badge>
                </div>
                <p className="text-xs font-bold text-slate-500 mb-4">{resource.location.address}</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-xl">
                        <Navigation className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{resource.distance?.toFixed(1)} MI</span>
                    </div>
                </div>
            </div>
        </Card>
    )

    return (
        <main className="flex-1 overflow-hidden flex flex-col h-full bg-slate-50 relative">
            {/* Unified Premium Header - Compact Scale */}
            <div className="p-6 bg-white border-b border-slate-100 shadow-sm z-20">
                <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2.5 mb-1">
                            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-100">
                                <Activity className="w-4 h-4 text-white" />
                            </div>
                            <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Resources</h1>
                        </div>
                        <p className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">Tactical mapping and status synchronization.</p>
                    </div>

                    <div className="flex gap-2 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0 no-scrollbar items-center">
                        {resourceTypes.map((type) => {
                            const Icon = type.icon;
                            const isActive = activeCategory === type.id;
                            return (
                                <Button
                                    key={type.id}
                                    variant={isActive ? 'default' : 'outline'}
                                    onClick={() => setActiveCategory(type.id)}
                                    className={cn(
                                        "gap-1.5 rounded-full font-bold uppercase text-[9px] tracking-widest h-9 px-6 transition-all duration-300",
                                        isActive
                                            ? `${type.color} text-white border-none shadow-xl ${type.shadow} scale-105`
                                            : "border-slate-100 bg-white text-slate-400 hover:text-blue-600 hover:bg-slate-50"
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {type.label}
                                </Button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex-1 relative">
                {/* Map Layer */}
                <div className="absolute inset-0 z-0">
                    <LeafletMap center={userLocation} resources={resources} zoom={13} />
                </div>

                <Button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={cn(
                        "absolute transition-all duration-500 z-30 shadow-2xl rounded-2xl h-11 w-11 p-0 flex items-center justify-center bg-white hover:bg-slate-50 border border-slate-100 text-slate-900 hover:text-blue-600",
                        // Mobile positioning: bottom middle
                        "bottom-6 left-1/2 -translate-x-1/2 md:top-8 md:bottom-auto md:translate-x-0 md:left-auto",
                        // Desktop right positioning
                        isSidebarOpen ? "md:right-[37rem]" : "md:right-8"
                    )}
                >
                    <div className="hidden md:block">
                        {isSidebarOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                    </div>
                    <div className="block md:hidden">
                        <MapIcon className="w-5 h-5" />
                    </div>
                </Button>

                {/* Tactical Intel Panel - Full Height Right Aligned Desktop / Full Width Bottom Mobile */}
                <div className={cn(
                    "absolute bg-white/95 backdrop-blur-xl border-slate-100 shadow-2xl flex flex-col overflow-hidden z-20 transition-all duration-500",
                    // Mobile styles: bottom up sheet
                    "left-0 right-0 bottom-0 rounded-t-[2.5rem] border-t h-[60vh] md:h-auto",
                    // Desktop styles: fixed right side
                    "md:left-auto md:top-0 md:bottom-0 md:w-[36rem] md:rounded-l-[2.5rem] md:rounded-tr-none md:border-t-0 md:border-l",
                    isSidebarOpen ? "translate-y-0 md:translate-y-0 md:right-0 opacity-100" : "translate-y-full md:translate-y-0 md:-right-full opacity-0 pointer-events-none"
                )}>
                    <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Area Intel</h3>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Live</span>
                            </div>
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {isLoading ? 'Scanning perimeters...' : `${resources.length} nodes detected`}
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-white/50">
                        {isLoading ? (
                            <div className="space-y-4">
                                {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-slate-50/50 animate-pulse rounded-2xl border border-slate-50" />)}
                            </div>
                        ) : resources.length === 0 ? (
                            <div className="py-20 text-center flex flex-col items-center gap-6">
                                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center"><Search className="w-8 h-8 text-slate-200" /></div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No nodes located</p>
                            </div>
                        ) : (
                            resources.map((resource) => <ResourceItem key={resource.id} resource={resource} />)
                        )}
                    </div>
                </div>
            </div>
        </main>
    )
}

export default function ResourcesPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
                <Loader2 className="w-12 h-12 animate-spin text-[#33375D]" />
                <p className="font-bold text-slate-400">Loading intelligence data...</p>
            </div>
        }>
            <ResourcesContent />
        </Suspense>
    )
}
