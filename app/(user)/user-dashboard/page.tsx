'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, Users, Star, MapPin, Home, Briefcase, School,
  Cloud, AlertTriangle, ChevronRight, Hospital, Pill, Bed, Coffee, DollarSign, Car,
  Activity, Map, Pencil, MapPinOff, ShieldAlert, CheckCircle2, Package, Plus, Loader2,
  Twitter, Facebook, Instagram, Fuel
} from 'lucide-react'
import Link from 'next/link'
import { useGeolocation } from '@/lib/hooks/use-geolocation'
import { useSafety } from '@/lib/context/safety-context'
import { SafeCheckInModal } from '@/components/modals/safe-check-in-modal'
import { AddFavoritePlaceModal } from '@/components/modals/add-favorite-place-modal'
import { reverseGeocode } from '@/lib/services/mock-map-service'
import { cn } from '@/lib/utils'
import { weatherAPI } from '@/lib/services/weather-api'
import { alertProcessor } from '@/lib/services/alert-processor'
import { openaiService, type EmergencyInsights, type DynamicNews, type PreparednessTip } from '@/lib/services/openai-service'
import { fetchNearbyResources } from '@/lib/services/places-service'
import { type WeatherData, type EmergencyResource } from '@/lib/types/emergency'
import { AlertSource } from '@/lib/types/api-alerts'
import { Button } from '@/components/ui/button'

