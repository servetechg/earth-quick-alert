'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Building2, FileText, Shield, Users } from 'lucide-react'
import type { PublicOfficialSummaryPayload } from '@/lib/services/responder/types'
import { RESPONDER_PANEL_CARD, RESPONDER_STAT_CARD } from '@/components/responder/responder-panel-styles'

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
      {/* Dashboard Header Removed (handled by parent page) */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">EOC Level</h3>
            <Building2 className="text-[#33375D]" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className={`text-5xl font-black tracking-tighter tabular-nums ${getEocLevelColor(data.eoc.level)}`}>
              {data.eoc.level.replace('level-', '').split('-')[0]}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 min-w-0 flex-shrink">
              {data.eoc.level.includes('partial') ? 'PARTIAL · ' : ''}{data.eoc.operatingCondition}
            </span>
          </div>
        </Card>

        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Personnel Active</h3>
            <Users className="text-blue-500" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-[#33375D] tabular-nums">
              {data.eoc.personnelActive.toLocaleString()}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">In Jurisdiction</span>
          </div>
        </Card>

        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Active Orders</h3>
            <AlertCircle className="text-red-500" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-red-600 tabular-nums">
              {data.declarations.filter((d) => d.status === 'active').length}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Declarations</span>
          </div>
        </Card>

        <Card className={RESPONDER_STAT_CARD}>
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-lg font-bold leading-tight text-slate-900">Pending Orders</h3>
            <Shield className="text-orange-500" size={18} aria-hidden />
          </div>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-5xl font-black tracking-tighter text-orange-600 tabular-nums">
              {data.declarations.filter((d) => d.status === 'pending').length}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Awaiting Review</span>
          </div>
        </Card>
      </div>

      <Card className={RESPONDER_PANEL_CARD}>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-0">
          <div>
            <CardTitle>{data.jurisdictionName} Executive Summary</CardTitle>
            <CardDescription>
              Source: {data.source.toUpperCase()} · Last updated {new Date(data.updatedAt).toLocaleString()}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <FileText className="w-4 h-4" />
            View Only
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-4 pt-4">
            <div className="px-4">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Emergency Declarations & Orders</h4>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[560px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 border-y border-slate-100">
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Title
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Jurisdiction
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Issued At
                    </th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.declarations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                        No active emergency declarations found.
                      </td>
                    </tr>
                  ) : (
                    data.declarations.map((decl) => (
                      <tr key={decl.id} className="group hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-5 font-medium text-slate-900">{decl.title}</td>
                        <td className="px-6 py-5">
                          <Badge variant="outline" className={`font-bold uppercase tracking-wider text-[10px] ${getBadgeColor(decl.status)}`}>
                            {decl.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-5 text-slate-700">{decl.jurisdiction}</td>
                        <td className="px-6 py-5 text-slate-600">{new Date(decl.issuedAt).toLocaleDateString()}</td>
                        <td className="px-6 py-5 text-slate-600 max-w-[200px] truncate">{decl.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
