'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MapPin,
  Users,
  Loader2,
  Navigation,
  Map as MapIcon,
  User,
  Signal,
  Pencil,
  Check,
  X,
  PlusCircle,
  Wifi
} from 'lucide-react'
import { useSafety } from '@/lib/context/safety-context'
import { useGeolocation } from '@/lib/hooks/use-geolocation'
import { reverseGeocode } from '@/lib/services/mock-map-service'
import { LocationSearchInput } from '@/components/ui/location-search-input'
import { cn } from '@/lib/utils'

export default function MyLocationsPage() {
  const { familyMembers, updateFamilyMemberLocation, loading: safetyLoading } = useSafety()
  const { location: myLocation, loading: geoLoading } = useGeolocation()
  const [myAddress, setMyAddress] = useState<string>('Detecting location...')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Geocode user location
  useEffect(() => {
    async function getAddress() {
      if (myLocation) {
        const address = await reverseGeocode(myLocation.lat, myLocation.lng)
        setMyAddress(address)
      } else if (!geoLoading) {
        setMyAddress('GPS Lock Required')
      }
    }
    getAddress()
  }, [myLocation, geoLoading])

  const handleEdit = (member: any) => {
    setEditingId(member._id)
    setEditValue(member.location || '')
  }

  const handleSave = async (id: string) => {
    setIsSaving(true)
    try {
      await updateFamilyMemberLocation(id, editValue)
      setEditingId(null)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50/50 pb-24">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#33375D] shadow-lg shadow-[#33375D]/20">
              <MapIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">My Locations</h1>
          </div>
          <p className="text-slate-500 font-bold max-w-md">Manage the vital positions monitored by your safety network.</p>
        </header>

        <section className="space-y-12">
          {/* Section 1: User Location */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Navigation className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live GPS Position</h2>
            </div>

            <Card className="p-10 border-none shadow-xl shadow-slate-100 bg-white relative overflow-hidden group rounded-[2rem]">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <Signal className="w-32 h-32 text-blue-900" />
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-10 relative z-10">
                <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-[2rem] bg-[#33375D] shadow-xl shadow-[#33375D]/20">
                  <User className="w-12 h-12 text-white" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 bg-green-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 shadow-sm">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      Live Feed
                    </span>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      {myLocation ? `${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)}` : 'Requesting Access...'}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 mb-1 tracking-tight uppercase">Your Current Position</h3>
                  <div className="flex items-center gap-2 text-blue-600 font-bold">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <p className="text-xl leading-tight">{geoLoading ? 'Syncing...' : myAddress}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-inner">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                    <p className="font-bold text-slate-900 leading-tight">Optimal (GPS)</p>
                  </div>
                  <Signal className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </Card>
          </div>

          {/* Section 2: Family Network */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Family Safety Network</h2>
              </div>
            </div>

            <div className="grid gap-6">
              {safetyLoading ? (
                <div className="p-24 text-center">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-[#33375D]" />
                </div>
              ) : familyMembers.length === 0 ? (
                <Card className="p-20 text-center bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                  <Users className="w-16 h-16 text-slate-100 mx-auto mb-6" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No family members configured</p>
                  <p className="text-sm text-slate-300 mt-2 font-medium italic">Add members in your Emergency Plan to monitor their locations.</p>
                </Card>
              ) : (
                familyMembers.map((member) => (
                  <Card key={member._id} className="p-6 border-none shadow-lg shadow-slate-100 bg-white hover:shadow-xl transition-all duration-300 rounded-3xl group">
                    <div className="flex items-center gap-6">
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-xl font-black uppercase text-slate-400 shadow-sm transition-colors duration-300 group-hover:bg-[#33375D] group-hover:text-white">
                        {member.name.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight truncate">{member.name}</h4>
                          <span className="px-2 py-0.5 bg-slate-100 text-[9px] font-black text-slate-400 rounded uppercase tracking-widest border border-slate-200/50">
                            {member.relationship}
                          </span>
                        </div>

                        {editingId === member._id ? (
                          <div className="flex items-center gap-3 mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <LocationSearchInput
                              value={editValue}
                              onChange={setEditValue}
                              placeholder="Search address..."
                              className="flex-1"
                              inputClassName="h-12 rounded-xl border-slate-100 bg-slate-50 font-bold text-sm"
                              onSelect={(name: string) => setEditValue(name)}
                            />
                            <div className="flex gap-2 shrink-0">
                              <Button size="icon" onClick={() => handleSave(member._id)} className="h-12 w-12 rounded-xl bg-[#33375D] shadow-lg shadow-[#33375D]/20 transition-all hover:scale-110 hover:bg-[#2B2F50]">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Check className="h-5 w-5" />}
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} className="rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 h-12 w-12 transition-all">
                                <X className="w-5 h-5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2 text-slate-500 font-bold text-sm min-w-0">
                              <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                              <p className="truncate font-medium">{member.location || 'Location Not Set'}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(member)}
                              className="h-10 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 font-black text-[10px] gap-2 px-4 flex-shrink-0 uppercase tracking-widest"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
