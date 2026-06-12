'use client'

import { useEffect, useState } from 'react'
import { Loader2, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { IncidentDetailResponse } from '@/app/api/risk-assessment/incident-details/route'
import type { IncidentPastContext } from '@/app/api/risk-assessment/incident-details/route'
import type { EventGroupSummary } from '@/lib/types/risk-assessment'
import { SOURCE_LABEL_MAP } from '@/lib/types/risk-assessment'
import type { IncidentDetailNarrative } from '@/lib/services/openai-service'
import { normalizeAiBullet, dropAbsenceSentences } from '@/lib/utils/normalize-ai-text'
import { renderEmphasis } from '@/lib/utils/render-emphasis'

type IncidentNarrativeBundle = {
  narrative: IncidentDetailNarrative
  pastContext: IncidentPastContext | null
}

const incidentGroupsCache = new Map<string, { data: IncidentDetailResponse; expiresAt: number }>()
const incidentNarrativeCache = new Map<
  string,
  { data: IncidentNarrativeBundle; expiresAt: number }
>()

function groupMemberKey(memberIds: string[]): string {
  return memberIds.slice().sort().join(',')
}

async function fetchGroupNarrativeBundle(memberIds: string[]): Promise<IncidentNarrativeBundle | null> {
  const cacheKey = groupMemberKey(memberIds)
  const cached = incidentNarrativeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const res = await fetch('/api/risk-assessment/incident-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventIds: memberIds }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? err.error ?? 'Failed to load incident summary')
  }
  const data = (await res.json()) as IncidentDetailResponse
  if (!data.narrative) return null

  const bundle: IncidentNarrativeBundle = {
    narrative: data.narrative,
    pastContext: data.pastContext ?? null,
  }
  incidentNarrativeCache.set(cacheKey, { data: bundle, expiresAt: Date.now() + 10 * 60 * 1000 })
  return bundle
}

function EventChipStrip({ group }: { group: EventGroupSummary }) {
  const src = SOURCE_LABEL_MAP[group.source] ?? {
    label: group.source,
    tone: 'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
      <span className={`rounded px-1.5 py-0.5 border ${src.tone}`}>{src.label}</span>
      {group.state && (
        <span className="rounded px-1.5 py-0.5 border bg-slate-50 text-slate-700 border-slate-200">
          {group.state}
        </span>
      )}
      {group.affectedCounties.length === 1 ? (
        <span className="text-slate-500 font-normal">{group.affectedCounties[0]}</span>
      ) : group.affectedCounties.length > 1 ? (
        <span
          className="rounded px-1.5 py-0.5 border bg-emerald-50 text-emerald-700 border-emerald-200"
          title={group.affectedCounties.join(', ')}
        >
          {group.affectedCounties.length <= 3
            ? `covers ${group.affectedCounties.join(', ')}`
            : `${group.affectedCounties.length} counties`}
        </span>
      ) : null}
    </div>
  )
}

function DetailSection({ title, body }: { title: string; body: unknown }) {
  const cleaned = dropAbsenceSentences(normalizeAiBullet(body))
  if (!cleaned) return null
  const paragraphs = cleaned.split(/\n+/).map((p) => p.trim()).filter(Boolean)
  return (
    <div>
      <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">{title}</h4>
      <div className="space-y-2">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="text-sm leading-relaxed text-slate-700">
            {renderEmphasis(paragraph)}
          </p>
        ))}
      </div>
    </div>
  )
}

