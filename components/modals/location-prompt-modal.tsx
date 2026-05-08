'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MapPin, Navigation, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface LocationPromptModalProps {
    isOpen: boolean
    onSave: (location: string) => void
}

interface PlaceSuggestion {
    display_name: string
    place_id: string
    lat: string
    lon: string
    address: {
        name?: string
        city?: string
        state?: string
        country?: string
    }
}

export function LocationPromptModal({ isOpen, onSave }: LocationPromptModalProps) {
    const [location, setLocation] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
    const [suggestionsLoading, setSuggestionsLoading] = useState(false)
    const [showSuggestions, setShowSuggestions] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchSuggestions = async (query: string) => {
        if (!query || query.length < 2) {
            setSuggestions([])
            setShowSuggestions(false)
            return
        }

        setSuggestionsLoading(true)
        try {
            // Use our backend /api/places route which calls Photon API
            const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`)
            if (!response.ok) throw new Error('Failed to fetch suggestions')
            const data: PlaceSuggestion[] = await response.json()
            setSuggestions(Array.isArray(data) ? data : [])
            setShowSuggestions(Array.isArray(data) && data.length > 0)
        } catch (err) {
            console.error('Autocomplete error:', err)
            setSuggestions([])
        } finally {
            setSuggestionsLoading(false)
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setLocation(value)
        setShowSuggestions(false)

        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchSuggestions(value), 350)
    }

    const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
        setLocation(suggestion.display_name)
        setSuggestions([])
        setShowSuggestions(false)
    }

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!location.trim()) {
            setError('Please enter a location')
            return
        }

        setLoading(true)
        setError('')

        try {
            const response = await fetch('/api/user/update-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location }),
            })

            const data = await response.json()

            if (response.ok) {
                localStorage.setItem('userLocation', location)
                onSave(location)
            } else {
                setError(data.error || 'Failed to save location')
            }
        } catch (err) {
            setError('An error occurred. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
            <Card className="w-full max-w-md p-8 bg-white rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-300 border-none">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
                        <MapPin className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Set Your Location</h2>
                    <p className="text-slate-500 font-medium">To provide you with accurate emergency alerts and weather updates, please tell us your current city or area.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">
                            City or Area
                        </label>
                        <div className="relative" ref={containerRef}>
                            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none">
                                {suggestionsLoading
                                    ? <Loader2 size={18} className="animate-spin text-[#33375D]" />
                                    : <Navigation size={18} />
                                }
                            </div>
                            <input
                                type="text"
                                value={location}
                                onChange={handleInputChange}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                placeholder="Search for a city or area..."
                                className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all font-medium"
                                required
                                autoComplete="off"
                            />

                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                    {suggestions.map((s) => (
                                        <button
                                            key={s.place_id}
                                            type="button"
                                            className="w-full text-left px-5 py-3.5 hover:bg-blue-50 flex items-start gap-3 border-b border-slate-100 last:border-0 cursor-pointer transition-colors"
                                            onMouseDown={(e) => {
                                                e.preventDefault()
                                                handleSelectSuggestion(s)
                                            }}
                                        >
                                            <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                            <div>
                                                <div className="font-semibold text-sm text-slate-800">
                                                    {s.address?.name || s.address?.city || s.display_name.split(',')[0]}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {[s.address?.city, s.address?.state, s.address?.country].filter(Boolean).join(', ')}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-xl flex items-start gap-3">
                        <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 font-medium leading-relaxed">
                            Your location is used only for real-time safety monitoring and is never shared publicly.
                        </p>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-xl text-red-700 text-sm font-bold">
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#34385E] hover:bg-[#2A2D4A] text-white font-black py-7 rounded-2xl shadow-xl shadow-blue-900/10 transition-all active:scale-[0.98] text-lg uppercase tracking-widest"
                    >
                        {loading ? 'Saving Location...' : 'Access Dashboard'}
                    </Button>
                </form>
            </Card>
        </div>
    )
}
