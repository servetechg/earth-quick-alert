'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader2, Search } from 'lucide-react'

interface Suggestion {
    place_id: string
    display_name: string
    lat: string
    lon: string
}

interface LocationSearchInputProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
    inputClassName?: string
    /** Called with the full display name when user picks a suggestion */
    onSelect?: (displayName: string, lat: number, lng: number) => void
}

export function LocationSearchInput({
    value,
    onChange,
    placeholder = 'Search location...',
    className = '',
    inputClassName = '',
    onSelect,
}: LocationSearchInputProps) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchSuggestions = useCallback(async (query: string) => {
        if (query.trim().length < 2) {
            setSuggestions([])
            setIsOpen(false)
            return
        }
        setIsLoading(true)
        try {
            const res = await fetch(`/api/places?q=${encodeURIComponent(query)}`)
            if (!res.ok) throw new Error('Search failed')
            const data = await res.json()
            // data is an array of { place_id, display_name, lat, lon }
            if (Array.isArray(data) && data.length > 0) {
                setSuggestions(data.slice(0, 6))
                setIsOpen(true)
            } else {
                setSuggestions([])
                setIsOpen(false)
            }
        } catch {
            setSuggestions([])
            setIsOpen(false)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        onChange(newValue)

        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            fetchSuggestions(newValue)
        }, 400)
    }

    const handleSelect = (s: Suggestion) => {
        onChange(s.display_name)
        onSelect?.(s.display_name, parseFloat(s.lat), parseFloat(s.lon))
        setSuggestions([])
        setIsOpen(false)
    }

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    value={value}
                    onChange={handleInputChange}
                    onFocus={() => suggestions.length > 0 && setIsOpen(true)}
                    placeholder={placeholder}
                    autoComplete="off"
                    className={`w-full pl-10 pr-10 py-2 text-sm font-bold border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:outline-none transition-all bg-white ${inputClassName}`}
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[#33375D]" />
                )}
            </div>

            {isOpen && suggestions.length > 0 && (
                <ul className="absolute z-[200] w-full mt-1.5 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    {suggestions.map((s) => (
                        <li
                            key={s.place_id}
                            onMouseDown={() => handleSelect(s)}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0"
                        >
                            <MapPin className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                            <span className="text-xs font-bold text-slate-700 leading-snug">{s.display_name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
