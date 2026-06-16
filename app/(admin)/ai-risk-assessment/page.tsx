'use client'

import {
  useEffect, useMemo, useState, useCallback,
  Fragment, type ElementType, type ReactNode
} from "react";
import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminPageLoader } from "@/components/admin-page-loader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useUser } from "@/lib/store/user-store";
import { getRiskAnalyzeContextFromBrowser } from "@/lib/risk-assessment/client-analyze-context";
import {
  buildAiRiskReportCacheKey,
  clearCachedAiRiskReport,
  loadCachedAiRiskReport,
  saveCachedAiRiskReport,
} from "@/lib/risk-assessment/client-report-cache";
import {
  Sparkles, ShieldAlert, FileDown, Loader2, Mail,
  Activity, Users, AlertTriangle, Gauge, CheckCircle2,
  History, TrendingDown, ClipboardList, Radio, Lightbulb,
  RefreshCw, MapPin, ChevronDown, ChevronUp, BookOpen, Check, Eye, Building2,
} from "lucide-react";
import jsPDF from "jspdf";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
  RiskSummaryPayload, SeverityBucket, HistoricalTabPayload,
  RecommendationItem, HistoricalAnalysis, EventGroupSummary, BulletWithRefs,
} from "@/lib/types/risk-assessment";
import { SOURCE_LABEL_MAP } from "@/lib/types/risk-assessment";
import { normalizeAiBullet, dropAbsenceSentences } from "@/lib/utils/normalize-ai-text";
import { renderEmphasis } from "@/lib/utils/render-emphasis";
import type { IncidentDetailResponse } from "@/app/api/risk-assessment/incident-details/route";
import { CRITICAL_INFRASTRUCTURE_SECTORS } from "@/lib/gis/critical-infrastructure-sectors";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHART_COLORS = ["#ef4444", "#f59e0b", "#eab308", "#3b82f6", "#10b981", "#8b5cf6"];

const overallTone = (level: string) => {
  switch (level) {
    case "SEVERE": case "CRITICAL": return "bg-red-500 text-white hover:bg-red-600";
    case "HIGH": return "bg-amber-500 text-white hover:bg-amber-600";
    case "ELEVATED": return "bg-yellow-500 text-white hover:bg-yellow-600";
    case "MODERATE": return "bg-[#33375D] text-white hover:bg-[#2B2F50]";
    default: return "bg-emerald-500 text-white hover:bg-emerald-600";
  }
};

const severityTone = (sev: string) => {
  switch (sev) {
    case "Extreme": return "border-red-500/30 bg-red-50/60";
    case "High": return "border-amber-500/30 bg-amber-50/60";
    case "Moderate": return "border-yellow-500/30 bg-yellow-50/60";
    default: return "border-emerald-500/30 bg-emerald-50/60";
  }
};

const severityPill = (sev: string) => {
  switch (sev) {
    case "Extreme": return "bg-red-500/10 text-red-600 border-red-500/20";
    case "High": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "Moderate": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    default: return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  }
};

const priorityMeta = (p: string) => {
  if (p === "IMMEDIATE") return { ring: "border-l-red-500", pill: "bg-red-500/10 text-red-500 border-red-500/20", icon: AlertTriangle, label: "Immediate" };
  if (p === "URGENT") return { ring: "border-l-amber-500", pill: "bg-amber-500/10 text-amber-500 border-amber-500/20", icon: ShieldAlert, label: "Urgent" };
  return { ring: "border-l-yellow-500", pill: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: CheckCircle2, label: "Standard" };
};

function humanizeCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripEmphasis(text: string): string {
  return text.replace(/\*/g, "");
}

function dedupeConsecutive(xs: string[]): string[] {
  return xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
}

// ─── EventChipStrip ───────────────────────────────────────────────────────────

function EventChipStrip({ group }: { group: EventGroupSummary }) {
  const src = SOURCE_LABEL_MAP[group.source] ?? { label: group.source, tone: 'bg-slate-50 text-slate-700 border-slate-200' };
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
      <span className={`rounded px-1.5 py-0.5 border ${src.tone}`}>{src.label}</span>
      {group.state && (
        <span className="rounded px-1.5 py-0.5 border bg-slate-50 text-slate-700 border-slate-200">{group.state}</span>
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
            : `covers ${group.affectedCounties.slice(0, 2).join(', ')} +${group.affectedCounties.length - 2} more`}
        </span>
      ) : null}
      {group.hasCoordinates && (
        <span className="text-slate-400" title={`${group.lat?.toFixed(2)}, ${group.lng?.toFixed(2)}`}>
          <MapPin className="inline h-3 w-3" />
        </span>
      )}
      {group.duplicateCount > 1 && group.source === 'fema' ? (
        <span className="text-slate-400 font-normal">
          one declaration · {group.duplicateCount} county records
        </span>
      ) : group.duplicateCount > 1 ? (
        <span className="text-slate-400 font-normal">
          + {group.duplicateCount - 1} re-ingested record(s)
        </span>
      ) : null}
      <span className="text-slate-400 font-normal">· {group.formattedTimestamp}</span>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function CircularConfidence({ value }: { value: number }) {
  const r = 24, c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 60 60" className="h-16 w-16 -rotate-90">
        <circle cx="30" cy="30" r={r} stroke="#f1f5f9" strokeWidth="6" fill="none" />
        <circle cx="30" cy="30" r={r} stroke="#33375D" strokeWidth="6" fill="none"
          strokeDasharray={c} strokeDashoffset={c - (value / 100) * c}
          strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-slate-800">{value}%</div>
    </div>
  );
}

