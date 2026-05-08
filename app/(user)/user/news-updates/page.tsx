'use client'

import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Search,
  Newspaper,
  ExternalLink,
  Clock,
  User,
  Tag,
  ChevronRight,
  Shield,
  TrendingUp,
  Globe,
  Share2,
  RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSocialSignals } from '@/lib/hooks/use-api-alerts'

export default function NewsPage() {
  const [activeCategory, setActiveCategory] = useState('All')
  const { alerts: socialSignals, loading: socialLoading } = useSocialSignals()

  const categories = ['All', 'Safety', 'Weather', 'Official', 'Community']

  const newsItems = [
    {
      id: 1,
      title: 'City Earthquake Preparedness Drill Scheduled for Next Tuesday',
      category: 'Official',
      time: '2 hours ago',
      author: 'City Safety Dept',
      description: 'The city-wide drill will focus on high-rise evacuation protocols and emergency communication networks. Residents are encouraged to participate...',
      image: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&q=80&w=800'
    },
    {
      id: 2,
      title: 'New Weather Satellite Deployment Improves Local Forecasting Accuracy',
      category: 'Weather',
      time: '5 hours ago',
      author: 'Meteorology Bureau',
      description: 'The GOES-R series satellite has begun transmitting high-resolution data, providing minute-by-minute updates on cloud formation and thermal patterns...',
      image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800'
    },
    {
      id: 3,
      title: 'Community Response Teams Complete Advanced First Aid Training',
      category: 'Community',
      time: '1 day ago',
      author: 'Red Cross',
      description: 'Over 50 volunteers from the local area have successfully finished their intensive trauma response certification, bolstering our internal resilience...',
      image: 'https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&q=80&w=800'
    }
  ]

  const filteredNews = activeCategory === 'All'
    ? newsItems
    : newsItems.filter(item => item.category === activeCategory)

  return (
    <main className="min-h-screen bg-slate-50/50 pb-24">
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                <Newspaper className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-4xl font-black italic tracking-tighter text-slate-900 uppercase">News & Intelligence</h1>
            </div>
            <p className="text-slate-500 font-bold max-w-md">Critical updates and vetted information for your zone.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search intel..."
              className="h-12 pl-12 rounded-2xl border-none shadow-sm bg-white font-bold text-slate-900 placeholder:text-slate-300 focus-visible:ring-indigo-500 transition-all font-bold"
            />
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? 'default' : 'ghost'}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "h-10 rounded-full px-6 text-[11px] font-black uppercase tracking-widest transition-all",
                activeCategory === cat
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100"
                  : "text-slate-400 hover:text-indigo-600 hover:bg-white"
              )}
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-8 space-y-8">
            {filteredNews.map((item) => (
              <Card key={item.id} className="group border-none shadow-xl shadow-slate-100 rounded-[2.5rem] bg-white overflow-hidden flex flex-col md:flex-row hover:shadow-2xl transition-all duration-500">
                <div className="md:w-64 h-64 md:h-auto relative overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute top-4 left-4">
                    <Badge className="bg-indigo-600/90 text-white border-none py-1.5 px-4 rounded-xl text-[9px] font-black uppercase tracking-[0.1em] backdrop-blur-md">
                      {item.category}
                    </Badge>
                  </div>
                </div>
                <div className="flex-1 p-8 flex flex-col">
                  <div className="flex items-center gap-4 mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {item.time}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> {item.author}
                    </div>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight group-hover:text-indigo-600 transition-colors uppercase leading-[0.9]">
                    {item.title}
                  </h3>
                  <p className="text-slate-500 font-bold text-sm leading-relaxed mb-8 flex-1">
                    {item.description}
                  </p>
                  <Button variant="ghost" className="w-fit p-0 h-auto hover:bg-transparent group/btn">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 group-hover/btn:mr-2 transition-all">Read Protocol</span>
                    <ChevronRight className="w-4 h-4 text-indigo-600" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <aside className="md:col-span-4 space-y-8">
            <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-[#34385E] text-white">
              <h3 className="text-xl font-black uppercase tracking-tight mb-8 flex items-center gap-3 italic">
                <Share2 className="w-6 h-6 text-indigo-400" /> Viral Intel
              </h3>
              <div className="space-y-6">
                {socialLoading ? (
                  <div className="flex items-center gap-3 opacity-50">
                    <RefreshCw className="h-4 w-4 animate-spin text-[#33375D]" />
                    <span className="text-[10px] font-black uppercase">Scanning Signals...</span>
                  </div>
                ) : socialSignals.length === 0 ? (
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">No viral signals detected</p>
                ) : (
                  socialSignals.slice(0, 4).map((alert: any) => (
                    <div key={alert.id} className="group cursor-pointer">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest italic">@{alert.author?.toLowerCase().replace(' ', '_') || 'anonymous'}</p>
                        <Badge className="bg-white/10 text-white border-none py-0 px-2 rounded-md text-[7px] font-black uppercase">
                          {alert.platform || 'Social'}
                        </Badge>
                      </div>
                      <p className="font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-2 leading-tight uppercase font-black tracking-tight text-xs">{alert.description}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-8 border-none shadow-xl shadow-slate-100 rounded-[2.5rem] bg-white">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <Globe className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Global Sensors</h3>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black uppercase text-green-600 block mb-1">System Nominal</span>
                  <p className="font-bold text-slate-900 text-sm">All seismic nodes reporting normal frequency.</p>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  )
}
