'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
    THREAT_CARD_LAST_KEY,
    buildThreatCardCacheKey,
    loadCachedThreatRow,
    saveCachedThreatRow,
} from '@/lib/risk-assessment/client-report-cache'
import { LIVE_INPUT_KEYS } from '@/lib/services/risk-source-health'

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

/** Compact relative-ish timestamp for the "Updated …" hint. */
function formatUpdatedAt(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const diffMs = Date.now() - d.getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function overallLevelToRelevance(level: string): 'High' | 'Medium' | 'Low' {
    const u = (level || '').toUpperCase()
    if (u === 'CRITICAL' || u === 'SEVERE' || u === 'HIGH') return 'High'
    if (u === 'ELEVATED' || u === 'MODERATE') return 'Medium'
    return 'Low'
}

export function ThreatMonitoring({ locationName }: ThreatMonitoringProps) {
    // Restore the last saved card row for an instant, skeleton-free first paint.
    const [row, setRow] = useState<ThreatPanelRow | null>(() => loadCachedThreatRow(THREAT_CARD_LAST_KEY))
    const [loading, setLoading] = useState<boolean>(() => loadCachedThreatRow(THREAT_CARD_LAST_KEY) === null)
    const [error, setError] = useState<string | null>(null)
    const [affectedAreaLabel, setAffectedAreaLabel] = useState('United States')
    // When the displayed KPI data was computed (from /summary, refined by /analyze).
    const [updatedAt, setUpdatedAt] = useState<string | null>(null)
    // Manual "Refresh now" in progress (force re-pull). Separate from the first-paint skeleton.
    const [refreshing, setRefreshing] = useState(false)
    // Re-render tick so the relative "Updated …" label stays current without a new fetch.
    const [, setNowTick] = useState(0)
    const busyRef = useRef(false)
    const mountedRef = useRef(true)
    const retryRef = useRef(0)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Live-Input reachability: undefined = probing, true/false = result per source key.
    const [sourceHealth, setSourceHealth] = useState<Record<string, boolean>>({})

    // Progressive "one-by-one" reveal state for the AI metrics.
    const [revealCount, setRevealCount] = useState(0)
    const revealedOnceRef = useRef(false)

    // Whether we painted a cached row on mount (so we skip the deterministic Stage-1 overwrite).
    const hadCachedRowRef = useRef<boolean | null>(null)
    if (hadCachedRowRef.current === null) hadCachedRowRef.current = row !== null

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
            const loc = label.trim()

            // Super-admin dashboard passes selected sub-admin's US state here — show state, not country/city.
            if (roleFromStorage === 'super-admin' && loc && loc !== 'USA' && loc !== 'Current Location') {
                if (!cancelled) setAffectedAreaLabel(loc)
                return
            }

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

            // Final fallback. This card only renders on the nationwide super-admin/admin
            // dashboard, so when no specific state/city resolves the actual scope is the whole
            // country — never a vague "Regional scope".
            const fallbackLabel =
                label !== 'Current Location' && label !== 'USA' ? label : 'United States'
            if (!cancelled) setAffectedAreaLabel(fallbackLabel)
        }

        resolveAffectedArea()
        return () => {
            cancelled = true
        }
    }, [label])

    // Reconcile the restored row to the resolved scope: prefer the scoped entry, else fix the label.
    useEffect(() => {
        const scoped = loadCachedThreatRow(buildThreatCardCacheKey(affectedAreaLabel))
        if (scoped) {
            setRow(scoped)
            setLoading(false)
        } else {
            setRow((prev) => (prev ? { ...prev, affectedAreas: affectedAreaLabel } : prev))
        }
    }, [affectedAreaLabel])

    // Defer live-input probes until after the threat KPI row loads so summary isn't competing.
    useEffect(() => {
        let cancelled = false
        let deferTimer: ReturnType<typeof setTimeout> | null = null
        let retryTimer: ReturnType<typeof setTimeout> | null = null

        const applySources = (sources: { key: string; ok: boolean }[]) => {
            if (cancelled) return
            const next: Record<string, boolean> = {}
            for (const s of sources) {
                if (s?.key) next[s.key] = Boolean(s.ok)
            }
            if (Object.keys(next).length > 0) {
                setSourceHealth((prev) => ({ ...prev, ...next }))
            }
        }

        const probeAll = async (force = false) => {
            try {
                const qs = force ? '?refresh=1' : ''
                const res = await fetch(`/api/risk-assessment/source-health${qs}`, {
                    credentials: 'same-origin',
                })
                if (!res.ok || cancelled) return null
                const json = await res.json().catch(() => ({}))
                const sources: { key: string; ok: boolean }[] = Array.isArray(json?.sources)
                    ? json.sources
                    : []
                applySources(sources)
                return sources
            } catch {
                return null
            }
        }

        const startProbes = () => {
            void (async () => {
                const sources = await probeAll(false)
                if (cancelled || !sources) return
                const anyDown = sources.some((s) => !s.ok)
                if (anyDown) {
                    retryTimer = setTimeout(() => {
                        void probeAll(true)
                    }, 8_000)
                }
            })()
        }

        deferTimer = setTimeout(startProbes, row ? 0 : 1500)

        return () => {
            cancelled = true
            if (deferTimer !== null) clearTimeout(deferTimer)
            if (retryTimer !== null) clearTimeout(retryTimer)
        }
    }, [row])

    // Reveal the four AI metrics sequentially the first time data arrives; instant on later refines.
    useEffect(() => {
        if (!row) {
            setRevealCount(0)
            revealedOnceRef.current = false
            return
        }
        if (revealedOnceRef.current) {
            setRevealCount(4)
            return
        }
        revealedOnceRef.current = true
        setRevealCount(4)
    }, [row])

    // Single fast fetch: deterministic KPIs from the DB-backed /summary endpoint. The card
    // intentionally does NOT call the heavy /analyze (8 live feeds + AI) — its KPIs are aligned
    // to /summary, so /analyze adds latency without changing what's shown. A timeout guards
    // against a slow/unreachable server so the card never spins indefinitely.
    // opts.force = "Refresh now" → bypass the server cache. opts.silent = background poll.
    const runAssessment = useCallback(
        async (opts?: { force?: boolean; silent?: boolean }) => {
            const force = opts?.force === true
            const silent = opts?.silent === true
            if (busyRef.current) return // don't stack overlapping runs (poll vs manual)
            busyRef.current = true
            if (force) {
                retryRef.current = 0 // manual refresh resets the backoff counter
                if (retryTimerRef.current !== null) {
                    clearTimeout(retryTimerRef.current)
                    retryTimerRef.current = null
                }
            }

            const hasRestored = hadCachedRowRef.current === true
            if (!silent) setError(null)
            if (force) setRefreshing(true)
            else if (!hasRestored && !silent) setLoading(true)

            const alive = () => mountedRef.current
            const ctrl = new AbortController()
            const timeout = setTimeout(() => ctrl.abort(), 8000)

            try {
                const sumUrl = force
                    ? '/api/risk-assessment/summary?lite=1&refresh=1'
                    : '/api/risk-assessment/summary?lite=1'
                const sumRes = await fetch(sumUrl, { credentials: 'same-origin', signal: ctrl.signal }).catch(() => null)
                if (sumRes && sumRes.ok) {
                    const sumJson = await sumRes.json().catch(() => ({}))
                    if (alive() && sumJson) {
                        const newRow: ThreatPanelRow = {
                            relevance: overallLevelToRelevance(sumJson.overall_risk_level || 'NOMINAL'),
                            severity: (sumJson.overall_risk_level || 'NOMINAL').toUpperCase(),
                            affectedAreas: affectedAreaLabel,
                            confidence: typeof sumJson.ai_confidence === 'number' ? sumJson.ai_confidence : 0,
                        }
                        retryRef.current = 0 // reset retry counter on success
                        setRow(newRow)
                        setUpdatedAt(typeof sumJson.generated_at === 'string' ? sumJson.generated_at : new Date().toISOString())
                        // Cache immediately so the next visit paints instantly (no skeleton).
                        saveCachedThreatRow(buildThreatCardCacheKey(affectedAreaLabel), newRow)
                    }
                } else {
                    // Request failed (refused, timed out, or 5xx). Retry up to 3 times with
                    // exponential back-off (2 s → 4 s → 8 s) before showing the error.
                    const MAX_RETRIES = 3
                    const RETRY_DELAYS = [2000, 4000, 8000]
                    if (alive() && retryRef.current < MAX_RETRIES) {
                        const delay = RETRY_DELAYS[retryRef.current] ?? 8000
                        retryRef.current += 1
                        retryTimerRef.current = setTimeout(() => {
                            busyRef.current = false // allow the retry run
                            void runAssessment({ silent: true })
                        }, delay)
                    } else if (alive() && !hasRestored && !silent) {
                        // Retries exhausted and nothing cached — surface the error.
                        setError('Service temporarily unavailable')
                    }
                }
            } catch (err) {
                console.error('Threat monitoring — summary:', err)
            } finally {
                clearTimeout(timeout)
                busyRef.current = false
                if (alive()) {
                    setLoading(false)
                    setRefreshing(false)
                }
            }
        },
        [affectedAreaLabel],
    )

    // Initial load + whenever the resolved scope changes.
    useEffect(() => {
        void runAssessment()
    }, [runAssessment])

    // Auto-refresh in the background every 90s (aligned with the server SWR fresh window).
    useEffect(() => {
        const id = setInterval(() => void runAssessment({ silent: true }), 90_000)
        return () => clearInterval(id)
    }, [runAssessment])

    // Keep the relative "Updated …" label ticking without issuing a new fetch.
    useEffect(() => {
        const id = setInterval(() => setNowTick((n) => n + 1), 30_000)
        return () => clearInterval(id)
    }, [])

    // Mark unmounted so in-flight fetches don't set state after teardown.
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
        }
    }, [])

    const LIVE_INPUT_LABELS: Record<string, string> = {
        nws: 'NWS flood & hydro alerts',
        hydro: 'NOAA NWPS gauges · USGS hydrology',
        eq: 'USGS earthquake feed',
        firms: 'NASA FIRMS thermal activity',
        fema: 'FEMA OpenFEMA declarations',
    }
    const liveInputs = LIVE_INPUT_KEYS.map((key) => ({ key, label: LIVE_INPUT_LABELS[key] ?? key }))

    return (
        <Card className="bg-white border-slate-200 rounded-3xl p-8 shadow-sm space-y-8 min-h-[600px] flex flex-col">
            <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Threat Detection & Monitoring</h2>
            </div>

            <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Live Inputs</h3>
                <div className="space-y-3">
                    {liveInputs.map((input) => {
                        const status = sourceHealth[input.key] // undefined = still probing
                        const ok = status === true
                        const down = status === false
                        return (
                            <div key={input.key} className="flex items-center gap-3">
                                {down ? (
                                    <AlertCircle className="shrink-0 text-rose-400" size={18} />
                                ) : (
                                    <CheckCircle2
                                        className={cn(
                                            'shrink-0 transition-colors duration-300',
                                            ok ? 'text-emerald-500' : 'text-slate-200 animate-pulse',
                                        )}
                                        size={18}
                                    />
                                )}
                                <span
                                    className={cn(
                                        'text-sm font-bold transition-colors duration-300',
                                        ok ? 'text-slate-600' : down ? 'text-rose-400' : 'text-slate-300',
                                    )}
                                >
                                    {input.label}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="space-y-6 pt-6 border-t border-slate-100 flex-1">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">AI Assessment</h3>
                    <div className="flex items-center gap-2">
                        {updatedAt && !loading && !refreshing && (
                            <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">
                                Updated {formatUpdatedAt(updatedAt)}
                            </span>
                        )}
                        {loading && <Loader2 className="animate-spin text-[#33375D]" size={16} />}
                        <button
                            type="button"
                            onClick={() => void runAssessment({ force: true })}
                            disabled={loading || refreshing}
                            title="Refresh now"
                            aria-label="Refresh now"
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-tight transition-colors',
                                loading || refreshing
                                    ? 'text-slate-400 cursor-not-allowed'
                                    : 'text-[#33375D] hover:bg-slate-100',
                            )}
                        >
                            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
                            {refreshing ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
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
                            {!row || revealCount <= 0 ? (
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
                            {!row || revealCount <= 1 ? (
                                <Skeleton className="h-6 w-40 bg-slate-50" />
                            ) : (
                                <p className="text-lg font-black text-[#33375D] uppercase">{row?.severity || 'NOMINAL'}</p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                Affected Areas
                            </p>
                            {!row || revealCount <= 2 ? (
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
                                {!row || revealCount <= 3 ? (
                                    <Skeleton className="h-6 w-12 bg-slate-50" />
                                ) : (
                                    <p className="text-lg font-black text-emerald-500">{row?.confidence ?? 0}%</p>
                                )}
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-emerald-500 h-full rounded-full transition-all duration-1000"
                                    style={{ width: `${row && revealCount > 3 ? (row?.confidence ?? 0) : 0}%` }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    )
}
