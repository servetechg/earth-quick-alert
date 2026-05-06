'use client'

import { useEffect, useMemo, useState, Fragment, type ElementType, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Sparkles,
  CloudLightning,
  Waves,
  Flame,
  ShieldAlert,
  FileDown,
  Loader2,
  Activity,
  Users,
  AlertTriangle,
  Gauge,
  CheckCircle2,
  History,
  TrendingDown,
  ClipboardList,
  Radio,
  Lightbulb,
} from "lucide-react";
import jsPDF from "jspdf";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import type { HistoricalAnalysis, RiskReport } from "@/lib/types/risk-assessment";

const overallTone = (level: string) => {
  switch (level) {
    case "SEVERE":
    case "CRITICAL":
      return "bg-red-500 text-white hover:bg-red-600";
    case "HIGH":
      return "bg-amber-500 text-white hover:bg-amber-600";
    case "ELEVATED":
      return "bg-yellow-500 text-white hover:bg-yellow-600";
    case "MODERATE":
      return "bg-blue-500 text-white hover:bg-blue-600";
    default:
      return "bg-emerald-500 text-white hover:bg-emerald-600";
  }
};

const domainTone = (sev?: string) => {
  switch (sev) {
    case "Critical":
    case "High Risk":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "Elevated":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "Monitor":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    default:
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  }
};

const priorityMeta = (p: string) => {
  if (p === "IMMEDIATE")
    return {
      ring: "border-l-red-500",
      pill: "bg-red-500/10 text-red-500 border-red-500/20",
      icon: AlertTriangle,
      label: "Immediate",
    };
  if (p === "URGENT")
    return {
      ring: "border-l-amber-500",
      pill: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      icon: ShieldAlert,
      label: "Urgent",
    };
  return {
    ring: "border-l-yellow-500",
    pill: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    icon: CheckCircle2,
    label: "Standard",
  };
};

const CHART_COLORS = [
  "#ef4444", // red-500
  "#f59e0b", // amber-500
  "#eab308", // yellow-500
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
];

function CircularConfidence({ value }: { value: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 60 60" className="h-16 w-16 -rotate-90">
        <circle
          cx="30"
          cy="30"
          r={r}
          stroke="#f1f5f9"
          strokeWidth="6"
          fill="none"
        />
        <circle
          cx="30"
          cy="30"
          r={r}
          stroke="#33375D"
          strokeWidth="6"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-slate-800">
        {value}%
      </div>
    </div>
  );
}