function KpiCard({
  label,
  icon: Icon,
  children,
  headerAction,
}: {
  label: string;
  icon: ElementType;
  children: ReactNode;
  headerAction?: ReactNode;
}) {
  return (
    <Card className="rounded-2xl bg-white p-5 shadow-xl shadow-slate-200/50 border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
        <div className="flex items-center gap-1 shrink-0">
          {headerAction}
          <Icon className="h-4 w-4 text-slate-400" />
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function HistoryBulletList({ items, accent = "primary" }: { items?: string[]; accent?: "primary" | "red" | "amber" | "success" }) {
  const dot = accent === "red" ? "bg-red-500" : accent === "amber" ? "bg-amber-500" : accent === "success" ? "bg-emerald-500" : "bg-[#33375D]";
  if (!items?.length) return <p className="text-xs italic text-slate-400">No data available.</p>;
  return (
    <ul className="space-y-2.5">
      {dedupeConsecutive(items).map((b, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="min-w-0">{renderEmphasis(b)}</span>
        </li>
      ))}
    </ul>
  );
}

function HistoricalQuadrant({ icon: Icon, title, subtitle, items, accent, iconBg, emptyMsg }: {
  icon: ElementType; title: string; subtitle: string;
  items?: string[]; accent: "primary" | "red" | "amber" | "success";
  iconBg: string; emptyMsg?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold tracking-tight text-slate-800">{title}</h4>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4">
        {items?.length
          ? <HistoryBulletList items={items} accent={accent} />
          : <p className="text-xs italic text-slate-400">{emptyMsg ?? "No data available."}</p>
        }
      </div>
    </div>
  );
}

function HistoricalAnalysisBody({
  data, hasSimilarPast, recommendationsList,
}: {
  data?: HistoricalAnalysis;
  hasSimilarPast: boolean;
  recommendationsList?: RecommendationItem[];
}) {
  const h = data ?? {};
  const conf = h.match_confidence ?? 0;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Badge variant="outline" className="text-[10px] font-bold uppercase bg-blue-50 text-blue-600 border-blue-100">
          Match Confidence {conf}%
        </Badge>
      </div>
      <div className="mb-5 rounded-xl border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Matched Event</p>
        <p className="mt-1 text-lg font-extrabold tracking-tight text-slate-800">
          {h.matched_event
            ? renderEmphasis(h.matched_event)
            : hasSimilarPast
              ? "Analyzing past events…"
              : "No comparable past events found."}
        </p>
        {h.similarity_summary && (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{renderEmphasis(h.similarity_summary)}</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <HistoricalQuadrant
          icon={TrendingDown} title="Past Damages & Losses" subtitle="What it cost last time"
          items={hasSimilarPast ? h.past_damages : undefined} accent="red"
          iconBg="bg-red-50 text-red-500"
          emptyMsg={hasSimilarPast ? "No data available." : "No comparable past events found in our records for this hazard profile. Past damage estimates are not available."}
        />
        <HistoricalQuadrant
          icon={ClipboardList} title="Past Procedures" subtitle="Mitigation steps taken then"
          items={hasSimilarPast ? h.past_procedures : undefined} accent="amber"
          iconBg="bg-amber-50 text-amber-500"
          emptyMsg={hasSimilarPast ? "No data available." : "No prior response procedures on file for events matching this signature."}
        />
        <HistoricalQuadrant
          icon={Radio} title="Current Procedures" subtitle="Active responder deployments"
          items={h.current_procedures} accent="success"
          iconBg="bg-emerald-50 text-emerald-500"
          emptyMsg="No responder activity on record yet. This section will populate automatically once emergency teams log their deployments."
        />
        <HistoricalQuadrant
          icon={Lightbulb} title="Future Preventative Measures" subtitle="AI-recommended long-term plan"
          items={h.future_measures} accent="primary"
          iconBg="bg-blue-50 text-blue-500"
        />
      </div>

      {recommendationsList && recommendationsList.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold tracking-tight text-slate-800">Strategic Action Plan</h4>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prioritized steps for this hazard</p>
            </div>
          </div>
          <ol className="space-y-3">
            {recommendationsList.map((rec, i) => {
              const meta = priorityMeta(rec.priority);
              const Icon = meta.icon;
              return (
                <li key={i} className={`flex flex-wrap items-start gap-4 rounded-xl border-l-4 bg-white p-4 ${meta.ring}`}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 shadow-sm border border-slate-100">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-[10px] font-extrabold uppercase ${meta.pill}`}>{meta.label}</Badge>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Step {rec.step ?? i + 1}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">{renderEmphasis(rec.action)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </>
  );
}

// ─── Incident detail caches (client-side, 10 min) ────────────────────────────

type IncidentNarrative = import('@/lib/services/openai-service').IncidentDetailNarrative;
type IncidentPastContext = import('@/app/api/risk-assessment/incident-details/route').IncidentPastContext;

const incidentGroupsCache = new Map<string, { data: IncidentDetailResponse; expiresAt: number }>();
const incidentNarrativeCache = new Map<string, {
  data: { narrative: IncidentNarrative; pastContext: IncidentPastContext | null };
  expiresAt: number;
}>();

type IncidentNarrativeBundle = {
  narrative: IncidentNarrative;
  pastContext: IncidentPastContext | null;
};

function groupMemberKey(memberIds: string[]): string {
  return memberIds.slice().sort().join(',');
}

async function fetchGroupNarrativeBundle(memberIds: string[]): Promise<IncidentNarrativeBundle | null> {
  const cacheKey = groupMemberKey(memberIds);
  const cached = incidentNarrativeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const res = await fetch('/api/risk-assessment/incident-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventIds: memberIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? err.error ?? 'Failed to load incident summary');
  }
  const data = await res.json() as IncidentDetailResponse;
  if (!data.narrative) return null;

  const bundle: IncidentNarrativeBundle = {
    narrative: data.narrative,
    pastContext: data.pastContext ?? null,
  };
  incidentNarrativeCache.set(cacheKey, { data: bundle, expiresAt: Date.now() + 10 * 60 * 1000 });
  return bundle;
}

function narrativeTextForPdf(body: unknown): string {
  return stripEmphasis(dropAbsenceSentences(normalizeAiBullet(body)) ?? '');
}

// ─── LearnMoreButton ──────────────────────────────────────────────────────────

function LearnMoreButton({ eventIds, bulletText, canSendEmail }: { eventIds: string[]; bulletText: string; canSendEmail: boolean }) {
  const [open, setOpen] = useState(false);
  if (eventIds.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#33375D] hover:text-[#1f223a] underline-offset-2 hover:underline"
      >
        <BookOpen className="h-3 w-3" />
        Learn more
        <span className="text-slate-400 font-normal">· {eventIds.length} record(s)</span>
      </button>
      <IncidentDetailDialog
        open={open}
        onOpenChange={setOpen}
        eventIds={eventIds}
        bulletText={bulletText}
        canSendEmail={canSendEmail}
      />
    </>
  );
}

// ─── GroupAccordionItem — one incident, narrative loaded by dialog ────────────

function GroupAccordionItem({
  group, isOpen, onToggle, groupIndex, totalGroups,
  narrativeBundle, summaryLoading, summaryError,
}: {
  group: EventGroupSummary;
  isOpen: boolean;
  onToggle: () => void;
  groupIndex: number;
  totalGroups: number;
  narrativeBundle?: IncidentNarrativeBundle | null;
  summaryLoading?: boolean;
  summaryError?: string | null;
}) {
  const narrative = narrativeBundle?.narrative ?? null;
  const pastContext = narrativeBundle?.pastContext ?? null;

  const src = SOURCE_LABEL_MAP[group.source] ?? { label: group.source, tone: 'bg-slate-50 text-slate-700 border-slate-200' };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Accordion header — click to open/close */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 border ${src.tone}`}>{src.label}</span>
            {group.state && (
              <span className="text-[10px] font-bold rounded px-1.5 py-0.5 border bg-slate-50 text-slate-700 border-slate-200">{group.state}</span>
            )}
            <span className="text-[10px] text-slate-400 font-normal">Incident {groupIndex + 1} of {totalGroups}</span>
          </div>
          <p className="text-sm font-semibold text-slate-800 truncate">{group.name}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{group.primaryLocation} · {group.formattedTimestamp}</p>
        </div>
        <div className="shrink-0 mt-1">
          {isOpen
            ? <ChevronUp className="h-4 w-4 text-slate-400" />
            : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {/* Accordion body */}
      {isOpen && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">
          {/* Full chip strip */}
          <EventChipStrip group={group} />

          {summaryLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating in-depth summary…
            </div>
          )}

          {summaryError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{summaryError}</div>
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
              {narrative.historicalContext && <DetailSection title="Historical Context" body={narrative.historicalContext} />}

              {pastContext && (pastContext.matchedEvent || (pastContext.pastDamages?.length ?? 0) > 0 || (pastContext.pastProcedures?.length ?? 0) > 0) && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  {pastContext.matchedEvent && (
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Closest Past Incident</h4>
                        {typeof pastContext.matchConfidence === 'number' && (
                          <span className="text-[10px] font-bold text-slate-400">{pastContext.matchConfidence}% match</span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700">{renderEmphasis(pastContext.matchedEvent)}</p>
                      {pastContext.similaritySummary && (
                        <p className="text-[13px] leading-relaxed text-slate-600 mt-1">{renderEmphasis(pastContext.similaritySummary)}</p>
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
  );
}

// ─── Population at Risk helpers ───────────────────────────────────────────────

type PopulationAtRiskUser = NonNullable<RiskSummaryPayload['population_at_risk_users']>[number];

async function fetchPopulationAtRiskUsers(scopeQuery: string): Promise<PopulationAtRiskUser[]> {
  const res = await fetch(`/api/risk-assessment/population-at-risk?${scopeQuery}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { users?: PopulationAtRiskUser[] };
  return Array.isArray(data.users) ? data.users : [];
}

function withPopulationAtRiskUsers(
  summary: RiskSummaryPayload,
  users: PopulationAtRiskUser[],
): RiskSummaryPayload {
  if (users.length === 0) return summary;
  return {
    ...summary,
    population_at_risk_users: users,
    ready2go_users_at_risk: users.length,
  };
}

function summaryMissingPopulationUsers(summary: RiskSummaryPayload): boolean {
  const expected = summary.ready2go_users_at_risk ?? 0;
  return expected > 0 && !(summary.population_at_risk_users?.length);
}

function ready2goUsersAtRisk(summary: RiskSummaryPayload): number {
  return summary.ready2go_users_at_risk ?? summary.population_at_risk_users?.length ?? 0;
}

// ─── PopulationAtRiskDialog ───────────────────────────────────────────────────

function PopulationAtRiskDialog({
  open,
  onOpenChange,
  users: initialUsers,
  censusEstimate,
  ready2goCount,
  populationExposure,
  scopeQuery,
  onUsersLoaded,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  users: NonNullable<RiskSummaryPayload['population_at_risk_users']>;
  censusEstimate: number;
  ready2goCount: number;
  populationExposure: RiskSummaryPayload['population_exposure'];
  scopeQuery: string;
  onUsersLoaded?: (users: NonNullable<RiskSummaryPayload['population_at_risk_users']>) => void;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exposure, setExposure] = useState(populationExposure);
  const [censusTotal, setCensusTotal] = useState(censusEstimate);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  useEffect(() => {
    setExposure(populationExposure);
    setCensusTotal(censusEstimate);
  }, [populationExposure, censusEstimate]);

  useEffect(() => {
    if (!open) return;

    if (initialUsers.length > 0 && populationExposure) {
      setUsers(initialUsers);
      setExposure(populationExposure);
      setCensusTotal(censusEstimate);
      setError(null);
      setLoading(false);
      return;
    }

    if (ready2goCount <= 0 && censusEstimate <= 0) {
      setUsers([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/risk-assessment/population-at-risk?${scopeQuery}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? 'Failed to load population at risk');
        }
        return res.json() as Promise<{
          users?: PopulationAtRiskUser[];
          census_population_estimate?: number;
          census_vintage_label?: string;
          counties_resolved?: NonNullable<RiskSummaryPayload['population_exposure']>['countiesResolved'];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        const loaded = Array.isArray(data.users) ? data.users : [];
        setUsers(loaded);
        if (typeof data.census_population_estimate === 'number') {
          setCensusTotal(data.census_population_estimate);
        }
        if (data.counties_resolved || data.census_vintage_label) {
          setExposure((prev) => ({
            populationAffectedEstimate: data.census_population_estimate ?? prev?.populationAffectedEstimate ?? 0,
            censusVintageLabel: data.census_vintage_label ?? prev?.censusVintageLabel ?? '',
            countiesResolved: data.counties_resolved ?? prev?.countiesResolved ?? [],
            countyHintsApplied: prev?.countyHintsApplied ?? [],
            countyMatchHints: prev?.countyMatchHints ?? [],
            centroids: prev?.centroids ?? [],
            dashboardStateCd: prev?.dashboardStateCd ?? 'us',
          }));
        }
        if (loaded.length > 0) onUsersLoaded?.(loaded);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load population at risk');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, initialUsers, ready2goCount, censusEstimate, populationExposure, scopeQuery, onUsersLoaded]);

  const counties = exposure?.countiesResolved ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-800">
            Population at Risk
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-slate-500">
              U.S. Census estimate for counties in active alert areas, plus Ready2Go registered users.
            </p>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading exposure details…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <section className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                U.S. Census (ACS)
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-800">
                {censusTotal > 0 ? censusTotal.toLocaleString() : '—'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {exposure?.censusVintageLabel ??
                  'County / parish population totals for jurisdictions named in current alerts.'}
              </p>
              {counties.length > 0 && (
                <ul className="mt-3 divide-y divide-slate-200/80 rounded-lg border border-slate-100 bg-white overflow-hidden">
                  {counties.map((row) => (
                    <li
                      key={`${row.stateAbbr}-${row.countyStem}`}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-700">{row.label}</span>
                      <span className="tabular-nums font-bold text-slate-800">
                        {row.population.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {counties.length === 0 && (exposure?.countyHintsApplied?.length ?? 0) > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  Counties in scope: {exposure!.countyHintsApplied!.join(', ')}
                </p>
              )}
            </section>

            <section className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Ready2Go users ({ready2goCount.toLocaleString()})
              </p>
              {users.length === 0 ? (
                <p className="mt-2 py-4 text-center text-sm italic text-slate-400">
                  No Ready2Go users matched the current incident areas.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
                  {users.map((user) => (
                    <li key={user.id} className="bg-white px-4 py-3">
                      <p className="font-bold text-sm text-slate-800">{user.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{user.email}</p>
                      <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-slate-600">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>{user.address}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const SECTOR_CRITERIA_MAP: Record<string, { provider: string; criteria: string[] }> = {
  ci_chemical: {
    provider: 'DHS / FEMA / EPA',
    criteria: [
      'FEMA National Risk Index (NRI) – Hazard exposure and industrial risk layers',
      'USGS National Structures Dataset – Industrial facility geospatial locations',
      'EPA Facility Registry Service (FRS) – Facility locations, ownership, environmental permits'
    ]
  },
  ci_commercial: {
    provider: 'Department of Homeland Security (DHS)',
    criteria: [
      'Homeland Infrastructure Foundation-Level Data (HIFLD) – Commercial and public assets (grocery stores, pharmacies, banks, airports)',
      'DHS Critical Facilities Registry – Commercial hubs, retail clusters, major banking branches'
    ]
  },
  ci_communications: {
    provider: 'Federal Communications Commission (FCC) / DHS',
    criteria: [
      'FCC Antenna Structure Registration (ASR) – Cell towers, broadcast antennas, microwave paths',
      'HIFLD Communications Infrastructure – Fiber routing stations, satellite ground controls'
    ]
  },
  ci_manufacturing: {
    provider: 'Department of Commerce / USGS',
    criteria: [
      'USGS National Structures Dataset – Primary metals, machinery, electrical equipment plants',
      'DHS Manufacturing Registry – Critical supply chain production facilities and warehouses'
    ]
  },
  ci_dams: {
    provider: 'US Army Corps of Engineers (USACE)',
    criteria: [
      'National Inventory of Dams (NID) – Hazard potential, storage capacity, structural conditions',
      'FEMA Dam Safety Program – Emergency action plan status and inundation zone boundaries'
    ]
  },
  ci_defense: {
    provider: 'Department of Defense (DoD)',
    criteria: [
      'DoD Installation Geospatial Information – Military bases, depots, munitions storage sites',
      'Defense Industrial Base (DIB) Registry – Privately-owned critical defense contractors'
    ]
  },
  ci_emergency_services: {
    provider: 'DHS / FEMA / DOJ',
    criteria: [
      'HIFLD Emergency Services – Fire stations, police departments, ambulance services, EOCs',
      'FEMA National Emergency Response Registry – Search & rescue depots, disaster supply hubs'
    ]
  },
  ci_energy: {
    provider: 'Department of Energy (DOE) / EIA',
    criteria: [
      'EIA Energy Atlas – Electrical substations, power plants, gas pipelines, refineries',
      'EPA eGRID – Regional electric grid interconnection nodes and transmission links'
    ]
  },
  ci_financial: {
    provider: 'FDIC / NCUA / Federal Reserve',
    criteria: [
      'FDIC Branch Office Locations – Commercial banks, vaults, regional processing centers',
      'NCUA Credit Union Directory – Credit unions, ATM access networks, payment processing hubs'
    ]
  },
  ci_food_ag: {
    provider: 'USDA / FDA',
    criteria: [
      'USDA FSIS Facility Registry – Meat, poultry, and egg processing plants',
      'FDA Food Facility Registration – Food processing plants, grain elevators, distribution hubs'
    ]
  },
  ci_government: {
    provider: 'General Services Administration (GSA)',
    criteria: [
      'GSA Federal Real Property Profile – Federal courthouses, EOCs, offices, continuity sites',
      'State and Local Government Geospatial Database – City halls, county courthouses'
    ]
  },
  ci_healthcare: {
    provider: 'HHS / CMS / HRSA',
    criteria: [
      'HHS Hospital Directory – Level 1-4 trauma centers, acute care hospitals, emergency rooms',
      'HRSA Geospatial Database – Community clinics, urgent care centers',
      'CMS NPPES – Pharmacies, oxygen suppliers'
    ]
  },
  ci_it: {
    provider: 'DHS / FCC',
    criteria: [
      'HIFLD IT Infrastructure – Main data center locations, internet exchange points (IXPs)',
      'FCC Fiber Backhaul Registry – Critical telecommunications and cloud hosting hubs'
    ]
  },
  ci_nuclear: {
    provider: 'Nuclear Regulatory Commission (NRC) / DOE',
    criteria: [
      'NRC Licensed Facilities – Nuclear power plants, research reactors, storage facilities',
      'DOE Nuclear Waste Management Database – Radioactive materials transit and storage sites'
    ]
  },
  ci_transportation: {
    provider: 'Department of Transportation (DOT) / FAA / FRA',
    criteria: [
      'Bureau of Transportation Statistics (BTS) NTAD – Airports, railway lines, public transit hubs',
      'FAA Airport Facilities Directory – Commercial and municipal airports, helipads, ATC towers',
      'Federal Railroad Administration (FRA) – High-volume rail corridors and freight yards'
    ]
  },
  ci_water: {
    provider: 'Environmental Protection Agency (EPA)',
    criteria: [
      'EPA SDWIS (Safe Drinking Water Information System) – Water treatment plants, reservoirs',
      'EPA Clean Water Act Facility Database – Wastewater treatment facilities, main pump stations'
    ]
  }
};

function CriticalInfrastructureAtRiskDialog({
  open,
  onOpenChange,
  infrastructure,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  infrastructure: NonNullable<RiskSummaryPayload['critical_infrastructure_at_risk']>;
}) {
  const [openSectorId, setOpenSectorId] = useState<string | null>(null);

  const mergedSectors = useMemo(() => {
    return CRITICAL_INFRASTRUCTURE_SECTORS.map((s) => {
      const match = infrastructure.find((i) => i.sectorId === s.id);
      return {
        ...s,
        facilitiesAtRisk: match?.facilitiesAtRisk ?? 0,
        riskLevel: match?.riskLevel ?? 'LOW',
        isAtRisk: match ? match.facilitiesAtRisk > 0 : false,
      };
    }).sort((a, b) => {
      if (a.isAtRisk && !b.isAtRisk) return -1;
      if (!a.isAtRisk && b.isAtRisk) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [infrastructure]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#33375D]" />
            Federal Critical Infrastructure Risk Registry
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-xs text-slate-500 leading-relaxed">
              Assessment across the 16 national critical sectors designated by CISA. Double-check local GIS layers to stage resources.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-4">
          {mergedSectors.map((sector) => {
            const criteria = SECTOR_CRITERIA_MAP[sector.id];
            const isOpen = openSectorId === sector.id;
            const Icon = sector.Icon;
            
            return (
              <div key={sector.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenSectorId(isOpen ? null : sector.id)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: sector.color }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{sector.label}</p>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        Provider: {criteria?.provider || 'Federal Agency'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    {sector.isAtRisk ? (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase bg-red-50 text-red-600 border border-red-100">
                        {sector.facilitiesAtRisk} at risk
                      </span>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-slate-50 text-slate-400 border border-slate-200">
                        Secure
                      </span>
                    )}
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 bg-slate-50/50 space-y-3">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                        National Risk Mapping Criteria
                      </h4>
                      <ul className="space-y-1.5 pl-1">
                        {criteria?.criteria.map((c, idx) => (
                          <li key={idx} className="flex gap-2 text-xs leading-relaxed text-slate-600">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100/60 pt-2 mt-2">
                      <span>Risk Profile: {sector.riskLevel}</span>
                      <span>Source: GIS Integration API</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── IncidentDetailDialog ─────────────────────────────────────────────────────

function IncidentDetailDialog({
  open, onOpenChange, eventIds, bulletText, canSendEmail,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  eventIds: string[];
  bulletText: string;
  canSendEmail: boolean;
}) {
  const [groups, setGroups] = useState<EventGroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrativeBundles, setNarrativeBundles] = useState<Map<string, IncidentNarrativeBundle>>(new Map());
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [summariesError, setSummariesError] = useState<string | null>(null);
  // Only one accordion item open at a time; null = all closed
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const cacheKey = eventIds.slice().sort().join(',');
    const cached = incidentGroupsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setGroups(cached.data.groups);
      setOpenGroupKey(cached.data.groups[0]?.memberIds.slice().sort().join(',') ?? null);
      return;
    }
    setLoading(true);
    setError(null);
    setGroups([]);
    fetch('/api/risk-assessment/incident-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventIds, groupsOnly: true }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? 'Failed to load');
        return r.json() as Promise<IncidentDetailResponse>;
      })
      .then((d) => {
        incidentGroupsCache.set(cacheKey, { data: d, expiresAt: Date.now() + 10 * 60 * 1000 });
        setGroups(d.groups);
        // Auto-open the first incident
        setOpenGroupKey(d.groups[0]?.memberIds.slice().sort().join(',') ?? null);
      })
      .catch((e: Error) => setError(e.message ?? 'Failed to load incident groups'))
      .finally(() => setLoading(false));
  }, [open, eventIds]);

  useEffect(() => {
    if (!open || groups.length === 0) return;

    let cancelled = false;
    setSummariesLoading(true);
    setSummariesError(null);
    setNarrativeBundles(new Map());

    Promise.all(
      groups.map(async (g) => {
        const key = groupMemberKey(g.memberIds);
        const bundle = await fetchGroupNarrativeBundle(g.memberIds);
        return { key, bundle };
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const map = new Map<string, IncidentNarrativeBundle>();
        for (const { key, bundle } of results) {
          if (bundle) map.set(key, bundle);
        }
        setNarrativeBundles(map);
        if (map.size !== groups.length) {
          setSummariesError('Some incident summaries could not be generated. Email will unlock when all are ready.');
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setSummariesError(e.message ?? 'Failed to generate incident summaries.');
        }
      })
      .finally(() => {
        if (!cancelled) setSummariesLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, groups]);

  const summariesReady = groups.length > 0
    && !summariesLoading
    && !summariesError
    && groups.every((g) => narrativeBundles.has(groupMemberKey(g.memberIds)));

  // Reset accordion state when dialog closes
  useEffect(() => {
    if (!open) {
      setOpenGroupKey(null);
      setGroups([]);
      setError(null);
      setNarrativeBundles(new Map());
      setSummariesLoading(false);
      setSummariesError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold text-slate-800">Incident Details</DialogTitle>
          <DialogDescription asChild>
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{renderEmphasis(bulletText)}</p>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
            <p className="mt-2 text-sm text-slate-500">Loading incidents…</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {groups.length > 0 && (
          <div className="space-y-2">
            {groups.map((g) => {
              const key = groupMemberKey(g.memberIds);
              const bundle = narrativeBundles.get(key);
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
              );
            })}
            {canSendEmail && (
              <div className="flex flex-col items-end gap-2 border-t border-slate-100 pt-4">
                {(summariesLoading || !summariesReady) && (
                  <p className="text-xs text-slate-500">
                    {summariesLoading
                      ? 'Generating full incident summaries… Send Email will unlock when ready.'
                      : summariesError ?? 'Waiting for all incident summaries before sending.'}
                  </p>
                )}
                <SendReportEmailButton
                  disabled={!summariesReady}
                  getPdfPayload={() => {
                    if (!summariesReady) return null;
                    const details = groups.map((g) => ({
                      group: g,
                      bundle: narrativeBundles.get(groupMemberKey(g.memberIds)) ?? null,
                    }));
                    const doc = createIncidentBriefPdf(bulletText, details);
                    const date = new Date().toISOString().slice(0, 10);
                    return {
                      pdfBase64: pdfDocToBase64(doc),
                      filename: `Ready2Go-Incident-Brief-${date}.pdf`,
                      reportTitle: 'Incident Detail Brief',
                      summaryLine: `${groups.length} related incident group(s) · ${stripEmphasis(bulletText).slice(0, 180)}`,
                    };
                  }}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({ title, body }: { title: string; body: unknown }) {
  const cleaned = dropAbsenceSentences(normalizeAiBullet(body));
  if (!cleaned) return null;
  const paragraphs = cleaned.split(/\n+/).map((p) => p.trim()).filter(Boolean);
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
  );
}

function DetailBulletSection({ title, items }: { title: string; items?: string[] }) {
  const cleaned = (items ?? []).map((s) => s?.trim()).filter(Boolean) as string[];
  if (cleaned.length === 0) return null;
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
  );
}

// ─── Category sub-block with scroll + collapse ────────────────────────────────

function CategorySubBlock({ cat, canSendEmail }: { cat: SeverityBucket['categories'][number]; canSendEmail: boolean }) {
  const COLLAPSE_AFTER = 1;
  const [expanded, setExpanded] = useState(false);
  const bullets: BulletWithRefs[] = (cat.bullets ?? [])
    .map((b) => ({ text: normalizeAiBullet(b.text), eventIds: b.eventIds ?? [] }))
    .filter((b) => b.text);
  const groups = cat.groups ?? [];
  const visible = expanded ? bullets : bullets.slice(0, COLLAPSE_AFTER);
  const hidden = bullets.length - COLLAPSE_AFTER;
  const groupCount = cat.groupCount ?? groups.length;

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
        {humanizeCategory(cat.category)}
        <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
          · {cat.eventCount} active
          {groupCount > 0 && groupCount < cat.eventCount && (
            <> · <span className="text-emerald-600">{groupCount} distinct</span></>
          )}
        </span>
      </p>
      <div className="max-h-[480px] overflow-y-auto pr-1">
        <ul className="space-y-2.5">
          {visible.map((b, i) => (
            <li key={i} className="flex flex-col gap-0.5 text-sm leading-relaxed text-slate-700">
              <div className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span className="flex-1">{renderEmphasis(b.text)}</span>
              </div>
              {groups[i] && <div className="pl-3.5"><EventChipStrip group={groups[i]} /></div>}
              <div className="pl-3.5">
                <LearnMoreButton eventIds={b.eventIds} bulletText={b.text} canSendEmail={canSendEmail} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      {!expanded && hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Show all {bullets.length} bullets
        </button>
      )}
      {expanded && bullets.length > COLLAPSE_AFTER && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Show less
        </button>
      )}
    </div>
  );
}

// ─── Severity Levels grid ─────────────────────────────────────────────────────

function SeverityLevelGrid({ buckets, loading, canSendEmail }: { buckets: SeverityBucket[]; loading: boolean; canSendEmail: boolean }) {
  if (loading) {
    return (
      <Card className="rounded-2xl bg-white p-8 text-center shadow-xl shadow-slate-200/50 border-slate-100">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
        <p className="mt-3 text-sm text-slate-500">Generating severity summaries…</p>
      </Card>
    );
  }
  if (!buckets.length) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-slate-600" />
        <h2 className="text-base font-extrabold tracking-tight text-slate-800">Severity Levels</h2>
        <p className="text-xs text-slate-500 ml-1">— AI-summarized active events grouped by severity and hazard type</p>
      </div>
      <div className={
        buckets.length === 1 ? 'grid gap-4 grid-cols-1' :
        buckets.length === 2 ? 'grid gap-4 sm:grid-cols-2' :
        buckets.length === 3 ? 'grid gap-4 lg:grid-cols-3' :
        'grid gap-4 sm:grid-cols-2'
      }>
        {buckets.map((bucket) => (
          <Card key={bucket.severity} className={`rounded-2xl border p-5 shadow-md ${severityTone(bucket.severity)}`}>
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="outline" className={`text-xs font-extrabold uppercase ${severityPill(bucket.severity)}`}>
                {bucket.severity}
              </Badge>
              <span className="text-[11px] text-slate-500 font-semibold">
                {bucket.categories.reduce((s, c) => s + c.eventCount, 0)} event(s) across {bucket.categories.length} category type(s)
              </span>
            </div>
            <div className="space-y-4">
              {bucket.categories.map((cat) => (
                <CategorySubBlock key={cat.category} cat={cat} canSendEmail={canSendEmail} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Historical Analysis section ──────────────────────────────────────────────

function HistoricalAnalysisSection({
  activeCategories,
  tabDataMap,
  loadingCategories,
  retryCategory,
}: {
  activeCategories: string[];
  tabDataMap: Map<string, HistoricalTabPayload>;
  loadingCategories: Set<string>;
  retryCategory: (cat: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTab && activeCategories.length > 0) setActiveTab(activeCategories[0]);
  }, [activeCategories, activeTab]);

  const currentTab = activeTab && activeCategories.includes(activeTab) ? activeTab : (activeCategories[0] ?? null);

  if (!activeCategories.length) return null;

  return (
    <Card className="rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/50 border-slate-100">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold tracking-tight text-slate-800">Historical Context & Mitigation Strategy</h3>
            <p className="text-xs text-slate-500">One tab per active hazard category — matched past events, current situation, and future strategy.</p>
          </div>
        </div>
      </div>

      <Tabs value={currentTab ?? ""} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-slate-100/80 p-1.5">
          {activeCategories.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="text-xs font-bold data-[state=active]:bg-white">
              {humanizeCategory(cat)}
              {loadingCategories.has(cat) && <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />}
            </TabsTrigger>
          ))}
        </TabsList>

        {activeCategories.map((cat) => {
          const tabData = tabDataMap.get(cat);
          const isLoading = loadingCategories.has(cat);
          return (
            <TabsContent key={cat} value={cat} className="mt-0 outline-none">
              {isLoading ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
                  <p className="text-sm text-slate-500">Loading historical context for {humanizeCategory(cat)}…</p>
                </div>
              ) : !tabData ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <p className="text-sm text-slate-500">Failed to load. </p>
                  <Button size="sm" variant="outline" onClick={() => retryCategory(cat)}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              ) : (
                <HistoricalAnalysisBody
                  data={tabData.historical_analysis}
                  hasSimilarPast={tabData.hasSimilarPast}
                  recommendationsList={tabData.recommendations_list}
                />
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </Card>
  );
}

// ─── PDF export ───────────────────────────────────────────────────────────────

type PdfEmailPayload = {
  pdfBase64: string;
  filename: string;
  reportTitle: string;
  summaryLine?: string;
};

type ReportEmailAudience = 'sub-admin' | 'responder' | 'both';

const REPORT_EMAIL_AUDIENCE_LABELS: Record<ReportEmailAudience, string> = {
  'sub-admin': 'Sub-admins only',
  responder: 'Responders only',
  both: 'Sub-admins & responders',
};

const REPORT_EMAIL_AUDIENCE_SHORT: Record<ReportEmailAudience, string> = {
  'sub-admin': 'Sub-admins',
  responder: 'Responders',
  both: 'All recipients',
};

function pdfDocToBase64(doc: jsPDF): string {
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function writePdfHeader(doc: jsPDF, title: string, rightLines: string[]) {
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(35, 56, 102);
  doc.rect(0, 0, pageW, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Ready2Go', margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(title, margin, 50);
  doc.setFontSize(9);
  rightLines.forEach((line, i) => {
    doc.text(line, pageW - margin, 32 + i * 18, { align: 'right' });
  });
  doc.setTextColor(20, 25, 40);
}

function createRiskReportPdf(
  summary: RiskSummaryPayload,
  severityBuckets: SeverityBucket[],
  tabDataMap: Map<string, HistoricalTabPayload>,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48, pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensure = (h: number) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; } };

  writePdfHeader(doc, 'Situational Risk Assessment Report', [
    `Generated: ${new Date(summary.generated_at).toLocaleString()}`,
    `Overall Risk: ${summary.overall_risk_level}`,
  ]);
  y = 100;

  const writeKv = (label: string, value: string) => {
    ensure(18); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(80, 90, 110);
    doc.text(label, margin, y); doc.setFont("helvetica", "normal"); doc.setTextColor(20, 25, 40);
    doc.text(value, margin + 180, y); y += 16;
  };
  writeKv("AI Confidence", `${summary.ai_confidence}%`);
  writeKv("Active Incidents", `${summary.alerts_count} (Major ${summary.major_incidents} / Minor ${summary.minor_incidents})`);
  writeKv("Sources Aggregated", `${summary.sources_count}`);
  writeKv("Population at Risk", `${summary.populations_at_risk.toLocaleString()}`);
  const ciAtRiskCount = summary.critical_infrastructure_at_risk?.reduce(
    (n, r) => n + r.facilitiesAtRisk,
    0,
  ) ?? 0;
  writeKv("Critical Infrastructure at Risk", `${ciAtRiskCount}`);
  y += 8;

  const writeBullets = (title: string, items: string[], badge?: string) => {
    ensure(40); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(35, 56, 102);
    doc.text(badge ? `${title}  —  ${badge}` : title, margin, y); y += 8;
    doc.setDrawColor(220, 225, 235); doc.line(margin, y, pageW - margin, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(40, 45, 60);
    items.forEach((b) => {
      const lines = doc.splitTextToSize(`• ${stripEmphasis(b)}`, contentW);
      lines.forEach((line: string) => { ensure(14); doc.text(line, margin, y); y += 13; });
    });
    y += 12;
  };

  for (const bucket of severityBuckets) {
    for (const cat of bucket.categories) {
      writeBullets(`${bucket.severity} — ${humanizeCategory(cat.category)}`, (cat.bullets ?? []).map((b) => b.text));
    }
  }

  ensure(60);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(35, 56, 102);
  doc.text("Historical Context & Mitigation Strategy", margin, y); y += 8;
  doc.setDrawColor(220, 225, 235); doc.line(margin, y, pageW - margin, y); y += 14;

  for (const [cat, payload] of tabDataMap.entries()) {
    const h = payload.historical_analysis;
    ensure(30); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(35, 56, 102);
    doc.text(humanizeCategory(cat), margin, y); y += 12;
    if (h.matched_event) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20, 25, 40);
      doc.text(`Matched: ${stripEmphasis(h.matched_event)}  (Confidence ${h.match_confidence ?? 0}%)`, margin, y); y += 14;
    }
    if (h.past_damages?.length) writeBullets("Past Damages", h.past_damages);
    if (h.past_procedures?.length) writeBullets("Past Procedures", h.past_procedures);
    if (h.current_procedures?.length) writeBullets("Current Procedures", h.current_procedures);
    if (h.future_measures?.length) writeBullets("Future Measures", h.future_measures);
    if (payload.recommendations_list?.length) {
      writeBullets(`${humanizeCategory(cat)} — Strategic Actions`, payload.recommendations_list.map((r) => `[${r.priority}] Step ${r.step ?? 1}: ${stripEmphasis(r.action)}`));
    }
    y += 6;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140, 150, 170);
    doc.text(`Ready2Go · Confidential Operational Report · Page ${i} of ${pageCount}`, pageW / 2, pageH - 20, { align: "center" });
  }
  return doc;
}

type IncidentBriefPdfDetail = {
  group: EventGroupSummary;
  bundle: IncidentNarrativeBundle | null;
};

function writePdfTextBlock(
  doc: jsPDF,
  margin: number,
  contentW: number,
  pageH: number,
  yRef: { y: number },
  title: string,
  body: string,
) {
  const ensure = (h: number) => {
    if (yRef.y + h > pageH - margin) { doc.addPage(); yRef.y = margin; }
  };
  if (!body.trim()) return;

  ensure(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(35, 56, 102);
  doc.text(title, margin, yRef.y);
  yRef.y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 45, 60);
  doc.splitTextToSize(body, contentW).forEach((line: string) => {
    ensure(14);
    doc.text(line, margin, yRef.y);
    yRef.y += 13;
  });
  yRef.y += 8;
}

function createIncidentBriefPdf(bulletText: string, details: IncidentBriefPdfDetail[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const yRef = { y: margin };
  const ensure = (h: number) => { if (yRef.y + h > pageH - margin) { doc.addPage(); yRef.y = margin; } };

  writePdfHeader(doc, 'Incident Detail Brief', [
    `Generated: ${new Date().toLocaleString()}`,
    `${details.length} incident group(s)`,
  ]);
  yRef.y = 100;

  writePdfTextBlock(doc, margin, contentW, pageH, yRef, 'AI Summary', stripEmphasis(bulletText));
  yRef.y += 4;

  details.forEach(({ group, bundle }, index) => {
    ensure(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(35, 56, 102);
    doc.text(`Incident ${index + 1}: ${stripEmphasis(group.name)}`, margin, yRef.y);
    yRef.y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 45, 60);
    const meta = [
      `Severity: ${group.severity}`,
      `Location: ${group.primaryLocation}${group.state ? `, ${group.state}` : ''}`,
      `Source: ${SOURCE_LABEL_MAP[group.source]?.label ?? group.source}`,
      `Updated: ${group.formattedTimestamp}`,
    ];
    if (group.affectedCounties.length) meta.push(`Counties: ${group.affectedCounties.join(', ')}`);
    meta.forEach((line) => {
      ensure(14);
      doc.text(line, margin, yRef.y);
      yRef.y += 13;
    });
    yRef.y += 6;

    const narrative = bundle?.narrative;
    if (narrative) {
      writePdfTextBlock(doc, margin, contentW, pageH, yRef, 'Overview', narrativeTextForPdf(narrative.overview));
      writePdfTextBlock(doc, margin, contentW, pageH, yRef, 'Current Status', narrativeTextForPdf(narrative.currentStatus));
      writePdfTextBlock(doc, margin, contentW, pageH, yRef, 'Affected Areas', narrativeTextForPdf(narrative.affectedAreas));
      writePdfTextBlock(doc, margin, contentW, pageH, yRef, 'Key Statistics', narrativeTextForPdf(narrative.keyStatistics));
      writePdfTextBlock(doc, margin, contentW, pageH, yRef, 'Historical Context', narrativeTextForPdf(narrative.historicalContext));
    }

    const pastContext = bundle?.pastContext;
    if (pastContext?.matchedEvent) {
      writePdfTextBlock(doc, margin, contentW, pageH, yRef, 'Closest Past Incident', narrativeTextForPdf(pastContext.matchedEvent));
    }
    if (pastContext?.pastDamages?.length) {
      writePdfTextBlock(
        doc, margin, contentW, pageH, yRef,
        'Past Damages / Losses',
        pastContext.pastDamages.map((s) => `• ${narrativeTextForPdf(s)}`).join('\n'),
      );
    }
    if (pastContext?.pastProcedures?.length) {
      writePdfTextBlock(
        doc, margin, contentW, pageH, yRef,
        'Past Procedures',
        pastContext.pastProcedures.map((s) => `• ${narrativeTextForPdf(s)}`).join('\n'),
      );
    }

    yRef.y += 10;
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 170);
    doc.text(`Ready2Go · Confidential Operational Report · Page ${i} of ${pageCount}`, pageW / 2, pageH - 20, { align: 'center' });
  }
  return doc;
}

function buildPdf(
  summary: RiskSummaryPayload,
  severityBuckets: SeverityBucket[],
  tabDataMap: Map<string, HistoricalTabPayload>,
) {
  createRiskReportPdf(summary, severityBuckets, tabDataMap)
    .save(`Ready2Go-Risk-Report-${new Date(summary.generated_at).toISOString().slice(0, 10)}.pdf`);
}

function SendReportEmailButton({
  disabled,
  getPdfPayload,
  className,
}: {
  disabled?: boolean;
  getPdfPayload: () => PdfEmailPayload | null;
  className?: string;
}) {
  const { me } = useUser();
  const [sending, setSending] = useState(false);
  const [audience, setAudience] = useState<ReportEmailAudience>('both');
  const showAudiencePicker = me?.role === 'super-admin';
  const isDisabled = Boolean(disabled || sending);

  const handleSend = async () => {
    const payload = getPdfPayload();
    if (!payload) return;
    setSending(true);
    try {
      const res = await fetch('/api/risk-assessment/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          ...(showAudiencePicker ? { audience } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send report email');
      toast.success(`Report emailed to ${data.sentCount} recipient(s).`, {
        description: data.partial ? 'Some recipients could not be reached.' : undefined,
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send report email.');
    } finally {
      setSending(false);
    }
  };

  if (!showAudiencePicker) {
    return (
      <Button
        type="button"
        onClick={handleSend}
        disabled={isDisabled}
        variant="outline"
        className={className ?? 'h-11 rounded-xl border-slate-200 px-5 text-sm font-bold'}
      >
        {sending
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
          : <><Mail className="mr-2 h-4 w-4" />Send Email Report</>}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex h-11 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs',
        isDisabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <button
        type="button"
        onClick={handleSend}
        disabled={isDisabled}
        className="flex min-w-0 items-center gap-2 px-4 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed"
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span>Sending…</span>
          </>
        ) : (
          <>
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">Send Email Report</span>
            <span className="hidden text-xs font-semibold text-slate-500 sm:inline">
              · {REPORT_EMAIL_AUDIENCE_SHORT[audience]}
            </span>
          </>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isDisabled}
            className="flex items-center justify-center border-l border-slate-200 px-2.5 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed"
            aria-label="Choose email recipients"
          >
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Send to
          </DropdownMenuLabel>
          {(Object.entries(REPORT_EMAIL_AUDIENCE_LABELS) as [ReportEmailAudience, string][]).map(
            ([value, label]) => (
              <DropdownMenuItem
                key={value}
                onSelect={() => setAudience(value)}
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <span className="flex-1">{label}</span>
                {audience === value && <Check className="h-4 w-4 text-[#33375D]" />}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RiskAssessment() {
  const { me } = useUser();
  const ctx = useMemo(() => getRiskAnalyzeContextFromBrowser(me), [me?.role, me?.state]);

  const [summary, setSummary] = useState<RiskSummaryPayload | null>(null);
  const [severityBuckets, setSeverityBuckets] = useState<SeverityBucket[]>([]);
  const [tabDataMap, setTabDataMap] = useState<Map<string, HistoricalTabPayload>>(new Map());

  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingSeverity, setLoadingSeverity] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(new Set());
  const [bootstrapping, setBootstrapping] = useState(true);

  const scopeBody = useMemo(() => {
    const b: Record<string, unknown> = {};
    if (ctx.role === "sub-admin" && ctx.stateCd) {
      b.nationwide = false;
      b.stateCd = ctx.stateCd;
    }
    return b;
  }, [ctx.role, ctx.stateCd]);

  const scopeQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (scopeBody.stateCd) qs.set("stateCd", String(scopeBody.stateCd));
    if (scopeBody.nationwide === false) qs.set("nationwide", "false");
    return qs.toString();
  }, [scopeBody]);

  const [popAtRiskOpen, setPopAtRiskOpen] = useState(false);
  const [ciRiskOpen, setCiRiskOpen] = useState(false);

  const handlePopulationUsersLoaded = useCallback((users: PopulationAtRiskUser[]) => {
    setSummary((prev) => (prev ? withPopulationAtRiskUsers(prev, users) : prev));
  }, []);

  const reportCacheKey = useMemo(() => buildAiRiskReportCacheKey(scopeBody), [scopeBody]);

  useEffect(() => { setTimeout(() => setBootstrapping(false), 400); }, []);

  // Restore the last generated report for this scope when returning to the page.
  useEffect(() => {
    const cached = loadCachedAiRiskReport(reportCacheKey);
    if (cached) {
      setSummary(cached.summary);
      setSeverityBuckets(cached.severityBuckets ?? []);
      setTabDataMap(new Map(Object.entries(cached.tabDataMap ?? {})));

      if (summaryMissingPopulationUsers(cached.summary)) {
        fetchPopulationAtRiskUsers(scopeQuery)
          .then((users) => {
            if (users.length === 0) return;
            setSummary((prev) => (prev ? withPopulationAtRiskUsers(prev, users) : prev));
          })
          .catch(() => { /* ignore */ });
      }
    } else {
      setSummary(null);
      setSeverityBuckets([]);
      setTabDataMap(new Map());
    }
  }, [reportCacheKey, scopeQuery]);

  // Persist report as it loads (summary first, then severity + historical tabs).
  useEffect(() => {
    if (!summary) return;
    saveCachedAiRiskReport(reportCacheKey, {
      summary,
      severityBuckets,
      tabDataMap: Object.fromEntries(tabDataMap),
    });
  }, [reportCacheKey, summary, severityBuckets, tabDataMap]);

  const fetchHistoricalCategory = useCallback(async (category: string) => {
    setLoadingCategories((prev) => new Set(prev).add(category));
    try {
      const res = await fetch(`/api/risk-assessment/historical/${category}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scopeBody),
      });
      if (!res.ok) throw new Error(`Historical fetch failed for ${category}`);
      const data: HistoricalTabPayload = await res.json();
      setTabDataMap((prev) => new Map(prev).set(category, data));
    } catch {
      // Tab shows retry button when data missing from map
    } finally {
      setLoadingCategories((prev) => { const s = new Set(prev); s.delete(category); return s; });
    }
  }, [scopeBody]);

  const generate = useCallback(async () => {
    setLoadingSummary(true);
    setLoadingSeverity(true);
    clearCachedAiRiskReport(reportCacheKey);
    setSummary(null);
    setSeverityBuckets([]);
    setTabDataMap(new Map());
    setLoadingCategories(new Set());

    try {
      // Stage 1: summary (deterministic, fast)
      const qs = new URLSearchParams();
      if (scopeBody.stateCd) qs.set("stateCd", scopeBody.stateCd as string);
      if (scopeBody.nationwide === false) qs.set("nationwide", "false");
      const summaryRes = await fetch(`/api/risk-assessment/summary?${qs}`);
      if (!summaryRes.ok) throw new Error("Summary request failed");
      let summaryData: RiskSummaryPayload = await summaryRes.json();

      if (summaryMissingPopulationUsers(summaryData)) {
        const users = await fetchPopulationAtRiskUsers(qs.toString());
        summaryData = withPopulationAtRiskUsers(summaryData, users);
      }

      setSummary(summaryData);
      setLoadingSummary(false);

      const activeCategories = summaryData.active_categories ?? [];
      if (!activeCategories.length) {
        setLoadingSeverity(false);
        return;
      }

      // Stages 2 + 3 in parallel: severity summaries + historical tabs
      const [sevRes] = await Promise.all([
        fetch("/api/risk-assessment/severity-summaries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(scopeBody),
        }),
        ...activeCategories.map((cat) => fetchHistoricalCategory(cat)),
      ]);

      if (sevRes.ok) {
        const sevData = await sevRes.json();
        setSeverityBuckets(sevData.buckets ?? []);
      }
      setLoadingSeverity(false);

      toast.success("AI Risk Assessment generated.", {
        description: `${summaryData.alerts_count} active incident(s) across ${activeCategories.length} category type(s).`,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate report.");
      setLoadingSummary(false);
      setLoadingSeverity(false);
    }
  }, [scopeBody, fetchHistoricalCategory, reportCacheKey]);

  const canDownload = summary !== null && !loadingSeverity && loadingCategories.size === 0;
  const canSendEmail = me?.role === 'super-admin' || me?.role === 'sub-admin';

  const downloadPdf = () => {
    if (!summary) return;
    toast.success("Generating PDF Report…");
    buildPdf(summary, severityBuckets, tabDataMap);
  };

  const fullReportPdfPayload = useCallback((): PdfEmailPayload | null => {
    if (!summary) return null;
    const doc = createRiskReportPdf(summary, severityBuckets, tabDataMap);
    const date = new Date(summary.generated_at).toISOString().slice(0, 10);
    return {
      pdfBase64: pdfDocToBase64(doc),
      filename: `Ready2Go-Risk-Report-${date}.pdf`,
      reportTitle: 'Situational Risk Assessment Report',
      summaryLine: `Overall risk: ${summary.overall_risk_level} · ${summary.alerts_count} active incident(s) · AI confidence ${summary.ai_confidence}%`,
    };
  }, [summary, severityBuckets, tabDataMap]);

  const isGenerating = loadingSummary || loadingSeverity || loadingCategories.size > 0;
  const hasReport = summary !== null;

  return (
    <AdminPageShell>
      {/* Header */}
      <Card className="rounded-2xl border-l-4 border-l-[#33375D] bg-white p-7 shadow-xl shadow-slate-200/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-6 w-6 text-[#33375D]" />
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">AI Risk Assessment</h1>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
              Dynamic multi-hazard intelligence synthesized from live active events — severity analysis, historical context, and strategic action plan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={generate} disabled={isGenerating}
              className="h-11 rounded-xl bg-[#33375D] px-5 text-sm font-bold text-white hover:bg-[#2A2E4D]">
              {isGenerating
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing…</>
                : <><Sparkles className="mr-2 h-4 w-4" />Generate New Risk Report</>}
            </Button>
            <Button onClick={downloadPdf} disabled={!canDownload} variant="outline"
              className="h-11 rounded-xl border-slate-200 px-5 text-sm font-bold">
              <FileDown className="mr-2 h-4 w-4" />Download Full PDF Report
            </Button>
            {canSendEmail && (
              <SendReportEmailButton
                disabled={!canDownload}
                getPdfPayload={fullReportPdfPayload}
              />
            )}
          </div>
        </div>
      </Card>

      {/* Loading / empty states */}
      {loadingSummary && !hasReport && (
        <Card className="rounded-2xl bg-white p-10 text-center shadow-xl shadow-slate-200/50">
          <AdminPageLoader layout="inline" containerClassName="!py-0" />
        </Card>
      )}
      {!hasReport && !isGenerating && !bootstrapping && (
        <Card className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-800">No assessment yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Click <span className="font-bold">Generate New Risk Report</span> to synthesize latest intelligence.
          </p>
        </Card>
      )}

      {hasReport && summary?.ai_available === false && (
        <Card className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">
            AI summaries unavailable — <code className="font-mono text-xs">OPENAI_API_KEY</code> is not configured.
            Deterministic data is shown; AI-generated prose will appear once the key is set.
          </p>
        </Card>
      )}

      {hasReport && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
          {/* KPI Row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="Overall Threat Level" icon={ShieldAlert}>
              <Badge className={`text-sm font-extrabold uppercase tracking-wider ${overallTone(summary!.overall_risk_level)}`}>
                {summary!.overall_risk_level}
              </Badge>
              <p className="mt-2 text-[11px] text-slate-500">Aggregate operational posture</p>
            </KpiCard>

            <KpiCard label="Active Incidents" icon={Activity}>
              <p className="text-3xl font-extrabold tabular-nums text-slate-800">{summary!.alerts_count}</p>
              <div className="mt-2 flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1 text-red-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{summary!.major_incidents} Major
                </span>
                <span className="flex items-center gap-1 text-amber-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{summary!.minor_incidents} Minor
                </span>
              </div>
            </KpiCard>

            <KpiCard label="AI Confidence" icon={Gauge}>
              <div className="flex items-center gap-3">
                <CircularConfidence value={summary!.ai_confidence} />
                <div className="flex-1">
                  <Progress value={summary!.ai_confidence} className="h-2 bg-slate-100 [&>div]:bg-[#33375D]" />
                  <p className="mt-2 text-[11px] text-slate-500">Multi-source corroboration</p>
                </div>
              </div>
            </KpiCard>

            <KpiCard
              label="Population at Risk"
              icon={Users}
              headerAction={
                hasReport && (summary!.populations_at_risk > 0 || ready2goUsersAtRisk(summary!) > 0) ? (
                  <button
                    type="button"
                    onClick={() => setPopAtRiskOpen(true)}
                    className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#33375D]"
                    title="View census exposure and Ready2Go users"
                    aria-label="View census exposure and Ready2Go users"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                ) : null
              }
            >
              <p className="text-3xl font-extrabold tabular-nums text-slate-800">
                {summary!.populations_at_risk > 0
                  ? summary!.populations_at_risk.toLocaleString()
                  : '—'}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                U.S. Census estimate in active alert areas
              </p>
              {ready2goUsersAtRisk(summary!) > 0 && (
                <p className="mt-1 text-[11px] font-semibold text-[#33375D]">
                  {ready2goUsersAtRisk(summary!).toLocaleString()} Ready2Go users
                </p>
              )}
            </KpiCard>

            <KpiCard
              label="Critical Infrastructure at Risk"
              icon={Building2}
              headerAction={
                hasReport && summary!.critical_infrastructure_at_risk?.length ? (
                  <button
                    type="button"
                    onClick={() => setCiRiskOpen(true)}
                    className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#33375D]"
                    title="View critical infrastructure at risk"
                    aria-label="View critical infrastructure at risk"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                ) : null
              }
            >
              {summary!.critical_infrastructure_at_risk?.length ? (
                <>
                  <p className="text-3xl font-extrabold tabular-nums text-slate-800">
                    {summary!.critical_infrastructure_at_risk.reduce(
                      (n, r) => n + r.facilitiesAtRisk,
                      0,
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {summary!.critical_infrastructure_at_risk
                      .filter((r) => r.riskLevel === 'CRITICAL' || r.riskLevel === 'HIGH')
                      .slice(0, 3)
                      .map((r) => (
                        <span
                          key={r.sectorId}
                          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100"
                        >
                          {r.label.split(' ')[0]} · {r.facilitiesAtRisk}
                        </span>
                      ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-3xl font-extrabold tabular-nums text-slate-400">—</p>
                  <p className="mt-2 text-[11px] text-slate-500">Enable Dashboard A CI layers on map</p>
                </>
              )}
            </KpiCard>
          </div>

          {/* Incident Distribution Chart */}
          <Card className="rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/50 border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold tracking-tight text-slate-800">Incident Distribution</h3>
                <p className="text-xs text-slate-500">Active event counts grouped by hazard category (only categories with incidents are shown).</p>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold uppercase bg-slate-50 text-slate-600 border-slate-200">
                Live · {summary!.sources_count} sources
              </Badge>
            </div>
            {summary!.incident_distribution.length === 0 ? (
              <p className="py-8 text-center text-sm italic text-slate-400">No active incidents.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary!.incident_distribution} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="category" stroke="#64748b"
                      tick={{ fontSize: 12, fontWeight: 600, fill: "#64748b" }}
                      tickLine={false} axisLine={false}
                      tickFormatter={(v: string) => humanizeCategory(v)} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={60}>
                      {summary!.incident_distribution.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Severity Levels */}
          <SeverityLevelGrid buckets={severityBuckets} loading={loadingSeverity} canSendEmail={canSendEmail} />

          {/* Historical Context */}
          <HistoricalAnalysisSection
            activeCategories={summary!.active_categories}
            tabDataMap={tabDataMap}
            loadingCategories={loadingCategories}
            retryCategory={fetchHistoricalCategory}
          />

          <p className="text-center text-[11px] text-slate-400">
            Last assessment generated {new Date(summary!.generated_at).toLocaleString()} · {summary!.sources_count} data source(s) · {summary!.alerts_count} active incident(s)
          </p>
        </div>
      )}

      <PopulationAtRiskDialog
        open={popAtRiskOpen}
        onOpenChange={setPopAtRiskOpen}
        users={summary?.population_at_risk_users ?? []}
        censusEstimate={summary?.populations_at_risk ?? 0}
        ready2goCount={summary ? ready2goUsersAtRisk(summary) : 0}
        populationExposure={summary?.population_exposure}
        scopeQuery={scopeQuery}
        onUsersLoaded={handlePopulationUsersLoaded}
      />
      <CriticalInfrastructureAtRiskDialog
        open={ciRiskOpen}
        onOpenChange={setCiRiskOpen}
        infrastructure={summary?.critical_infrastructure_at_risk ?? []}
      />
    </AdminPageShell>
  );
}
