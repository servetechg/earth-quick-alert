'use client'

import { X, MapPin, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmergencyResource } from '@/lib/types/emergency'
import { findNearbyResources } from '@/lib/services/mock-map-service'
import dynamic from 'next/dynamic'

// Dynamically import LeafletMap to avoid SSR issues
const LeafletMap = dynamic(() => import('../leaflet-map'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-100 animate-pulse flex items-center justify-center rounded-2xl">
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Loading Interactive Map...</p>
    </div>
})

interface ResourceMapModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    resources: EmergencyResource[]
    userLocation?: { lat: number; lng: number }
}

export function ResourceMapModal({
    isOpen,
    onClose,
    title,
    resources,
    userLocation = { lat: 37.7749, lng: -122.4194 }, // Default: SF
}: ResourceMapModalProps) {
    if (!isOpen) return null

    const nearbyResources = findNearbyResources(
        userLocation.lat,
        userLocation.lng,
        resources,
        1000 // Large radius for demo
    )

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-slate-50 text-slate-900 border-b border-slate-100 p-6 flex items-center justify-between sticky top-0 z-[500]">
                    <div className="flex items-center gap-3">
                        <MapPin className="w-8 h-8 text-blue-600" />
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight">{title}</h2>
                            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Active Search Coverage: 1000km</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400 hover:text-slate-900 border border-transparent hover:border-slate-200">
                        <X className="w-7 h-7" />
                    </button>
                </div>

                <div className="p-0 flex flex-col md:flex-row h-[70vh] overflow-hidden">
                    {/* Map Sidebar / List */}
                    <div className="w-full md:w-80 border-r border-slate-100 overflow-y-auto bg-slate-50 order-2 md:order-1">
                        <div className="p-4 bg-white border-b border-slate-100 sticky top-0 z-10">
                            <h3 className="font-black text-xs text-slate-400 uppercase tracking-widest">Nearby Locations ({nearbyResources.length})</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            {nearbyResources.map((resource) => (
                                <div
                                    key={resource.id}
                                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                                >
                                    <div className="flex flex-col gap-2">
                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <h4 className="font-black text-slate-900 text-sm leading-tight group-hover:text-blue-600 transition-colors">{resource.name}</h4>
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight border ${resource.status === 'available'
                                                        ? 'bg-green-50 text-green-700 border-green-100'
                                                        : resource.status === 'limited'
                                                            ? 'bg-yellow-50 text-yellow-700 border-yellow-100'
                                                            : 'bg-red-50 text-red-700 border-red-100'
                                                        }`}
                                                >
                                                    {resource.status}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">{resource.location.address}</p>
                                        </div>

                                        <div className="flex items-center gap-3 pt-2 border-t border-slate-50">
                                            {resource.contact && (
                                                <p className="text-[10px] font-black text-slate-500">📞 CONTACT</p>
                                            )}
                                            {resource.distance && (
                                                <p className="text-[10px] font-black text-blue-600 ml-auto">{(resource.distance * 1.609).toFixed(1)} KM AWAY</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Interactive Map */}
                    <div className="flex-1 relative bg-slate-100 order-1 md:order-2">
                        <LeafletMap
                            center={userLocation}
                            resources={nearbyResources}
                            zoom={13}
                            className="h-full w-full"
                        />

                        {/* Map Overlay Controls Details (optional) */}
                        <div className="absolute top-4 right-4 z-[400] space-y-2">
                            <div className="bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-white/20">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Live Sensors</p>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                    <span className="text-[10px] font-black text-slate-900 uppercase">Operational</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 z-[500]">
                    <Button variant="outline" onClick={onClose} className="rounded-xl font-black uppercase text-[10px] tracking-widest h-10 px-6">Close Explorer</Button>
                    <Button className="h-10 rounded-xl bg-[#33375D] px-6 font-black uppercase tracking-widest text-[10px] text-white hover:bg-[#2B2F50]">Get Directions</Button>
                </div>
            </div>
        </div>
    )
}
