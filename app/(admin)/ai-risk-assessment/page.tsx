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
  Sparkles, ShieldAlert, FileDown, Loader2,
  Activity, Users, AlertTriangle, Gauge, CheckCircle2,
  History, TrendingDown, ClipboardList, Radio, Lightbulb,
  RefreshCw, MapPin, ChevronDown, ChevronUp,
} from "lucide-react";
import jsPDF from "jspdf";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  RiskSummaryPayload, SeverityBucket, HistoricalTabPayload,
  RecommendationItem, HistoricalAnalysis, EventGroupSummary,
} from "@/lib/types/risk-assessment";
import { SOURCE_LABEL_MAP } from "@/lib/types/risk-assessment";

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

/** Render **bold** markers + auto-bold measurements */
function renderEmphasis(text: string): ReactNode {
  const boldRe = /\*\*([^*]+?)\*\*/g;
  const nodes: ReactNode[] = [];
  let last = 0, i = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) nodes.push(<span key={i++}>{text.slice(last, m.index).replace(/\*/g, "")}</span>);
    nodes.push(<strong key={i++} className="font-bold text-[#232a43]">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<span key={i++}>{text.slice(last).replace(/\*/g, "")}</span>);
  return nodes.length <= 1 ? (nodes[0] ?? text) : <Fragment>{nodes}</Fragment>;
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

function KpiCard({ label, icon: Icon, children }: { label: string; icon: ElementType; children: ReactNode }) {
  return (
    <Card className="rounded-2xl bg-white p-5 shadow-xl shadow-slate-200/50 border-slate-100">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
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
          {h.matched_event ?? (hasSimilarPast ? "Analyzing past events…" : "No comparable past events found.")}
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

// ─── Category sub-block with scroll + collapse ────────────────────────────────

function CategorySubBlock({ cat }: { cat: SeverityBucket['categories'][number] }) {
  const COLLAPSE_AFTER = 1;
  const [expanded, setExpanded] = useState(false);
  const bullets = cat.bullets ?? [];
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
                <span>{renderEmphasis(b)}</span>
              </div>
              {groups[i] && <div className="pl-3.5"><EventChipStrip group={groups[i]} /></div>}
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

function SeverityLevelGrid({ buckets, loading }: { buckets: SeverityBucket[]; loading: boolean }) {
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
                <CategorySubBlock key={cat.category} cat={cat} />
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

function buildPdf(
  summary: RiskSummaryPayload,
  severityBuckets: SeverityBucket[],
  tabDataMap: Map<string, HistoricalTabPayload>,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48, pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensure = (h: number) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; } };

  // Header
  doc.setFillColor(35, 56, 102);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("Ready2Go", margin, 32);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Situational Risk Assessment Report", margin, 50);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date(summary.generated_at).toLocaleString()}`, pageW - margin, 32, { align: "right" });
  doc.text(`Overall Risk: ${summary.overall_risk_level}`, pageW - margin, 50, { align: "right" });
  y = 100;
  doc.setTextColor(20, 25, 40);

  const writeKv = (label: string, value: string) => {
    ensure(18); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(80, 90, 110);
    doc.text(label, margin, y); doc.setFont("helvetica", "normal"); doc.setTextColor(20, 25, 40);
    doc.text(value, margin + 180, y); y += 16;
  };
  writeKv("AI Confidence", `${summary.ai_confidence}%`);
  writeKv("Active Incidents", `${summary.alerts_count} (Major ${summary.major_incidents} / Minor ${summary.minor_incidents})`);
  writeKv("Sources Aggregated", `${summary.sources_count}`);
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

  // Severity Levels
  for (const bucket of severityBuckets) {
    for (const cat of bucket.categories) {
      writeBullets(`${bucket.severity} — ${humanizeCategory(cat.category)}`, cat.bullets ?? []);
    }
  }

  // Historical tabs
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
  };

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140, 150, 170);
    doc.text(`Ready2Go · Confidential Operational Report · Page ${i} of ${pageCount}`, pageW / 2, pageH - 20, { align: "center" });
  }
  doc.save(`Ready2Go-Risk-Report-${new Date(summary.generated_at).toISOString().slice(0, 10)}.pdf`);
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

  useEffect(() => { setTimeout(() => setBootstrapping(false), 400); }, []);

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
      const summaryData: RiskSummaryPayload = await summaryRes.json();
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
  }, [scopeBody, fetchHistoricalCategory]);

  const canDownload = summary !== null && !loadingSeverity && loadingCategories.size === 0;

  const downloadPdf = () => {
    if (!summary) return;
    toast.success("Generating PDF Report…");
    buildPdf(summary, severityBuckets, tabDataMap);
  };

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

            <KpiCard label="Population at Risk" icon={Users}>
              <p className="text-3xl font-extrabold tabular-nums text-slate-800">
                {summary!.populations_at_risk > 0 ? summary!.populations_at_risk.toLocaleString() : "—"}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Estimated across affected zones
              </p>
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
          <SeverityLevelGrid buckets={severityBuckets} loading={loadingSeverity} />

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
    </AdminPageShell>
  );
}
