'use client'

import { useState } from 'react'
import { X, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

import { GoogleMap } from '@/components/google-map'

interface GISEOCActivatedModalProps {
  isOpen: boolean
  onClose: () => void
}

const mapLayers = [
  'Shelter-in-Place Locations',
  'Evacuation Routes',
  'Hospitals & Emergency Care',
  'Open Pharmacies',
  'Restricted & Impacted Areas',
]

const initialReports = [
  {
    id: 1,
    name: 'Elvira Davis',
    time: '5 Minutes ago',
    location: '626 Jerrold Stravenue, Cloverburgh 76058',
    status: 'pending' as const,
    pos: { lat: 41.8850, lng: -87.6350 }
  },
  {
    id: 2,
    name: 'Sidney White',
    time: '10 Minutes ago',
    location: '60728 Will Causeway, Lake Felton 36352-6134',
    status: 'verified' as const,
    pos: { lat: 41.8750, lng: -87.6250 }
  },
]

const tabData: Record<string, any[]> = {
  'Shelter-in-Place Locations': [
    { id: 's1', position: { lat: 41.8827, lng: -87.6233 }, title: 'Millennium Park Shelter', type: 'condition', color: '#3b82f6', description: 'Large capacity underground shelter.' },
    { id: 's2', position: { lat: 41.8781, lng: -87.6298 }, title: 'Union Station Safe Zone', type: 'condition', color: '#10b981', description: 'Verified safety point.' },
  ],
  'Evacuation Routes': [
    { id: 'e1', position: { lat: 41.8800, lng: -87.6400 }, title: 'I-90 Westbound (Verified)', type: 'incident', status: 'Clear', description: 'Primary evacuation route for Loop traffic.' },
    { id: 'e2', position: { lat: 41.8700, lng: -87.6200 }, title: 'Lake Shore Drive North', type: 'incident', status: 'Congested', description: 'Secondary route, use with caution.' },
  ],
  'Hospitals & Emergency Care': [
    { id: 'h1', position: { lat: 41.8950, lng: -87.6200 }, title: 'Northwestern Memorial', type: 'condition', color: '#ef4444', description: 'Trauma center Level 1.' },
  ],
  'Open Pharmacies': [
    { id: 'p1', position: { lat: 41.8800, lng: -87.6300 }, title: 'Walgreens 24h', type: 'condition', color: '#3b82f6', description: 'Supplies available.' },
  ],
  'Restricted & Impacted Areas': [
    { id: 'r1', position: { lat: 41.8880, lng: -87.6320 }, title: 'Impact Zone A', type: 'earthquake', magnitude: 4, radius: 2000, description: 'High priority restricted area.' },
  ],
}

export function GISEOCActivatedModal({ isOpen, onClose }: GISEOCActivatedModalProps) {
  const [activeLayer, setActiveLayer] = useState('Shelter-in-Place Locations')
  const [reports, setReports] = useState(initialReports)

  const handleVerify = (id: number) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'verified' } : r))
  }

  const handleDeny = (id: number) => {
    setReports(prev => prev.filter(r => r.id !== id))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <Card className="w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden border-none animate-in fade-in zoom-in duration-300">
        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#111827]">EOC Activated View</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Layer Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {mapLayers.map((layer) => (
              <button
                key={layer}
                onClick={() => setActiveLayer(layer)}
                className={cn(
                  "px-4 py-2 rounded-lg font-bold text-[11px] transition-all",
                  activeLayer === layer
                    ? "bg-[#33375D] text-white shadow-md shadow-[#33375D]/20"
                    : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                )}
              >
                {layer}
              </button>
            ))}
          </div>

          {/* Map Container */}
          <div className="w-full h-[380px] rounded-2xl overflow-hidden border border-slate-100 shadow-inner relative group">
            <GoogleMap
              center={{ lat: 41.8781, lng: -87.6298 }}
              zoom={13}
              markers={[
                ...tabData[activeLayer],
                ...reports.map(r => ({
                  id: `rep-${r.id}`,
                  position: r.pos,
                  title: r.name,
                  type: 'user' as const,
                  isSafe: r.status === 'verified',
                  status: r.status === 'verified' ? 'Verified Location' : 'Pending Verification',
                  description: r.location
                }))
              ]}
            />
            {/* Design overlay simulating strategic view */}
            <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-white/80 backdrop-blur-md rounded-full border border-slate-200">
              <span className="text-[8px] font-black text-slate-900 uppercase tracking-widest">Tactical Layer: {activeLayer}</span>
            </div>
          </div>

          {/* Verification Rows */}
          <div className="space-y-3 pt-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className="grid grid-cols-[1.2fr_1.8fr_auto] items-center gap-6 p-4 bg-slate-50/50 rounded-2xl hover:bg-slate-50 transition-all border border-slate-100/50"
              >
                <div>
                  <p className="font-extrabold text-[#111827] text-base leading-none mb-1">{report.name}</p>
                  <p className="text-[12px] font-bold text-[#64748B]">{report.time}</p>
                </div>

                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-[12px] font-bold text-slate-600 leading-tight max-w-[280px]">
                    {report.location}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 min-w-[170px] justify-end">
                  {report.status === 'verified' ? (
                    <Button
                      disabled
                      className="w-full bg-[#E2E8F0] text-[#94A3B8] font-black uppercase tracking-widest text-[10px] h-10 border-none rounded-xl"
                    >
                      Verified
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => handleDeny(report.id)}
                        className="bg-white hover:bg-red-50 text-[#64748B] hover:text-red-600 font-bold text-[12px] h-10 px-6 rounded-xl border border-slate-200 transition-all"
                      >
                        Deny
                      </Button>
                      <Button
                        onClick={() => handleVerify(report.id)}
                        className="h-10 rounded-xl bg-[#33375D] px-6 font-bold text-[12px] text-white shadow-lg shadow-[#33375D]/25 transition-all hover:bg-[#2B2F50] active:scale-95"
                      >
                        Verify
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {reports.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">All reports processed.</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