function KpiCard({
  label,
  children,
  icon: Icon,
}: {
  label: string;
  children: ReactNode;
  icon: ElementType;
}) {
  return (
    <Card className="rounded-2xl bg-white p-5 shadow-xl shadow-slate-200/50 border-slate-100">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

/** Collapse consecutive duplicate lines from upstream feeds (e.g. repeated FEMA declarations). */
function dedupeConsecutiveBullets(xs: string[]): string[] {
  return xs.filter((line, i) => i === 0 || line !== xs[i - 1]);
}

/**
 * Highlights measurements and IDs in ingest bullet lines (quake magnitudes, gauges, hotspots, dates).
 */
function renderFindingEmphasis(text: string): ReactNode {
  const patterns = [
    /\bM\d+(?:\.\d+)?\b/gi,
    /Hotspot\s+lat\s+[-]?\d+(?:\.\d+)?\s+lon\s+[-]?\d+(?:\.\d+)?/gi,
    /\d+\.?\d*°[NS]\s+[-]?\d+\.?\d*°[EW]/g,
    /latest\s*=\s*[\d,]+(?:\.\d+)?/gi,
    /\bSite\s+[\d.]+\b/gi,
    /\bLID\s+[A-Z0-9]+\b/gi,
    /\(\s*CSV\s+row\s+\d+\s*\)/gi,
    /\(\s*Flood\s*\)/gi,
    /—\s*[A-Z]{2}\s+\d{4}-\d{2}-\d{2}T[\d:.]+Z?/gi,
    /\d{1,2}\/\d{1,2}\/\d{4}(?:,\s*\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*UTC)?/gi,
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/gi,
    /\b\d[\d,]*(?:\.\d+)?\s?(?:cubic\s+feet\s+per\s+second|cfs)\b/gi,
    /\b\d[\d,]*(?:\.\d+)?\s?(?:ft\.?|feet)\b/gi,
    /\b\d[\d,]*(?:\.\d+)?%/gi,
    /\b\d[\d,]*(?:\.\d+)?\s?acres\b/gi,
    /\b\d[\d,]*(?:\.\d+)?\s?mph\b/gi,
    /\b\d[\d,]*(?:\.\d+)?\s?(?:°F|°C)\b/gi,
    /\blat\s+[-]?\d+(?:\.\d+)?\s+lon\s+[-]?\d+(?:\.\d+)?/gi,
  ];

  const findFirstSpan = (remaining: string) => {
    let best: { start: number; end: number; text: string } | null = null;
    for (const p of patterns) {
      const m = new RegExp(p.source, p.flags.includes("i") ? "gi" : "g").exec(remaining);
      if (!m) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (!best || start < best.start || (start === best.start && end > best.end)) {
        best = { start, end, text: m[0] };
      }
    }
    return best;
  };

  const nodes: ReactNode[] = [];
  let remaining = text;
  let k = 0;
  let guard = 0;
  while (remaining.length > 0 && guard++ < 512) {
    const span = findFirstSpan(remaining);
    if (!span) {
      nodes.push(<span key={`t-${k++}`}>{remaining}</span>);
      break;
    }
    if (span.start > 0) {
      nodes.push(<span key={`t-${k++}`}>{remaining.slice(0, span.start)}</span>);
    }
    nodes.push(
      <strong key={`b-${k++}`} className="font-bold text-[#232a43] tabular-nums">
        {span.text}
      </strong>,
    );
    remaining = remaining.slice(span.end);
  }

  return nodes.length <= 1 ? (nodes[0] ?? text) : <Fragment>{nodes}</Fragment>;
}

function FindingsCard({
  icon: Icon,
  title,
  severity,
  bullets,
  tone,
}: {
  icon: ElementType;
  title: string;
  severity?: string;
  bullets: string[];
  tone: "blue" | "primary" | "red";
}) {
  const toneWrap = {
    blue: "h-10 w-10 rounded-xl border-2 border-blue-600 bg-white text-blue-600 shadow-sm shadow-blue-100/80",
    primary:
      "h-10 w-10 rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/80 shadow-sm shadow-sky-100/60",
    red: "h-11 w-11 shrink-0 rounded-full bg-rose-100 text-red-600 ring-4 ring-rose-50",
  }[tone];
  const bulletsDeduped = useMemo(() => dedupeConsecutiveBullets(bullets), [bullets]);

  const badgeLabel = severity?.trim()
    ? severity.replace(/\w+/g, (w) => w.toUpperCase())
    : "";

  return (
    <Card className="flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex shrink-0 items-center justify-center ${tone === "red" ? "" : "h-10 w-10"} ${toneWrap}`}
          >
            <Icon
              className={tone === "red" ? "h-5 w-5" : "h-[22px] w-[22px]"}
              strokeWidth={2}
            />
          </div>
          <h3 className="text-[15px] font-extrabold leading-snug tracking-tight text-[#252d45]">
            {title}
          </h3>
        </div>
        {badgeLabel && (
          <Badge variant="outline" className={`shrink-0 text-[10px] font-extrabold ${domainTone(severity)}`}>
            {badgeLabel}
          </Badge>
        )}
      </div>
      {bulletsDeduped.length === 0 ? (
        <p className="mt-5 text-sm italic leading-relaxed text-slate-400">
          No findings for this domain in this pull.
        </p>
      ) : (
        <ul className="mt-5 space-y-3.5">
          {bulletsDeduped.map((b, i) => (
            <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-slate-600">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span className="min-w-0">{renderFindingEmphasis(b)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HistoryBulletList({
  items,
  accent = "primary",
}: {
  items?: string[];
  accent?: "primary" | "red" | "amber" | "success";
}) {
  const dot =
    accent === "red"
      ? "bg-red-500"
      : accent === "amber"
        ? "bg-amber-500"
        : accent === "success"
          ? "bg-emerald-500"
          : "bg-blue-500";
  if (!items?.length)
    return <p className="text-xs italic text-slate-400">No data available.</p>;
  const list = dedupeConsecutiveBullets(items);
  return (
    <ul className="space-y-2.5">
      {list.map((b, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="min-w-0">{renderFindingEmphasis(b)}</span>
        </li>
      ))}
    </ul>
  );
}

function HistoricalQuadrant({
  icon: Icon,
  title,
  subtitle,
  items,
  accent,
  iconBg,
}: {
  icon: ElementType;
  title: string;
  subtitle: string;
  items?: string[];
  accent: "primary" | "red" | "amber" | "success";
  iconBg: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold tracking-tight text-slate-800">{title}</h4>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {subtitle}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <HistoryBulletList items={items} accent={accent} />
      </div>
    </div>
  );
}

function HistoricalAnalysisSection({ data }: { data?: HistoricalAnalysis }) {
  const h = data ?? {};
  const conf = h.match_confidence ?? 0;
  return (
    <Card className="rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/50 border-slate-100">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold tracking-tight text-slate-800">
              Historical Context & Mitigation Strategy
            </h3>
            <p className="text-xs text-slate-500">
              Comparative analysis vs. closest matched past emergency
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-bold uppercase bg-blue-50 text-blue-600 border-blue-100">
            Match Confidence {conf}%
          </Badge>
        </div>
      </div>

      <div className="mb-5 rounded-xl border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
          Matched Event
        </p>
        <p className="mt-1 text-lg font-extrabold tracking-tight text-slate-800">
          {h.matched_event ?? "No comparable historical event identified."}
        </p>
        {h.similarity_summary && (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            {renderFindingEmphasis(h.similarity_summary)}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <HistoricalQuadrant
          icon={TrendingDown}
          title="Past Damages & Losses"
          subtitle="What it cost last time"
          items={h.past_damages}
          accent="red"
          iconBg="bg-red-50 text-red-500"
        />
        <HistoricalQuadrant
          icon={ClipboardList}
          title="Past Procedures"
          subtitle="Mitigation steps taken then"
          items={h.past_procedures}
          accent="amber"
          iconBg="bg-amber-50 text-amber-500"
        />
        <HistoricalQuadrant
          icon={Radio}
          title="Current Procedures"
          subtitle="Active response right now"
          items={h.current_procedures}
          accent="success"
          iconBg="bg-emerald-50 text-emerald-500"
        />
        <HistoricalQuadrant
          icon={Lightbulb}
          title="Future Preventative Measures"
          subtitle="AI-recommended long-term plan"
          items={h.future_measures}
          accent="primary"
          iconBg="bg-blue-50 text-blue-500"
        />
      </div>
    </Card>
  );
}

export default function RiskAssessment() {
  const [report, setReport] = useState<RiskReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [ingestMeta, setIngestMeta] = useState<{
    successfulSources: number;
    sources: { source: string; ok: boolean; error?: string }[];
    reachableReady2GoUsers?: number;
  } | null>(null);

  useEffect(() => {
    // Simulate loading initial data
    const timer = setTimeout(() => {
      setBootstrapping(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const generate = async () => {
    setLoading(true);
    setIngestMeta(null);
    try {
      const res = await fetch("/api/risk-assessment/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateCd: "ca",
          nwpsGaugeId: "SACC1",
          usgsSite: "11447650",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
      }
      if (!data?.report) {
        throw new Error("Invalid response: missing report");
      }
      setReport(data.report as RiskReport);
      if (data.ingest) {
        setIngestMeta({
          successfulSources: data.ingest.successfulSources,
          sources: data.ingest.sources ?? [],
          reachableReady2GoUsers: data.ingest.reachableReady2GoUsers,
        });
        const srcList = data.ingest.sources ?? [];
        const totalFeeds = srcList.length || 8;
        const failed = srcList.filter((s: { ok: boolean }) => !s.ok).length;
        if (failed > 0) {
          toast.success("Risk report generated.", {
            description: `${data.ingest.successfulSources}/${totalFeeds} feeds OK · ${failed} need attention (see console/logs).`,
          });
        } else {
          toast.success("AI Risk Assessment generated from live feeds.");
        }
      } else {
        toast.success("AI Risk Assessment generated.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  };

  const majorCount = report?.major_incidents ?? 0;
  const minorCount = report?.minor_incidents ?? 0;

  const distribution = report?.incident_distribution ?? [];

  const downloadPdf = () => {
    if (!report) return;
    toast.success("Generating PDF Report...");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const contentW = pageW - margin * 2;
    let y = margin;

    const ensure = (h: number) => {
      if (y + h > pageH - margin) {
        doc.addPage();
        y = margin;
      }
    };

    doc.setFillColor(35, 56, 102);
    doc.rect(0, 0, pageW, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Ready2Go", margin, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Situational Risk Assessment Report", margin, 50);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date(report.generated_at).toLocaleString()}`, pageW - margin, 32, {
      align: "right",
    });
    doc.text(`Overall Risk: ${report.overall_risk_level}`, pageW - margin, 50, {
      align: "right",
    });

    y = 100;
    doc.setTextColor(20, 25, 40);

    const writeKv = (label: string, value: string) => {
      ensure(18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(80, 90, 110);
      doc.text(label, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20, 25, 40);
      doc.text(value, margin + 160, y);
      y += 16;
    };

    writeKv("AI Confidence", `${report.ai_confidence}%`);
    writeKv(
      "Population at risk (ACS counties)",
      `${report.populations_at_risk.toLocaleString()} — from NOAA + NWS derived jurisdictions.`,
    );
    if (report.ready2go_users_reachable != null) {
      writeKv(
        "Reachable via Ready2Go",
        `${report.ready2go_users_reachable.toLocaleString()} approved users in exposure cues or NWPS / quake proximity.`,
      );
    }
    writeKv("Active Incidents", `${report.alerts_count} (Major ${majorCount} / Minor ${minorCount})`);
    writeKv("Sources Aggregated", `${report.sources_count}`);
    y += 8;

    const writeBullets = (title: string, items: string[], severity?: string) => {
      ensure(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(35, 56, 102);
      doc.text(severity ? `${title}  —  ${severity}` : title, margin, y);
      y += 8;
      doc.setDrawColor(220, 225, 235);
      doc.line(margin, y, pageW - margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(40, 45, 60);
      items.forEach((b) => {
        const lines = doc.splitTextToSize(`• ${b}`, contentW);
        lines.forEach((line: string) => {
          ensure(14);
          doc.text(line, margin, y);
          y += 13;
        });
      });
      y += 12;
    };

    writeBullets(
      "Meteorological Findings",
      report.meteorological_findings,
      report.domain_severities?.meteorological,
    );
    writeBullets(
      "Hydrological Risk",
      report.hydrological_findings,
      report.domain_severities?.hydrological,
    );
    writeBullets("Active Fire Threats", report.fire_findings, report.domain_severities?.fire);

    // Historical Comparative Analysis
    const h = report.historical_analysis ?? {};
    ensure(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(35, 56, 102);
    doc.text("Historical Context & Mitigation Strategy", margin, y);
    y += 8;
    doc.setDrawColor(220, 225, 235);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
    if (h.matched_event) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20, 25, 40);
      doc.text(
        `Matched Event: ${h.matched_event}  (Match ${h.match_confidence ?? 0}%)`,
        margin,
        y,
      );
      y += 14;
      if (h.similarity_summary) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(80, 90, 110);
        const simLines = doc.splitTextToSize(h.similarity_summary, contentW);
        simLines.forEach((line: string) => {
          ensure(13);
          doc.text(line, margin, y);
          y += 12;
        });
        y += 4;
      }
    }
    if (h.past_damages?.length) writeBullets("Past Damages & Losses", h.past_damages);
    if (h.past_procedures?.length) writeBullets("Past Procedures", h.past_procedures);
    if (h.current_procedures?.length)
      writeBullets("Current Procedures (Active)", h.current_procedures);
    if (h.future_measures?.length) writeBullets("Future Preventative Measures", h.future_measures);

    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(35, 56, 102);
    doc.text("Strategic Recommendations", margin, y);
    y += 8;
    doc.setDrawColor(220, 225, 235);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(40, 45, 60);
    (report.recommendations_list ?? []).forEach((r) => {
      const lines = doc.splitTextToSize(`[${r.priority}] ${r.action}`, contentW);
      lines.forEach((line: string) => {
        ensure(14);
        doc.text(line, margin, y);
        y += 13;
      });
    });
    y += 14;

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(140, 150, 170);
      doc.text(
        `Ready2Go · Confidential Operational Report · Page ${i} of ${pageCount}`,
        pageW / 2,
        pageH - 20,
        { align: "center" },
      );
    }

    doc.save(
      `Ready2Go-Risk-Report-${new Date(report.generated_at).toISOString().slice(0, 10)}.pdf`,
    );
  };

  return (
    <div className="p-8 space-y-10 max-w-[1800px] mx-auto">
      {/* Header */}
      <Card className="rounded-2xl border-l-4 border-l-[#33375D] bg-white p-7 shadow-xl shadow-slate-200/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-6 w-6 text-[#33375D]" />
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
                AI Risk Assessment
              </h1>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
              Multi-source intelligence aggregator. Synthesizes USGS water + earthquake feeds,
              NOAA (NWS / NWPS), NASA FIRMS, FEMA, Esri wildfire layers, and InciWeb.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={generate}
              disabled={loading}
              className="h-11 rounded-xl bg-[#33375D] px-5 text-sm font-bold text-white hover:bg-[#2A2E4D]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing data...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate New Risk Report
                </>
              )}
            </Button>
            <Button
              onClick={downloadPdf}
              disabled={!report || loading}
              variant="outline"
              className="h-11 rounded-xl border-slate-200 px-5 text-sm font-bold"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Download Full PDF Report
            </Button>
          </div>
        </div>
      </Card>

      {/* Empty / loading states */}
      {loading && !report && (
        <Card className="rounded-2xl bg-white p-10 text-center shadow-xl shadow-slate-200/50">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#33375D]" />
          <p className="mt-4 text-sm font-bold text-slate-800">
            AI is analyzing multi-source data...
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Aggregating USGS gauges, NOAA advisories, NASA FIRMS hot spots and InciWeb
            incidents.
          </p>
        </Card>
      )}

      {!report && !loading && !bootstrapping && (
        <Card className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-800">No assessment yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Click <span className="font-bold">Generate New Risk Report</span> to synthesize
            the latest multi-source intelligence.
          </p>
        </Card>
      )}

      {report && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
          {/* KPI Row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Overall Threat Level" icon={ShieldAlert}>
              <Badge
                className={`text-sm font-extrabold uppercase tracking-wider ${overallTone(report.overall_risk_level)}`}
              >
                {report.overall_risk_level}
              </Badge>
              <p className="mt-2 text-[11px] text-slate-500">
                Aggregate operational posture
              </p>
            </KpiCard>

            <KpiCard label="Active Incidents" icon={Activity}>
              <p className="text-3xl font-extrabold tabular-nums text-slate-800">
                {report.alerts_count}
              </p>
              <div className="mt-2 flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1 text-red-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {majorCount} Major
                </span>
                <span className="flex items-center gap-1 text-amber-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {minorCount} Minor
                </span>
              </div>
            </KpiCard>

            <KpiCard label="AI Confidence" icon={Gauge}>
              <div className="flex items-center gap-3">
                <CircularConfidence value={report.ai_confidence} />
                <div className="flex-1">
                  <Progress value={report.ai_confidence} className="h-2 bg-slate-100 [&>div]:bg-[#33375D]" />
                  <p className="mt-2 text-[11px] text-slate-500">
                    Multi-source corroboration
                  </p>
                </div>
              </div>
            </KpiCard>

            <KpiCard label="Population at Risk" icon={Users}>
              <p className="text-3xl font-extrabold tabular-nums text-slate-800">
                {report.populations_at_risk.toLocaleString()}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Estimated across affected zones (ACS county / parish roll-up from NOAA + NWS geography)
              </p>
              <p className="mt-3 flex items-start gap-1.5 text-[12px] font-bold leading-snug text-emerald-700">
                <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.35)]" />
                <span className="tabular-nums">
                  {(report.ready2go_users_reachable ?? ingestMeta?.reachableReady2GoUsers ?? 0).toLocaleString()}{' '}
                  Reachable via Ready2Go (approved citizen profiles in flagged counties / cities or NWPS · earthquake
                  proximity rings)
                </span>
              </p>
            </KpiCard>
          </div>

          {/* Chart Row */}
          <Card className="rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/50 border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold tracking-tight text-slate-800">
                  Incident Distribution
                </h3>
                <p className="text-xs text-slate-500">
                  Deduped event counts by hazard family (from this ingest — same keys as Alerts & Communication where sources overlap)
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold uppercase bg-slate-50 text-slate-600 border-slate-200">
                Live · {report.sources_count} sources
              </Badge>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="category"
                    stroke="#64748b"
                    tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    className="capitalize"
                    tickFormatter={(v: string) =>
                      String(v).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                    }
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={60}>
                    {distribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Findings grid */}
          <div className="grid gap-5 lg:grid-cols-3">
            <FindingsCard
              icon={CloudLightning}
              title="Meteorological"
              severity={report.domain_severities?.meteorological}
              bullets={report.meteorological_findings ?? []}
              tone="blue"
            />
            <FindingsCard
              icon={Waves}
              title="Hydrological Risk"
              severity={report.domain_severities?.hydrological}
              bullets={report.hydrological_findings ?? []}
              tone="primary"
            />
            <FindingsCard
              icon={Flame}
              title="Active Fire Threats"
              severity={report.domain_severities?.fire}
              bullets={report.fire_findings ?? []}
              tone="red"
            />
          </div>

          {/* Historical Comparative Analysis */}
          <HistoricalAnalysisSection data={report.historical_analysis} />

          {/* Strategic recommendations action plan */}
          <Card className="rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/50 border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-slate-800">
                    Strategic Recommendations
                  </h3>
                  <p className="text-xs text-slate-500">
                    Prioritized action plan
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold uppercase bg-slate-50 text-slate-600 border-slate-200">
                {(report.recommendations_list ?? []).length} actions
              </Badge>
            </div>

            <ol className="space-y-3">
              {(report.recommendations_list ?? []).map((rec, i) => {
                const meta = priorityMeta(rec.priority);
                const Icon = meta.icon;
                return (
                  <li
                    key={i}
                    className={`flex flex-wrap items-start gap-4 rounded-xl border-l-4 bg-slate-50 p-4 ${meta.ring}`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm border border-slate-100">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-[10px] font-extrabold uppercase ${meta.pill}`}>
                          {meta.label}
                        </Badge>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Step {i + 1}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700">
                        {renderFindingEmphasis(rec.action)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <p className="text-center text-[11px] text-slate-400">
            Last assessment generated {new Date(report.generated_at).toLocaleString()} · {report.sources_count}{" "}
            ingest sources succeeded · {report.alerts_count} deduped incident
            {report.alerts_count === 1 ? "" : "s"} in chart categories
          </p>
        </div>
      )}
    </div>
  );
}
