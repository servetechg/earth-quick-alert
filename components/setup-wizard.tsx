'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Building2, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  Radio, 
  ShieldAlert, 
  Settings2,
  ChevronRight,
  ChevronLeft
} from 'lucide-react'

export function SetupWizard({ 
  licenseId, 
  organizationName,
  onComplete 
}: { 
  licenseId: string, 
  organizationName: string,
  onComplete: () => void 
}) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [setupData, setSetupData] = useState({
    geographicBoundaries: {
        type: 'Polygon',
        coordinates: [
            // Default Karachi, Sindh, Pakistan coordinates
            [
              [66.9, 25.1], // Top-Left
              [67.2, 25.1], // Top-Right
              [67.2, 24.7], // Bottom-Right
              [66.9, 24.7], // Bottom-Left
              [66.9, 25.1]  // Close Loop
            ]
        ]
    },
    thresholds: {
        minor: { triggerEOC: false },
        moderate: { triggerEOC: false },
        major: { triggerEOC: true },
        catastrophic: { triggerEOC: true }
    },
    oneMinutePollingEvents: [] as string[]
  })

  const eventTypes = ['earthquake', 'hurricane', 'tornado', 'flood', 'wildfire', 'severe-weather']

  const handleToggleEvent = (eventName: string) => {
      setSetupData(prev => {
          const isSelected = prev.oneMinutePollingEvents.includes(eventName)
          return {
              ...prev,
              oneMinutePollingEvents: isSelected 
                  ? prev.oneMinutePollingEvents.filter(e => e !== eventName)
                  : [...prev.oneMinutePollingEvents, eventName]
          }
      })
  }

  const handleToggleThreshold = (level: 'minor'|'moderate'|'major'|'catastrophic') => {
      setSetupData(prev => ({
          ...prev,
          thresholds: {
              ...prev.thresholds,
              [level]: { triggerEOC: !prev.thresholds[level].triggerEOC }
          }
      }))
  }

  const [customBounds, setCustomBounds] = useState({
      north: 25.1000,
      south: 24.7000,
      east: 67.2000,
      west: 66.9000
  })

  // Whenever custom bounds change, we update the GeoJSON Polygon that gets sent to Mongoose
  const updateGeoJSON = (bounds: typeof customBounds) => {
      setSetupData(prev => ({
          ...prev,
          geographicBoundaries: {
              type: 'Polygon',
              coordinates: [
                  [
                      [bounds.west, bounds.north], // Top-Left
                      [bounds.east, bounds.north], // Top-Right
                      [bounds.east, bounds.south], // Bottom-Right
                      [bounds.west, bounds.south], // Bottom-Left
                      [bounds.west, bounds.north]  // Close Loop
                  ]
              ]
          }
      }))
  }

  const handleBoundChange = (field: string, value: string) => {
      const numValue = parseFloat(value) || 0
      const newBounds = { ...customBounds, [field]: numValue }
      setCustomBounds(newBounds)
      updateGeoJSON(newBounds)
  }

  const handleSaveSetup = async () => {
      setLoading(true)
      setError('')

      try {
          const res = await fetch(`/api/setup-wizard/${licenseId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(setupData)
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error)

          // Setup done, instantly lift the dashboard block
          onComplete()

      } catch (err: any) {
          setError(err.message || 'Setup encountered a critical failure. Contact Support.')
      } finally {
          setLoading(false)
      }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 overflow-y-auto">
      <Card className="w-full max-w-4xl bg-slate-900 border-slate-700 shadow-2xl overflow-hidden mt-10 mb-10">
        <div className="flex">
            {/* Sidebar Flow Indicators */}
            <div className="w-64 bg-slate-800 p-6 hidden md:block border-r border-slate-700">
                <div className="mb-8">
                    <Building2 className="w-10 h-10 text-yellow-400 mb-2" />
                    <h2 className="text-xl font-bold text-white">EOC Onboarding</h2>
                    <p className="text-sm text-slate-400">{organizationName}</p>
                </div>

                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${step >= 1 ? 'border-yellow-400 bg-yellow-400 text-slate-900' : 'border-slate-500 bg-slate-800 text-slate-500'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10`}>
                      1
                    </div>
                    <div className="text-white w-[calc(100%-2.5rem)] md:w-[calc(50%-2.5rem)] text-sm font-semibold p-2">
                        Geographic Zone
                    </div>
                  </div>

                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${step >= 2 ? 'border-yellow-400 bg-yellow-400 text-slate-900' : 'border-slate-500 bg-slate-800 text-slate-500'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10`}>
                      2
                    </div>
                    <div className="text-white w-[calc(100%-2.5rem)] md:w-[calc(50%-2.5rem)] text-sm font-semibold p-2">
                        EOC Triggers
                    </div>
                  </div>

                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${step >= 3 ? 'border-yellow-400 bg-yellow-400 text-slate-900' : 'border-slate-500 bg-slate-800 text-slate-500'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10`}>
                      3
                    </div>
                    <div className="text-white w-[calc(100%-2.5rem)] md:w-[calc(50%-2.5rem)] text-sm font-semibold p-2">
                        Radar Polling
                    </div>
                  </div>
                </div>
            </div>

            {/* Main Form Content */}
            <div className="flex-1 flex flex-col min-h-[600px]">
                <CardHeader className="bg-slate-900 border-b border-slate-800 p-8">
                  <CardTitle className="text-3xl font-extrabold text-white">
                    {step === 1 && 'System Coordinate Boundaries'}
                    {step === 2 && 'Automatic EOC Activation Triggers'}
                    {step === 3 && 'Crucial Incident Radar Polling'}
                  </CardTitle>
                  <CardDescription className="text-base text-slate-400 mt-2">
                    {step === 1 && 'Define the geographic perimeters that your EOC operates inside. Events strictly falling inside this fence will be captured.'}
                    {step === 2 && 'When incidents strike, our engine determines if they meet the threshold to trigger full EOC scale activation or simply appear as minor incidents on the map.'}
                    {step === 3 && 'Select which catastrophic incidents warrant 1-minute live radar & status updates vs standard long-polling.'}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="p-8 flex-1">
                  
                  {/* Step 1: Mapping Boundaries */}
                  {step === 1 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <p className="text-sm text-slate-400 mb-4 font-medium">
                              Establish your EOC Operations perimeter. Only critical incidents intersecting these coordinates will trigger your dashboard alert logic.
                          </p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                              {/* Boundary Inputs */}
                              <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-inner">
                                  <div className="flex items-center gap-3 mb-6">
                                      <MapPin className="w-6 h-6 text-yellow-400" />
                                      <h3 className="font-bold text-white text-lg">Define Bounding Box</h3>
                                  </div>

                                  <div className="space-y-4">
                                      <div className="flex flex-col">
                                          <Label className="text-slate-400 text-xs font-bold uppercase mb-1">Northern Limit (Lat)</Label>
                                          <Input type="number" step="0.0001" value={customBounds.north} onChange={e => handleBoundChange('north', e.target.value)} className="bg-slate-900 border-slate-700 text-white h-12" />
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                          <div className="flex flex-col">
                                              <Label className="text-slate-400 text-xs font-bold uppercase mb-1">Western Limit (Lng)</Label>
                                              <Input type="number" step="0.0001" value={customBounds.west} onChange={e => handleBoundChange('west', e.target.value)} className="bg-slate-900 border-slate-700 text-white h-12" />
                                          </div>
                                          <div className="flex flex-col">
                                              <Label className="text-slate-400 text-xs font-bold uppercase mb-1">Eastern Limit (Lng)</Label>
                                              <Input type="number" step="0.0001" value={customBounds.east} onChange={e => handleBoundChange('east', e.target.value)} className="bg-slate-900 border-slate-700 text-white h-12" />
                                          </div>
                                      </div>
                                      <div className="flex flex-col">
                                          <Label className="text-slate-400 text-xs font-bold uppercase mb-1">Southern Limit (Lat)</Label>
                                          <Input type="number" step="0.0001" value={customBounds.south} onChange={e => handleBoundChange('south', e.target.value)} className="bg-slate-900 border-slate-700 text-white h-12" />
                                      </div>
                                  </div>
                              </div>

                              {/* Visualization Context */}
                              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 flex flex-col items-center justify-center text-center h-full relative overflow-hidden">
                                  <div className="absolute inset-0 opacity-10 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/e0/Arkansas_in_United_States.svg')] bg-cover bg-center mix-blend-screen pointer-events-none hidden"></div>
                                  <ShieldAlert className="w-16 h-16 text-slate-600 mb-4 z-10" />
                                  <h4 className="text-slate-300 font-bold mb-2 z-10">GeoJSON Polygon Active</h4>
                                  <p className="text-xs text-slate-500 z-10 pb-4">
                                      The system will automatically convert these max boundary limits into a topologically valid GeoJSON loop for the backend engine.
                                  </p>
                                  <Button 
                                      variant="outline" 
                                      className="z-10 bg-slate-900 border-slate-600 text-slate-300 hover:text-white"
                                      onClick={() => {
                                          const karachi = { north: 25.2000, south: 24.6000, east: 67.3000, west: 66.8000 }
                                          setCustomBounds(karachi)
                                          updateGeoJSON(karachi)
                                      }}
                                  >
                                      Load Karachi, Sindh Profile
                                  </Button>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* Step 2: Thresholds */}
                  {step === 2 && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div className="grid grid-cols-2 gap-4 mt-4">
                              {[
                                  { key: 'minor', label: 'Minor Incidents', desc: 'Car crashes, localized weather warnings, structural issues.', color: 'border-blue-500/50' },
                                  { key: 'moderate', label: 'Moderate Incidents', desc: 'Multi-vehicle crashes, violent storms, massive power outages.', color: 'border-emerald-500/50' },
                                  { key: 'major', label: 'Major Disasters', desc: 'Floods, hurricanes touching land, chemical spills.', color: 'border-orange-500/50' },
                                  { key: 'catastrophic', label: 'Catastrophic Events', desc: 'Category 5 disasters, devastating earthquakes, immediate threat to life.', color: 'border-red-500/50' }
                              ].map((lvl) => {
                                  const isActive = setupData.thresholds[lvl.key as keyof typeof setupData.thresholds].triggerEOC;
                                  return (
                                  <div 
                                      key={lvl.key}
                                      onClick={() => handleToggleThreshold(lvl.key as any)}
                                      className={`p-5 rounded-xl border-2 cursor-pointer transition-all duration-300 ${isActive ? `bg-slate-800 ${lvl.color}` : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                                  >
                                      <div className="flex justify-between items-start mb-2">
                                          <h4 className={`text-lg font-bold capitalize ${isActive ? 'text-white' : 'text-slate-400'}`}>{lvl.label}</h4>
                                          {isActive && <CheckCircle2 className="w-5 h-5 text-yellow-400" />}
                                      </div>
                                      <p className="text-xs text-slate-500 leading-tight">{lvl.desc}</p>
                                      <div className="mt-3 text-xs font-semibold">
                                          {isActive ? (
                                              <span className="text-emerald-400">Triggers Dashboard Mode</span>
                                          ) : (
                                              <span className="text-slate-600">Map View Mode Only</span>
                                          )}
                                      </div>
                                  </div>
                              )})}
                          </div>
                      </div>
                  )}

                  {/* Step 3: Polling */}
                  {step === 3 && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                          {error && (
                              <div className="bg-red-500/10 border border-red-500 p-4 rounded text-red-500 text-sm">
                                  {error}
                              </div>
                          )}
                          <p className="text-sm text-slate-400 mb-6 font-medium">
                              Select incidents that require continuous radar tracking and rapid communication alerts. Unselected incidents will use 10-minute low-band polling.
                          </p>
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                              {eventTypes.map(ety => {
                                  const isSelected = setupData.oneMinutePollingEvents.includes(ety);
                                  return (
                                  <div 
                                      key={ety} 
                                      onClick={() => handleToggleEvent(ety)}
                                      className={`p-3 rounded-lg border-2 flex items-center gap-3 cursor-pointer transition-all ${isSelected ? 'bg-yellow-400/10 border-yellow-400/50 text-yellow-500' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                                  >
                                      <Radio className={`w-5 h-5 ${isSelected ? 'animate-pulse' : ''}`} />
                                      <span className="font-semibold text-sm capitalize">{ety.replace('-', ' ')}</span>
                                  </div>
                              )})}
                          </div>

                          <div className="bg-slate-800/50 rounded p-4 mt-8 flex gap-4 border border-slate-700/50">
                              <Settings2 className="w-8 h-8 text-yellow-400 shrink-0" />
                              <p className="text-xs text-slate-400">
                                  Communication templates will be automatically sourced from FEMA national standards for your selected events and populated entirely into your operational dashboard. You can alter these texts dynamically during live broadcasts via the Virtual AI Center.
                              </p>
                          </div>
                      </div>
                  )}

                </CardContent>
                
                <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center rounded-br-lg">
                    <Button 
                        variant="ghost" 
                        onClick={() => setStep(step - 1)}
                        disabled={step === 1 || loading}
                        className="text-slate-400 hover:text-white"
                    >
                        <ChevronLeft className="mr-2 h-4 w-4" /> Back Process
                    </Button>

                    <div className="flex gap-4">
                        {step < 3 ? (
                            <Button 
                                onClick={() => setStep(step + 1)}
                                className="bg-yellow-400 text-slate-900 hover:bg-yellow-500 font-bold px-8"
                            >
                                Next Configuration <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button 
                                onClick={handleSaveSetup}
                                disabled={loading}
                                className="bg-emerald-500 text-white hover:bg-emerald-600 font-bold px-8 shadow-lg shadow-emerald-500/20"
                            >
                                {loading ? 'Initializing Core Engine...' : 'Launch Operational EOC'} 
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </Card>
    </div>
  )
}