export default function UserDashboard() {
  const router = useRouter()
  const { location: geoLoc, loading: locLoading } = useGeolocation()
  const { verifyFamilySafety } = useSafety()

  const [isSafeCheckInOpen, setIsSafeCheckInOpen] = useState(false)
  const [geoLocName, setGeoLocName] = useState<string | null>(null)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [earthquakes, setEarthquakes] = useState<any[]>([])
  const [emergencyInsights, setEmergencyInsights] = useState<EmergencyInsights>({
    status: 'All Clear',
    message: 'Your personalized safety tools, alerts, and preparedness resources — all in one place.',
    recommendations: []
  })
  const [dynamicNews, setDynamicNews] = useState<DynamicNews[]>([])
  const [preparednessTips, setPreparednessTips] = useState<PreparednessTip[]>([])
  const [resources, setResources] = useState<EmergencyResource[]>([])
  const [favPlaces, setFavPlaces] = useState<any[]>([])
  const [supplyKit, setSupplyKit] = useState<any[]>([])
  const [isAddPlaceModalOpen, setIsAddPlaceModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newsFilter, setNewsFilter] = useState<'All' | 'Emergency' | 'Local' | 'Twitter' | 'Facebook' | 'Instagram'>('All')
  const [activeAlertTab, setActiveAlertTab] = useState('Weather')
  const [socialAlerts, setSocialAlerts] = useState<any[]>([])
  const [resourceAlerts, setResourceAlerts] = useState<any[]>([])

  useEffect(() => {
    verifyFamilySafety()
  }, [verifyFamilySafety])

  // Initial data fetch
  useEffect(() => {
    const initDashboard = async () => {
      if (locLoading || !geoLoc) return

      const { lat, lng } = geoLoc

      try {
        setLoading(true)

        // 1. Fetch Location Name
        const name = await reverseGeocode(lat, lng)
        setGeoLocName(name)

        // 2. Fetch Real-time Weather & Earthquake Data
        const [wData, eqAlerts, sAlerts, rAlerts] = await Promise.all([
          weatherAPI.fetchFullWeatherData(lat, lng),
          alertProcessor.fetchAllAlerts({ lat, lon: lng, city: name }, [AlertSource.EARTHQUAKE_API]),
          alertProcessor.fetchAllAlerts({ lat, lon: lng, city: name }, [AlertSource.SOCIAL_MEDIA]),
          alertProcessor.fetchAllAlerts({ lat, lon: lng, city: name }, [AlertSource.GAS_BUDDY, AlertSource.HOTEL_API])
        ])
  
        setWeatherData(wData)
        setEarthquakes(eqAlerts)
        setSocialAlerts(sAlerts)
        setResourceAlerts(rAlerts)

        // 3. Fetch Dynamic Content from OpenAI & Resources & Fav Places & Supply Kit
        const [insights, news, tips, nearbyHospitals, favRes, planRes] = await Promise.all([
          openaiService.generateEmergencyInsights(wData, eqAlerts),
          openaiService.generateDynamicNews(name || 'your area'),
          openaiService.generatePreparednessTips(name || 'your area', wData),
          fetchNearbyResources(lat, lng, 'hospital'),
          fetch('/api/user/favorite-places').then(res => res.json()).catch(() => ({ success: false })),
          fetch('/api/user/emergency-plan').then(res => res.json()).catch(() => ({ success: false }))
        ])

        if (insights) setEmergencyInsights(insights)
        if (news) setDynamicNews(news)
        if (tips) setPreparednessTips(tips)
        if (nearbyHospitals) setResources(nearbyHospitals)
        if (favRes?.success) setFavPlaces(favRes.data)
        if (planRes && !planRes.error) setSupplyKit(planRes.supplyKit || [])

      } catch (error) {
        console.error("Failed to initialize dynamic dashboard:", error)
      } finally {
        setLoading(false)
      }
    }

    initDashboard()
  }, [locLoading, geoLoc])

  const refreshFavPlaces = async () => {
    try {
      const res = await fetch('/api/user/favorite-places')
      const data = await res.json()
      if (data.success) {
        setFavPlaces(data.data)
      }
    } catch (error) {
      console.error("Failed to refresh favorite places:", error)
    }
  }

  const locations = [
    { id: 'current', name: 'Current Location', address: geoLocName || 'Resolving...', icon: MapPin, active: true },
    ...(favPlaces.map(place => ({
      id: place._id,
      name: place.name,
      address: place.address,
      icon: place.icon === 'Home' ? Home :
        place.icon === 'School' ? School :
          place.icon === 'Office' ? Briefcase :
            place.icon === 'Star' ? Star : MapPin,
      active: false
    })))
  ]

  const alertFilters = [
    { label: 'Weather', icon: Cloud, color: 'text-blue-500 bg-blue-50 border-blue-100', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-blue-100 hover:text-blue-400' },
    { label: 'Earthquakes', icon: Activity, color: 'text-purple-500 bg-purple-50 border-purple-100', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-purple-100 hover:text-purple-400' },
    { label: 'Twitter', icon: Twitter, color: 'text-slate-900 bg-slate-50 border-slate-200', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-slate-200 hover:text-slate-600' },
    { label: 'Facebook', icon: Facebook, color: 'text-blue-600 bg-blue-50 border-blue-100', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-blue-100 hover:text-blue-500' },
    { label: 'Instagram', icon: Instagram, color: 'text-pink-600 bg-pink-50 border-pink-100', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-pink-100 hover:text-pink-500' },
    { label: 'Fuel', icon: Fuel, color: 'text-orange-600 bg-orange-50 border-orange-100', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-orange-100 hover:text-orange-500' },
    { label: 'Lodging', icon: Bed, color: 'text-indigo-600 bg-indigo-50 border-indigo-100', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-indigo-100 hover:text-indigo-500' },
    { label: 'Emergency', icon: AlertTriangle, color: 'text-red-500 bg-red-50 border-red-100', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-red-100 hover:text-red-400' },
    { label: 'Community', icon: Users, color: 'text-green-500 bg-green-50 border-green-100', inactiveColor: 'text-gray-400 bg-white border-gray-100 hover:border-green-100 hover:text-green-400' },
  ]

  const nearbyResources = [
    { id: 'hospital', label: 'Hospitals', dist: resources.length > 0 ? `${resources[0].name} • Nearby` : '0.8 mi away', icon: Hospital, color: 'text-red-500 bg-red-50' },
    { id: 'pharmacy', label: 'Pharmacies', dist: '0.3 mi away', icon: Pill, color: 'text-green-500 bg-green-50' },
    { id: 'lodging', label: 'Lodging', dist: '1.2 mi away', icon: Bed, color: 'text-blue-500 bg-blue-50' },
    { id: 'food', label: 'Food & Essentials', dist: '0.5 mi away', icon: Coffee, color: 'text-orange-500 bg-orange-50' },
    { id: 'financial', label: 'Financial Services', dist: '0.4 mi away', icon: DollarSign, color: 'text-purple-500 bg-purple-50' },
    { id: 'traffic', label: 'Traffic Status', dist: 'Clear', icon: Car, color: 'text-yellow-500 bg-yellow-50' },
  ]

  const newsItems = dynamicNews.length > 0 ? dynamicNews : [
    { title: 'Highway 101 Closure This Weekend', category: 'Traffic', time: '2 hours ago', img: 'https://images.unsplash.com/photo-1510442650500-93217e634e4c?w=600&h=400&fit=crop' },
    { title: 'Free Health Screening Event', category: 'Community', time: '5 hours ago', img: 'https://images.unsplash.com/photo-1511673319455-2117e221146c?w=600&h=400&fit=crop' },
    { title: 'Emergency Drill Scheduled', category: 'Safety', time: '1 day ago', img: 'https://images.unsplash.com/photo-1541888946425-d81bb19440f4?w=600&h=400&fit=crop' },
  ] as DynamicNews[]

  const tipsList = preparednessTips.length > 0 ? preparednessTips : [
    { title: 'Active Shooter Preparedness', desc: 'Essential safety protocols' },
    { title: 'Severe Weather Tips', desc: 'Stay safe during storms' },
    { title: 'Wildfire Preparedness', desc: 'Evacuation planning' },
  ]

  const filteredNews = useMemo(() => {
    let baseNews = newsItems;
    if (newsFilter === 'Emergency') return baseNews.filter(news => news.category === 'Emergency' || news.category === 'Safety');
    if (newsFilter === 'Local') return baseNews.filter(news => news.category === 'Community' || news.category === 'Traffic');
    if (newsFilter === 'Twitter') return socialAlerts.filter(s => s.platform === 'X').map(s => ({ title: s.description, category: 'Twitter', time: 'Just now', img: '' }));
    if (newsFilter === 'Facebook') return socialAlerts.filter(s => s.platform === 'Facebook').map(s => ({ title: s.description, category: 'Facebook', time: 'Just now', img: '' }));
    if (newsFilter === 'Instagram') return socialAlerts.filter(s => s.platform === 'Instagram').map(s => ({ title: s.description, category: 'Instagram', time: 'Just now', img: '' }));
    return baseNews;
  }, [newsItems, newsFilter, socialAlerts]);

  return (
    <div className="flex-1 overflow-auto bg-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {!geoLoc && !locLoading && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shrink-0">
              <MapPinOff className="w-8 h-8" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-black text-red-900 mb-1">Location Access Required</h3>
              <p className="text-sm font-medium text-red-700 leading-relaxed">
                To provide real-time weather alerts and emergency insights for your area, please enable location services in your browser.
              </p>
            </div>
            <Button
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 h-12 rounded-xl shadow-lg shadow-red-100 shrink-0"
            >
              Retry Connection
            </Button>
          </div>
        )}

        {/* Banner Section */}
        {loading ? (
          <section className="relative overflow-hidden rounded-2xl h-[160px] flex items-center justify-center bg-slate-50 border border-slate-100 shadow-sm transition-colors duration-500">
            <Loader2 className="w-8 h-8 animate-spin text-[#33375D]" />
          </section>
        ) : (
          <section className={cn(
            "relative overflow-hidden rounded-2xl h-[160px] flex flex-col justify-center px-10 shadow-sm transition-colors duration-500",
            emergencyInsights.status === 'Emergency' ? "bg-gradient-to-r from-red-600 to-red-400" :
              emergencyInsights.status === 'Warning' ? "bg-gradient-to-r from-orange-500 to-orange-400" :
                "bg-gradient-to-r from-[#2196F3] to-[#42A5F5]"
          )}>
            <div className="relative z-10 max-w-2xl">
              <h1 className="text-3xl font-bold mb-2 text-white">Ready2Go – Stay Prepared & Protected</h1>
              <p className="text-blue-50 text-sm font-medium opacity-90">{emergencyInsights.message}</p>
            </div>
            <div className="absolute bottom-6 right-8 flex items-center gap-4">
              <div className={cn(
                "rounded-full px-4 py-1.5 flex items-center gap-2 shadow-sm border",
                emergencyInsights.status === 'Emergency' ? "bg-red-50 text-red-700 border-red-100" :
                  emergencyInsights.status === 'Warning' ? "bg-orange-50 text-orange-700 border-orange-100" :
                    "bg-[#E0F2F1] text-teal-700 border-teal-100"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  emergencyInsights.status === 'Emergency' ? "bg-red-500" :
                    emergencyInsights.status === 'Warning' ? "bg-orange-500" :
                      "bg-teal-500"
                )}></div>
                <span className="text-[11px] font-bold uppercase tracking-wider">{emergencyInsights.status}</span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] text-blue-100 font-semibold uppercase tracking-tight opacity-80">Last Updated</span>
                <span className="text-xs font-bold text-white tracking-tight">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </section>
        )}

        {/* Top 3 Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/active-shooter" className="block group border-l-4 border-l-[#F87171] bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-500">
                <Activity className="w-5 h-5" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-gray-900 mb-1">Active Shooter Response</h3>
              <p className="text-gray-500 text-[13px] leading-relaxed">Guided steps + direct 911 call with location sharing</p>
            </div>
          </Link>
          <Link href="/user/are-we-safe" className="block group border-l-4 border-l-[#34D399] bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-500">
                <Users className="w-5 h-5" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-gray-900 mb-1">"Are We Safe?" Check-In</h3>
              <p className="text-gray-500 text-[13px] leading-relaxed">Start check-in or view your group's safety status</p>
            </div>
          </Link>
          <Link href="/user/favorite-places" className="block group border-l-4 border-l-[#60A5FA] bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
                <Star className="w-5 h-5 fill-blue-500" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-gray-900 mb-1">Favorite Places</h3>
              <p className="text-gray-500 text-[13px] leading-relaxed">Quick access to school, daycare, meeting points</p>
            </div>
          </Link>
        </div>

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column */}
          <div className="lg:col-span-8 space-y-8">
            {/* My Locations & Alerts */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 pb-2 flex items-center justify-between">
                <h2 className="text-[17px] font-bold text-gray-900">My Locations & Alerts</h2>
                <button
                  onClick={() => setIsAddPlaceModalOpen(true)}
                  className="text-blue-500 text-xs font-bold flex items-center gap-1 hover:underline"
                >
                  + Add Location
                </button>
              </div>

              <div className="p-4 space-y-2.5">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-[#33375D]" />
                  </div>
                ) : (
                  <>
                    {locations.map((loc) => (
                      <div key={loc.id} className={cn(
                        "flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer group",
                        loc.active ? "bg-[#F0FDF4] border-green-200" : "bg-white border-gray-50 hover:border-gray-200"
                      )}>
                        <div className="flex items-center gap-4">
                          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border", loc.active ? "bg-white border-green-100 text-green-500" : "bg-slate-50 border-gray-100 text-slate-400")}>
                            <loc.icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-[14px] font-bold text-gray-900">{loc.name}</p>
                              {loc.active && (
                                <span className="bg-[#22C55E] text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Active</span>
                              )}
                            </div>
                            <p className="text-[12px] text-gray-500 font-medium line-clamp-1">{loc.address}</p>
                            {loc.active && <p className="text-[10px] text-gray-400 mt-1">GPS enabled • Real-time alerts active</p>}
                          </div>
                        </div>
                        <div>
                          {!loc.active && <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="p-6 pt-4 border-t border-slate-50">
                <h3 className="text-[11px] font-bold text-gray-400 mb-4 tracking-wider uppercase">Alerts Enabled For: {geoLocName || 'Detecting Location...'}</h3>
                <div className="flex flex-wrap gap-2.5 mb-6">
                  {alertFilters.map((filter) => (
                    <button
                      key={filter.label}
                      onClick={() => setActiveAlertTab(filter.label)}
                      className={cn(
                        "px-4 py-1.5 rounded-full flex items-center gap-2 text-[11px] font-bold border shadow-sm transition-all",
                        activeAlertTab === filter.label ? filter.color : filter.inactiveColor
                      )}
                    >
                      <filter.icon className="w-3.5 h-3.5" />
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {/* Alert Content */}
                  {activeAlertTab === 'Weather' && (
                    weatherData?.alerts && weatherData.alerts.length > 0 ? (
                      weatherData.alerts.map((alert, i) => (
                        <div key={i} className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl leading-snug hover:bg-blue-50 transition-colors">
                          <h4 className="text-[13px] font-bold text-blue-900 mb-1.5">{alert.headline}</h4>
                          <p className="text-[12px] text-blue-700/80 mb-2">{alert.description}</p>
                          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">{alert.severity}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No active weather alerts.</div>
                    )
                  )}

                  {activeAlertTab === 'Earthquakes' && (
                    earthquakes && earthquakes.length > 0 ? (
                      earthquakes.slice(0, 3).map((eq, i) => (
                        <div key={i} className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl leading-snug flex items-start gap-4 hover:bg-purple-50 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-black shrink-0 text-sm border border-purple-200 shadow-sm">
                            {(eq.magnitude || 0).toFixed(1)}
                          </div>
                          <div>
                            <h4 className="text-[13px] font-bold text-purple-900 mb-1">{eq.location || 'Unknown Location'}</h4>
                            <p className="text-[11px] font-medium text-purple-700/70">{new Date(eq.timestamp || eq.time).toLocaleString()}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No recent earthquakes in your area.</div>
                    )
                  )}

                  {activeAlertTab === 'Twitter' && (
                    socialAlerts.filter(s => s.platform === 'X').length > 0 ? (
                      socialAlerts.filter(s => s.platform === 'X').slice(0, 3).map((s, i) => (
                        <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl leading-snug hover:bg-slate-100 transition-colors">
                          <h4 className="text-[13px] font-bold text-slate-900 mb-1.5 line-clamp-2">{s.description}</h4>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white px-2 py-1 rounded border border-slate-100">@{s.author.toLowerCase().replace(' ', '_')}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No recent reports from Twitter (X) in your area.</div>
                    )
                  )}

                  {activeAlertTab === 'Facebook' && (
                    socialAlerts.filter(s => s.platform === 'Facebook').length > 0 ? (
                      socialAlerts.filter(s => s.platform === 'Facebook').slice(0, 3).map((s, i) => (
                        <div key={i} className="p-4 bg-blue-50 border border-blue-100 rounded-xl leading-snug hover:bg-blue-100/50 transition-colors">
                          <h4 className="text-[13px] font-bold text-blue-900 mb-1.5 line-clamp-2">{s.description}</h4>
                          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-white px-2 py-1 rounded border border-blue-100">{s.author}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No recent reports from Facebook in your area.</div>
                    )
                  )}

                  {activeAlertTab === 'Instagram' && (
                    socialAlerts.filter(s => s.platform === 'Instagram').length > 0 ? (
                      socialAlerts.filter(s => s.platform === 'Instagram').slice(0, 3).map((s, i) => (
                        <div key={i} className="p-4 bg-pink-50 border border-pink-100 rounded-xl leading-snug hover:bg-pink-100/50 transition-colors">
                          <h4 className="text-[13px] font-bold text-pink-900 mb-1.5 line-clamp-2">{s.description}</h4>
                          <span className="text-[10px] font-black text-pink-600 uppercase tracking-widest bg-white px-2 py-1 rounded border border-pink-100">@{s.author.toLowerCase().replace(' ', '_')}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No recent stories from Instagram in your area.</div>
                    )
                  )}

                  {activeAlertTab === 'Fuel' && (
                    resourceAlerts.filter(r => r.source === AlertSource.GAS_BUDDY).length > 0 ? (
                      resourceAlerts.filter(r => r.source === AlertSource.GAS_BUDDY).slice(0, 3).map((r, i) => (
                        <div key={i} className="p-4 bg-orange-50/50 border border-orange-100 rounded-xl leading-snug hover:bg-orange-50 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="text-[13px] font-bold text-orange-900">{r.title}</h4>
                            <span className={cn(
                              "text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest",
                              r.status === 'available' ? "bg-green-100 text-green-700" :
                              r.status === 'limited' ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                            )}>{r.status}</span>
                          </div>
                          <p className="text-[11px] text-orange-800/80 mb-2 font-medium">{r.description}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] font-bold text-orange-600">{r.subTitle}</span>
                            <span className="text-[9px] text-orange-400 font-medium">Updated just now</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No fuel reports available near you.</div>
                    )
                  )}

                  {activeAlertTab === 'Lodging' && (
                    resourceAlerts.filter(r => r.source === AlertSource.HOTEL_API).length > 0 ? (
                      resourceAlerts.filter(r => r.source === AlertSource.HOTEL_API).slice(0, 3).map((r, i) => (
                        <div key={i} className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl leading-snug hover:bg-indigo-50 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="text-[13px] font-bold text-indigo-900">{r.title}</h4>
                            <span className={cn(
                              "text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest",
                              r.status === 'available' ? "bg-green-100 text-green-700" :
                              r.status === 'limited' ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                            )}>{r.status}</span>
                          </div>
                          <p className="text-[11px] text-indigo-800/80 mb-2 font-medium">{r.description}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] font-bold text-indigo-600">{r.subTitle}</span>
                            <span className="text-[9px] text-indigo-400 font-medium">Updated just now</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No lodging availability reports near you.</div>
                    )
                  )}

                  {activeAlertTab === 'Emergency' && (
                    newsItems.filter(n => n.category === 'Emergency' || n.category === 'Safety').length > 0 ? (
                      newsItems.filter(n => n.category === 'Emergency' || n.category === 'Safety').slice(0, 3).map((news, i) => (
                        <div key={i} className="p-4 bg-red-50/50 border border-red-100 rounded-xl leading-snug hover:bg-red-50 transition-colors">
                          <h4 className="text-[13px] font-bold text-red-900 mb-2 line-clamp-2">{news.title}</h4>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-red-100">
                            <span className="text-[9px] font-black text-red-600 uppercase tracking-widest bg-red-100 px-2 py-1 rounded">{news.category}</span>
                            <span className="text-[10px] text-red-500 font-bold tracking-tight">{news.time}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No local emergency updates.</div>
                    )
                  )}

                  {activeAlertTab === 'Community' && (
                    newsItems.filter(n => n.category === 'Community' || n.category === 'Traffic').length > 0 ? (
                      newsItems.filter(n => n.category === 'Community' || n.category === 'Traffic').slice(0, 3).map((news, i) => (
                        <div key={i} className="p-4 bg-green-50/50 border border-green-100 rounded-xl leading-snug hover:bg-green-50 transition-colors">
                          <h4 className="text-[13px] font-bold text-green-900 mb-2 line-clamp-2">{news.title}</h4>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-green-100">
                            <span className="text-[9px] font-black text-green-700 uppercase tracking-widest bg-green-100 px-2 py-1 rounded">{news.category}</span>
                            <span className="text-[10px] text-green-600 font-bold tracking-tight">{news.time}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[12px] font-medium text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No local community updates.</div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Nearby Resources */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-6 md:p-10">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-[17px] font-bold text-gray-900 mb-1">Nearby Resources</h2>
                    <p className="text-[12px] text-gray-400 font-medium">Critical assistance nodes within your tactical perimeter</p>
                  </div>
                  <Link href="/user/resources" className="text-blue-500 text-xs font-bold hover:underline">
                    View Map
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-6 col-span-full">
                      <Loader2 className="w-6 h-6 animate-spin text-[#33375D]" />
                    </div>
                  ) : (
                    nearbyResources.map((res) => (
                      <Link
                        key={res.label}
                        href={`/user/resources?type=${res.id}`}
                        className="border border-gray-50 rounded-xl p-4 flex items-center gap-4 hover:border-blue-100 transition-colors cursor-pointer group bg-slate-50/30"
                      >
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shadow-sm", res.color)}>
                          <res.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-gray-900 group-hover:text-blue-600 transition-colors leading-tight mb-0.5">{res.label}</p>
                          <p className="text-[12px] text-gray-500 font-medium">{res.dist}</p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Sidebar) */}
          <div className="lg:col-span-4 space-y-8">
            {/* Weather Alerts */}
            <div className="bg-[#42A5F5] text-white rounded-[32px] shadow-lg p-8 overflow-hidden relative">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-[20px] font-bold">Weather Alerts</h2>
                <Cloud className="w-8 h-8 text-white/90" />
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              ) : (
                <>
                  <div className="mb-8">
                    <h1 className="text-6xl font-black mb-1">{weatherData?.current.temp || '72'}°F</h1>
                    <p className="text-[15px] font-semibold opacity-80 uppercase tracking-[0.2em]">{weatherData?.current.condition || 'Partly Cloudy'}</p>
                  </div>
                  <div className="bg-white/10 border border-white/20 rounded-2xl p-5 mb-8 backdrop-blur-md">
                    <h3 className="text-[14px] font-bold mb-1">
                      {weatherData?.alerts.length ? weatherData.alerts[0].headline : 'No Active Warnings'}
                    </h3>
                    <p className="text-[12px] opacity-90 leading-relaxed font-medium">
                      {weatherData?.alerts.length ? weatherData.alerts[0].description : 'Your area is clear of weather alerts.'}
                    </p>
                  </div>
                  <Link href="/user/weather" className="block w-full text-center bg-white text-blue-500 text-xs font-black py-4 rounded-xl hover:bg-white/95 transition-all shadow-md active:scale-95 tracking-widest uppercase">
                    View Full Forecast
                  </Link>
                </>
              )}
            </div>

            {/* Emergency Plan Builder */}
            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-8">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[17px] font-bold text-gray-900">Emergency Plan Builder</h2>
                <Link href="/user/emergency-plan?tab=kit" className="text-blue-500 text-[10px] font-black uppercase tracking-widest hover:underline">
                  View Full Plan
                </Link>
              </div>
              <p className="text-[12px] text-gray-400 mb-8 font-medium">Create and manage your family emergency plan</p>

              <div className="space-y-1 mb-8">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-[#33375D]" />
                  </div>
                ) : supplyKit.length > 0 ? (
                  supplyKit.slice(0, 4).map((item) => (
                    <Link
                      key={item._id || item.item}
                      href="/user/emergency-plan?tab=kit"
                      className="flex items-center justify-between py-3.5 cursor-pointer group border-b border-gray-50 last:border-0 hover:px-2 rounded-lg hover:bg-gray-50 transition-all font-bold"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-5 h-5 rounded-md border flex items-center justify-center transition-colors",
                          item.checked ? "bg-green-500 border-green-500" : "border-gray-200"
                        )}>
                          {item.checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <p className={cn(
                          "text-[14px] transition-colors",
                          item.checked ? "text-gray-400 line-through" : "text-gray-700"
                        )}>{item.item}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </Link>
                  ))
                ) : (
                  <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-[13px] text-gray-500 font-medium mb-4">Your supply kit is empty.</p>
                    <Link href="/user/emergency-plan?tab=kit" className="inline-flex items-center justify-center rounded-xl bg-[#33375D] px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-[#2B2F50]">
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Start Building Kit
                    </Link>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2.5 px-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Plan Completion</p>
                  <p className={cn(
                    "text-[11px] font-black",
                    supplyKit.length > 0 && Math.round((supplyKit.filter(i => i.checked).length / supplyKit.length) * 100) === 100 ? "text-green-500" : "text-orange-500"
                  )}>
                    {supplyKit.length > 0 ? Math.round((supplyKit.filter(i => i.checked).length / supplyKit.length) * 100) : 0}%
                  </p>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <div
                    className={cn(
                      "h-full transition-all duration-1000",
                      supplyKit.length > 0 && Math.round((supplyKit.filter(i => i.checked).length / supplyKit.length) * 100) === 100 ? "bg-green-500" : "bg-orange-500"
                    )}
                    style={{ width: `${supplyKit.length > 0 ? Math.round((supplyKit.filter(i => i.checked).length / supplyKit.length) * 100) : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Preparedness Info */}
            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-8">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Preparedness Info</h2>
              <div className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-[#33375D]" />
                  </div>
                ) : (
                  tipsList.map((info) => (
                    <div key={info.title} className="border border-gray-50 rounded-2xl p-5 hover:border-blue-100 transition-all cursor-pointer group bg-slate-50/20">
                      <h3 className="text-[13px] font-black text-slate-800 group-hover:text-blue-600 transition-colors mb-1 uppercase tracking-tight leading-tight">{info.title}</h3>
                      <p className="text-[11px] text-gray-400 font-medium">{info.desc}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* News & Updates Section */}
        <section className="pt-12 pb-20">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">News &amp; Updates</h2>
            <div className="flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
              <span
                onClick={() => setNewsFilter('All')}
                className={cn(
                  "px-6 py-2 font-extrabold text-[10px] rounded-lg shadow-sm cursor-pointer uppercase tracking-widest transition-colors",
                  newsFilter === 'All' ? "bg-blue-500 text-white" : "text-slate-400 hover:text-blue-500"
                )}
              >
                All
              </span>
              <span
                onClick={() => setNewsFilter('Emergency')}
                className={cn(
                  "px-6 py-2 font-extrabold text-[10px] rounded-lg shadow-sm cursor-pointer uppercase tracking-widest transition-colors",
                  newsFilter === 'Emergency' ? "bg-blue-500 text-white" : "text-slate-400 hover:text-blue-500"
                )}
              >
                Emergency
              </span>
              <span
                onClick={() => setNewsFilter('Local')}
                className={cn(
                  "px-6 py-2 font-extrabold text-[10px] rounded-lg shadow-sm cursor-pointer uppercase tracking-widest transition-colors",
                  newsFilter === 'Local' ? "bg-blue-500 text-white" : "text-slate-400 hover:text-blue-500"
                )}
              >
                Local
              </span>
              <span
                onClick={() => setNewsFilter('Twitter')}
                className={cn(
                  "px-6 py-2 font-extrabold text-[10px] rounded-lg shadow-sm cursor-pointer uppercase tracking-widest transition-colors",
                  newsFilter === 'Twitter' ? "bg-blue-500 text-white" : "text-slate-400 hover:text-blue-500"
                )}
              >
                Twitter
              </span>
              <span
                onClick={() => setNewsFilter('Facebook')}
                className={cn(
                  "px-6 py-2 font-extrabold text-[10px] rounded-lg shadow-sm cursor-pointer uppercase tracking-widest transition-colors",
                  newsFilter === 'Facebook' ? "bg-blue-500 text-white" : "text-slate-400 hover:text-blue-500"
                )}
              >
                Facebook
              </span>
              <span
                onClick={() => setNewsFilter('Instagram')}
                className={cn(
                  "px-6 py-2 font-extrabold text-[10px] rounded-lg shadow-sm cursor-pointer uppercase tracking-widest transition-colors",
                  newsFilter === 'Instagram' ? "bg-blue-500 text-white" : "text-slate-400 hover:text-blue-500"
                )}
              >
                Instagram
              </span>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#33375D]" />
            </div>
          ) : filteredNews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {filteredNews.map((news, i) => (
                <div key={i} className="bg-white border border-gray-50 rounded-2xl overflow-hidden shadow-sm group hover:shadow-xl transition-all cursor-pointer flex flex-col h-full hover:border-blue-100">
                  <div className="p-7 flex flex-col flex-1">
                    <div className="mb-4">
                      <span className={cn(
                        "px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest border",
                        news.category === 'Traffic' ? "bg-blue-50 text-blue-600 border-blue-100" :
                          news.category === 'Community' ? "bg-green-50 text-green-600 border-green-100" :
                            "bg-orange-50 text-orange-600 border-orange-100"
                      )}>
                        {news.category}
                      </span>
                    </div>
                    <h3 className="text-[17px] font-bold text-slate-800 mb-4 leading-tight group-hover:text-blue-600 transition-colors line-clamp-3">{news.title}</h3>
                    <div className="mt-auto pt-6 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{news.time}</span>
                      <ArrowRight className="w-4 h-4 text-slate-200 group-hover:text-blue-500 transition-all group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 font-medium text-sm">
              No news found for this category.
            </div>
          )}
        </section>

      </div>

      <SafeCheckInModal
        isOpen={isSafeCheckInOpen}
        onClose={() => setIsSafeCheckInOpen(false)}
      />

      <AddFavoritePlaceModal
        isOpen={isAddPlaceModalOpen}
        onClose={() => setIsAddPlaceModalOpen(false)}
        onSuccess={refreshFavPlaces}
      />
    </div>
  )
}
