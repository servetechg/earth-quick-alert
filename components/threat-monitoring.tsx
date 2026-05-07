'use client'

import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { RiskReport } from '@/lib/types/risk-assessment'

/** UI row derived from the same `RiskReport` as AI Risk Assessment (`/api/risk-assessment/analyze`). */
interface ThreatPanelRow {
    relevance: 'High' | 'Medium' | 'Low'
    severity: string
    affectedAreas: string
    confidence: number
}

interface ThreatMonitoringProps {
    lat?: number
    lon?: number
    locationName?: string
}

function overallLevelToRelevance(level: string): 'High' | 'Medium' | 'Low' {
    const u = (level || '').toUpperCase()
    if (u === 'CRITICAL' || u === 'SEVERE' || u === 'HIGH') return 'High'
    if (u === 'ELEVATED' || u === 'MODERATE') return 'Medium'
    return 'Low'
}

function reportToPanelRow(report: RiskReport, locationLabel: string): ThreatPanelRow {
    return {
        relevance: overallLevelToRelevance(report.overall_risk_level),
        severity: (report.overall_risk_level || 'NOMINAL').toUpperCase(),
        affectedAreas: locationLabel,
        confidence: typeof report.ai_confidence === 'number' ? report.ai_confidence : 0,
    }
}

export function ThreatMonitoring({ locationName }: ThreatMonitoringProps) {
    const [loading, setLoading] = useState(true)
    const [row, setRow] = useState<ThreatPanelRow | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [affectedAreaLabel, setAffectedAreaLabel] = useState('Regional scope')

    const label = locationName || 'Current Location'

    useEffect(() => {
        let cancelled = false

        async function resolveAffectedArea() {
            const roleFromStorage =
                typeof window !== 'undefined' ? (localStorage.getItem('userRole') || '').toLowerCase() : ''
            const cityFromStorage =
                typeof window !== 'undefined' ? (localStorage.getItem('userCity') || '').trim() : ''
            const countryFromStorage =
                typeof window !== 'undefined' ? (localStorage.getItem('userCountry') || '').trim() : ''

            // Use localStorage first (set at login) for immediate rendering.
            if (roleFromStorage === 'super-admin' && countryFromStorage) {
                if (!cancelled) setAffectedAreaLabel(countryFromStorage)
                return
            }
            if (roleFromStorage === 'sub-admin' && cityFromStorage) {
                if (!cancelled) setAffectedAreaLabel(cityFromStorage)
                return
            }

            // Fallback to server truth if storage is stale/missing.
            try {
                const profileRes = await fetch('/api/user/profile', { credentials: 'same-origin' })
                if (profileRes.ok) {
                    const profile = await profileRes.json().catch(() => ({}))
                    const role = String(profile?.user?.role || '').toLowerCase()
                    const city = String(profile?.user?.city || '').trim()
                    const country = String(profile?.user?.country || '').trim()
                    if (role === 'super-admin' && country) {
                        if (!cancelled) setAffectedAreaLabel(country)
                        return
                    }
                    if (role === 'sub-admin' && city) {
                        if (!cancelled) setAffectedAreaLabel(city)
                        return
                    }
                }
            } catch {
                // Continue to generic fallback.
            }

            try {
                if (!cancelled) setAffectedAreaLabel(label === 'USA' ? 'USA' : label !== 'Current Location' ? label : 'Regional scope')
            } catch {
                if (!cancelled) setAffectedAreaLabel('Regional scope')
            }
        }

        resolveAffectedArea()
        return () => {
            cancelled = true
        }
    }, [label])

    useEffect(() => {
        let cancelled = false

        async function fetchDashboardAssessment() {
            setLoading(true)
            setError(null)
            try {
                const response = await fetch('/api/risk-assessment/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    /** Matches AI Risk Assessment page: nationwide dashboard ingest when body is empty. */
                    body: JSON.stringify({}),
                })
                const json = await response.json().catch(() => ({}))

                if (!response.ok) {
                    const msg =
                        response.status === 401
                            ? 'Sign in required'
                            : (json?.error || json?.message || `Request failed (${response.status})`)
                    throw new Error(typeof msg === 'string' ? msg : 'Failed to load assessment')
                }
                if (!json?.report) {
                    throw new Error('Invalid response: missing report')
                }
                if (!cancelled) setRow(reportToPanelRow(json.report as RiskReport, affectedAreaLabel))
            } catch (err) {
                console.error('Threat monitoring — risk assessment:', err)
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Service temporarily unavailable')
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchDashboardAssessment()
        return () => {
            cancelled = true
        }
    }, [affectedAreaLabel, label])

    const liveInputs = [
        'NWS flood & hydro alerts',
        'NOAA NWPS gauges · USGS hydrology',
        'USGS earthquake feed',
        'NASA FIRMS thermal activity',
        'FEMA OpenFEMA declarations',
    ]

    return (
        <Card className="bg-white border-slate-200 rounded-3xl p-8 shadow-sm space-y-8 min-h-[600px] flex flex-col">
            <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Threat Detection & Monitoring</h2>
            </div>

            <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Live Inputs</h3>
                <div className="space-y-3">
                    {liveInputs.map((input, index) => (
                        <div key={index} className="flex items-center gap-3">
                            <CheckCircle2
                                className={cn('shrink-0', loading ? 'text-slate-200 animate-pulse' : 'text-emerald-500')}
                                size={18}
                            />
                            <span className={cn('text-sm font-bold', loading ? 'text-slate-300' : 'text-slate-600')}>
                                {input}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-6 pt-6 border-t border-slate-100 flex-1">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">AI Assessment</h3>
                    {loading && <Loader2 className="animate-spin text-blue-500" size={16} />}
                </div>

                {error ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                        <AlertCircle className="text-rose-400" size={32} />
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{error}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        <div className="space-y-1">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                Geo-relevance
                            </p>
                            {loading ? (
                                <Skeleton className="h-6 w-16 bg-slate-50" />
                            ) : (
                                <p
                                    className={cn(
                                        'text-lg font-black',
                                        row?.relevance === 'High'
                                            ? 'text-rose-600'
                                            : row?.relevance === 'Medium'
                                              ? 'text-amber-600'
                                              : 'text-emerald-600',
                                    )}
                                >
                                    {row?.relevance || 'Low'}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                Severity Level
                            </p>
                            {loading ? (
                                <Skeleton className="h-6 w-40 bg-slate-50" />
                            ) : (
                                <p className="text-lg font-black text-blue-500 uppercase">{row?.severity || 'NOMINAL'}</p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                Affected Areas
                            </p>
                            {loading ? (
                                <Skeleton className="h-6 w-32 bg-slate-50" />
                            ) : (
                                <p className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-snug">
                                    {row?.affectedAreas || 'None'}
                                </p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                    Confidence Score
                                </p>
                                {loading ? (
                                    <Skeleton className="h-6 w-12 bg-slate-50" />
                                ) : (
                                    <p className="text-lg font-black text-emerald-500">{row?.confidence ?? 0}%</p>
                                )}
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-emerald-500 h-full rounded-full transition-all duration-1000"
                                    style={{ width: `${loading ? 0 : (row?.confidence ?? 0)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    )
}
