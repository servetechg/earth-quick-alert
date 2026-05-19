'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertCircle, Building2, FileText, Shield, Users } from 'lucide-react'
import type { PublicOfficialSummaryPayload } from '@/lib/services/responder/types'

export function PublicOfficialDashboardSection() {
  const [data, setData] = useState<PublicOfficialSummaryPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/responder/public-official')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (e) {
        console.error('Failed to load public official data', e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return <div className="p-8 animate-pulse text-slate-500">Loading executive summary...</div>
  }

  if (!data) {
    return <div className="p-8 text-red-500">Failed to load data.</div>
  }

  const getEocLevelColor = (level: string) => {
    if (level.includes('1')) return 'text-red-600'
    if (level.includes('2')) return 'text-orange-600'
    if (level.includes('3')) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getEocLevelLabel = (level: string) => {
    if (level.includes('1')) return 'Level 1'
    if (level.includes('2')) return 'Level 2'
    if (level.includes('3')) return 'Level 3'
    return 'Level 4'
  }

  const getBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'resolved':
        return 'bg-green-100 text-green-700 border-green-200'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Public Official Dashboard</h2>
          <p className="text-sm text-slate-500 font-medium">Read-only overview of jurisdiction emergency status</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center justify-between">
              EOC Status
              <Building2 className="w-4 h-4 text-slate-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-black tracking-tighter ${getEocLevelColor(data.eoc.level)}`}>
              {getEocLevelLabel(data.eoc.level)}
            </div>
            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">{data.eoc.operatingCondition}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center justify-between">
              Active Orders
              <AlertCircle className="w-4 h-4 text-red-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black tracking-tighter text-red-600">
              {data.declarations.filter((d) => d.status === 'active').length}
            </div>
            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">EMERGENCY DECLARATIONS</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center justify-between">
              Personnel Active
              <Users className="w-4 h-4 text-slate-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black tracking-tighter text-[#33375D]">
              {data.eoc.personnelActive}
            </div>
            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">ACROSS JURISDICTION</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center justify-between">
              Jurisdiction
              <Shield className="w-4 h-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-black tracking-tighter text-blue-600 mt-2 line-clamp-1">
              {data.jurisdictionName}
            </div>
            <p className="text-xs font-bold text-slate-500 mt-2 uppercase tracking-wider">OVERSIGHT AREA</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-800">Executive Summary</CardTitle>
              <p className="text-sm text-slate-500 font-medium">
                Source: {data.source.toUpperCase()} · Last updated {new Date(data.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <FileText className="w-4 h-4" />
              View Only
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[300px]">
            <div className="p-6">
              {data.executiveNotes && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
                  <span className="font-bold block mb-1">Executive Notes:</span>
                  {data.executiveNotes}
                </div>
              )}
              
              <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase mb-4">Emergency Declarations & Orders</h3>
              <div className="space-y-4">
                {data.declarations.map((decl) => (
                  <div key={decl.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-bold text-slate-900">{decl.title}</h4>
                        <Badge variant="outline" className={`font-bold uppercase tracking-wider text-[10px] ${getBadgeColor(decl.status)}`}>
                          {decl.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500">
                        {decl.jurisdiction} · Issued: {new Date(decl.issuedAt).toLocaleDateString()}
                      </p>
                      {decl.notes && (
                        <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-2 rounded-md">{decl.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
                {data.declarations.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    No active emergency declarations found.
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