function DetailBulletSection({ title, items }: { title: string; items?: string[] }) {
  const cleaned = (items ?? []).map((s) => s?.trim()).filter(Boolean) as string[]
  if (cleaned.length === 0) return null
  return (
    <div>
      <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">{title}</h4>
      <ul className="space-y-1.5">
        {cleaned.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            <span>{renderEmphasis(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GroupAccordionItem({
  group,
  isOpen,
  onToggle,
  groupIndex,
  totalGroups,
  narrativeBundle,
  summaryLoading,
  summaryError,
}: {
  group: EventGroupSummary
  isOpen: boolean
  onToggle: () => void
  groupIndex: number
  totalGroups: number
  narrativeBundle?: IncidentNarrativeBundle | null
  summaryLoading?: boolean
  summaryError?: string | null
}) {
  const narrative = narrativeBundle?.narrative ?? null
  const pastContext = narrativeBundle?.pastContext ?? null
  const src = SOURCE_LABEL_MAP[group.source] ?? {
    label: group.source,
    tone: 'bg-slate-50 text-slate-700 border-slate-200',
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge variant="outline" className={`text-[10px] font-bold ${src.tone}`}>
              {src.label}
            </Badge>
            {group.state && (
              <Badge variant="outline" className="text-[10px] font-bold">
                {group.state}
              </Badge>
            )}
            <span className="text-[10px] text-slate-400 font-normal">
              Incident {groupIndex + 1} of {totalGroups}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-800 truncate">{group.name}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {group.primaryLocation} · {group.formattedTimestamp}
          </p>
        </div>
        <div className="shrink-0 mt-1">
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">
          <EventChipStrip group={group} />

          {summaryLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating in-depth summary…
            </div>
          )}

          {summaryError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {summaryError}
            </div>
          )}

          {narrative && (
            <div className="space-y-4">
              <DetailSection title="Overview" body={narrative.overview} />
              <DetailSection title="Current Status" body={narrative.currentStatus} />
              <DetailSection title="Affected Areas" body={narrative.affectedAreas} />
              <DetailSection title="Key Statistics" body={narrative.keyStatistics} />
              {narrative.pathSegments && narrative.pathSegments.length > 0 && (
                <DetailBulletSection title="Tornado Path Segments" items={narrative.pathSegments} />
              )}
              {narrative.historicalContext && (
                <DetailSection title="Historical Context" body={narrative.historicalContext} />
              )}

              {pastContext &&
                (pastContext.matchedEvent ||
                  (pastContext.pastDamages?.length ?? 0) > 0 ||
                  (pastContext.pastProcedures?.length ?? 0) > 0) && (
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    {pastContext.matchedEvent && (
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500">
                            Closest Past Incident
                          </h4>
                          {typeof pastContext.matchConfidence === 'number' && (
                            <span className="text-[10px] font-bold text-slate-400">
                              {pastContext.matchConfidence}% match
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700">
                          {renderEmphasis(pastContext.matchedEvent)}
                        </p>
                        {pastContext.similaritySummary && (
                          <p className="text-[13px] leading-relaxed text-slate-600 mt-1">
                            {renderEmphasis(pastContext.similaritySummary)}
                          </p>
                        )}
                      </div>
                    )}
                    <DetailBulletSection title="Past Damages / Losses" items={pastContext.pastDamages} />
                    <DetailBulletSection title="Past Procedures" items={pastContext.pastProcedures} />
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export type IncidentDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventIds: string[]
  bulletText: string
}

/** AI incident summary dialog — same UX as AI Risk Assessment “Learn more”. */
export function IncidentDetailDialog({
  open,
  onOpenChange,
  eventIds,
  bulletText,
}: IncidentDetailDialogProps) {
  const [groups, setGroups] = useState<EventGroupSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [narrativeBundles, setNarrativeBundles] = useState<Map<string, IncidentNarrativeBundle>>(
    new Map(),
  )
  const [summariesLoading, setSummariesLoading] = useState(false)
  const [summariesError, setSummariesError] = useState<string | null>(null)
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open || eventIds.length === 0) return
    const cacheKey = eventIds.slice().sort().join(',')
    const cached = incidentGroupsCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      setGroups(cached.data.groups)
      setOpenGroupKey(cached.data.groups[0]?.memberIds.slice().sort().join(',') ?? null)
      return
    }
    setLoading(true)
    setError(null)
    setGroups([])
    fetch('/api/risk-assessment/incident-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventIds, groupsOnly: true }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? 'Failed to load')
        return r.json() as Promise<IncidentDetailResponse>
      })
      .then((d) => {
        incidentGroupsCache.set(cacheKey, { data: d, expiresAt: Date.now() + 10 * 60 * 1000 })
        setGroups(d.groups)
        setOpenGroupKey(d.groups[0]?.memberIds.slice().sort().join(',') ?? null)
      })
      .catch((e: Error) => setError(e.message ?? 'Failed to load incident groups'))
      .finally(() => setLoading(false))
  }, [open, eventIds])

  useEffect(() => {
    if (!open || groups.length === 0) return

    let cancelled = false
    setSummariesLoading(true)
    setSummariesError(null)
    setNarrativeBundles(new Map())

    Promise.all(
      groups.map(async (g) => {
        const key = groupMemberKey(g.memberIds)
        const bundle = await fetchGroupNarrativeBundle(g.memberIds)
        return { key, bundle }
      }),
    )
      .then((results) => {
        if (cancelled) return
        const map = new Map<string, IncidentNarrativeBundle>()
        for (const { key, bundle } of results) {
          if (bundle) map.set(key, bundle)
        }
        setNarrativeBundles(map)
        if (map.size !== groups.length) {
          setSummariesError('Some incident summaries could not be generated.')
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setSummariesError(e.message ?? 'Failed to generate incident summaries.')
      })
      .finally(() => {
        if (!cancelled) setSummariesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, groups])

  useEffect(() => {
    if (!open) {
      setOpenGroupKey(null)
      setGroups([])
      setError(null)
      setNarrativeBundles(new Map())
      setSummariesLoading(false)
      setSummariesError(null)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#33375D]" />
            Incident Details
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
              {renderEmphasis(bulletText)}
            </p>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
            <p className="mt-2 text-sm text-slate-500">Loading incidents…</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-2">
            {groups.map((g) => {
              const key = groupMemberKey(g.memberIds)
              const bundle = narrativeBundles.get(key)
              return (
                <GroupAccordionItem
                  key={key}
                  group={g}
                  isOpen={openGroupKey === key}
                  onToggle={() => setOpenGroupKey(openGroupKey === key ? null : key)}
                  groupIndex={groups.indexOf(g)}
                  totalGroups={groups.length}
                  narrativeBundle={bundle}
                  summaryLoading={summariesLoading && !bundle}
                  summaryError={summariesError && !bundle ? summariesError : null}
                />
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
