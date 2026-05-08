'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import {
  Cloud,
  CloudRain,
  Sun,
  Wind,
  Droplets,
  AlertTriangle,
  CloudLightning,
  CloudSnow,
  Navigation,
  Loader2,
  Eye
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGeolocation } from '@/lib/hooks/use-geolocation'
import { weatherAPI } from '@/lib/services/weather-api'
import { geocodeAddress } from '@/lib/services/mock-map-service'
import { WeatherData } from '@/lib/types/emergency'

export default function WeatherPage() {
  const { location, error: geolocError, errorCode: geolocErrorCode, loading: geolocLoading } = useGeolocation()
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [city, setCity] = useState<string>('Detecting location...')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!location) {
        if (geolocLoading) return

        const savedLocation = typeof window !== 'undefined' ? localStorage.getItem('userLocation') : null
        if (savedLocation) {
          try {
            setIsLoading(true)
            setError(null)
            setCity(savedLocation)

            const coords = await geocodeAddress(savedLocation)
            const data = await weatherAPI.fetchFullWeatherData(coords.lat, coords.lng)
            setWeatherData(data)
            setIsLoading(false)
            return
          } catch (savedLocErr) {
            console.error('Saved-location weather fetch error:', savedLocErr)
          }
        }

        if (!geolocLoading && geolocError) {
          if (geolocErrorCode === 1) {
            setError('Location access denied. Please enable location for accurate weather.')
          } else {
            setError('Unable to detect your location. Please try again.')
          }
          setIsLoading(false)
        }
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        // 1. Fetch Location Name
        const geoRes = await fetch(`/api/reverse-geocode?lat=${location.lat}&lng=${location.lng}`)
        const geoData = await geoRes.json()
        if (geoData.name) {
          setCity(geoData.name)
          localStorage.setItem('userLocation', geoData.name)
        } else {
          setCity('Unknown Location')
        }

        // 2. Fetch Weather Data
        const data = await weatherAPI.fetchFullWeatherData(location.lat, location.lng)
        setWeatherData(data)
      } catch (err) {
        console.error('Weather fetch error:', err)
        setError('Failed to sync environmental data.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [location, geolocLoading, geolocError, geolocErrorCode])

  const IconMap = {
    'sun': Sun,
    'cloud': Cloud,
    'cloud-rain': CloudRain,
    'cloud-lightning': CloudLightning,
    'cloud-snow': CloudSnow,
  }

  const getWeatherIcon = (iconName: string) => {
    const Icon = IconMap[iconName as keyof typeof IconMap] || Cloud
    return <Icon className="w-full h-full" />
  }

  if (isLoading || geolocLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <Loader2 className="h-12 w-12 animate-spin text-[#33375D]" />
        <p className="font-black italic text-slate-400 uppercase tracking-widest animate-pulse">Synchronizing Atmosphere...</p>
      </div>
    )
  }

  if (error || !weatherData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <div className="p-4 bg-red-50 rounded-2xl border border-red-100 mb-4">
          <AlertTriangle className="w-12 h-12 text-red-500" />
        </div>
        <h2 className="text-2xl font-black italic text-slate-900 uppercase tracking-widest">Signal Failure</h2>
        <p className="text-slate-500 font-bold max-w-md">{error || 'Could not establish weather uplink.'}</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white pb-24">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        <header className="space-y-4">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Weather & Alerts</h1>
          <p className="text-slate-500 text-lg">Current conditions and forecast for your area</p>
        </header>

        {/* Current Weather Card */}
        <Card className="p-12 border-none rounded-[1.5rem] bg-gradient-to-r from-blue-500 to-blue-400 text-white shadow-xl relative overflow-hidden group">
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="space-y-1">
                <p className="text-blue-100 font-medium text-lg">{city}</p>
                <h2 className="text-8xl font-bold tracking-tighter">{weatherData.current.temp}°F</h2>
                <p className="text-2xl font-medium text-blue-50">{weatherData.current.condition}</p>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-2">
                  <Wind className="w-5 h-5 text-blue-200" />
                  <span className="text-sm font-medium">{weatherData.current.windSpeed} mph</span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-blue-200" />
                  <span className="text-sm font-medium">{weatherData.current.humidity}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-200" />
                  <span className="text-sm font-medium">{weatherData.current.visibility} mi</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center md:justify-end">
              <div className="w-48 h-48 text-white/90 group-hover:scale-110 transition-transform duration-700">
                {getWeatherIcon(weatherData.current.icon)}
              </div>
            </div>
          </div>
        </Card>

        {/* Advisory Section */}
        {weatherData.alerts.length > 0 ? (
          <div className="p-6 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-4">
            <div className="p-2 bg-white rounded-lg border border-amber-100 shadow-sm shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-amber-900 font-bold mb-1">{weatherData.alerts[0].type} Advisory</h3>
              <p className="text-amber-800 text-sm leading-relaxed">{weatherData.alerts[0].description}</p>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-4">
            <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm shrink-0">
              <Navigation className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-slate-900 font-bold mb-1">Clear Skies</h3>
              <p className="text-slate-600 text-sm">No active weather advisories for your current location.</p>
            </div>
          </div>
        )}

        {/* Forecast Section */}
        <div className="space-y-8">
          <h2 className="text-2xl font-bold text-slate-900">4-Day Forecast</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {weatherData.forecast.slice(0, 4).map((day, i) => (
              <Card key={i} className="p-8 border border-slate-100 rounded-[1.5rem] bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col items-center text-center">
                <p className="text-slate-900 font-bold mb-6">
                  {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(day.date)}
                </p>

                <div className="w-16 h-16 text-blue-500 mb-6">
                  {getWeatherIcon(day.icon)}
                </div>

                <p className="text-slate-500 text-sm mb-6">{day.condition}</p>

                <div className="flex items-center justify-between w-full mb-6 px-2">
                  <span className="text-2xl font-bold text-slate-900">{day.high}°</span>
                  <span className="text-lg font-medium text-slate-400">{day.low}°</span>
                </div>

                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                  {day.precipitation}% rain
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
