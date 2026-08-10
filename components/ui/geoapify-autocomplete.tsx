'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader2, Search } from 'lucide-react'

export interface GeoapifyPlace {
  place_id: string
  formatted: string
  city: string
  state: string
  country: string
  zipcode: string
  lat: number
  lng: number
}

interface GeoapifyAutocompleteProps {
  placeholder?: string
  className?: string
  inputClassName?: string
  onSelect: (place: GeoapifyPlace) => void
  initialValue?: string
}

export function GeoapifyAutocomplete({
  placeholder = 'Search for your city, zip code, or address...',
  className = '',
  inputClassName = '',
  onSelect,
  initialValue = '',
}: GeoapifyAutocompleteProps) {
  const [query, setQuery] = useState(initialValue)
  const [suggestions, setSuggestions] = useState<GeoapifyPlace[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close suggestion popup
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)

    try {
      // 1. Try fetching via API route
      let res = await fetch(`/api/places/autocomplete?text=${encodeURIComponent(text.trim())}`)
      
      let data: any = null
      if (res.ok) {
        data = await res.json()
      }

      let items: GeoapifyPlace[] = data?.results || []

      // 2. Client-side direct fallback if API route returned no results
      if (items.length === 0) {
        const apiKey =
          process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || '9abe9caf7f5943d189e9ef564c5cdec7'
        const directUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
          text.trim(),
        )}&apiKey=${apiKey}`
        
        const directRes = await fetch(directUrl)
        if (directRes.ok) {
          const directData = await directRes.json()
          if (directData?.features) {
            items = directData.features.map((feature: any) => {
              const p = feature.properties || {}
              const coords = feature.geometry?.coordinates || [0, 0]
              return {
                place_id: p.place_id || `${p.lat}_${p.lon}`,
                formatted: p.formatted || '',
                city: p.city || p.town || p.village || p.county || p.name || '',
                state: p.state || p.region || '',
                country: p.country || '',
                zipcode: p.postcode || '',
                lat: Number(p.lat ?? coords[1] ?? 0),
                lng: Number(p.lon ?? coords[0] ?? 0),
              }
            })
          }
        }
      }

      if (items.length > 0) {
        setSuggestions(items.slice(0, 6))
        setIsOpen(true)
      } else {
        setSuggestions([])
        setIsOpen(false)
      }
    } catch (err) {
      console.error('Geoapify search failed:', err)
      setSuggestions([])
      setIsOpen(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(val)
    }, 300)
  }

  const handleSelectSuggestion = (place: GeoapifyPlace) => {
    setQuery(place.formatted)
    setSuggestions([])
    setIsOpen(false)
    onSelect(place)
  }

  return (
    <div ref={containerRef} className={`relative w-full z-50 ${className}`}>
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-11 pr-10 py-4 bg-white border border-slate-200 shadow-sm rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] transition-all text-[#33375D] placeholder:text-slate-300 font-medium ${inputClassName}`}
        />
        {isLoading && (
          <Loader2 className="absolute right-4 w-4 h-4 animate-spin text-[#33375D]" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-[9999] w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">

          {suggestions.map((item) => (
            <li
              key={item.place_id}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelectSuggestion(item)
              }}
              className="flex items-start gap-3 px-4 py-3 hover:bg-[#33375D]/5 cursor-pointer transition-colors border-b border-slate-100 last:border-0"
            >
              <MapPin className="w-4 h-4 text-[#33375D] mt-1 shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 leading-snug">
                  {item.formatted}
                </span>
                {(item.city || item.state || item.country) && (
                  <span className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    {[item.city, item.state, item.country].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
