'use client'

import { useEffect, useMemo, useState } from "react";
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
  Rocket,
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

interface RecommendationItem {
  priority: "IMMEDIATE" | "URGENT" | "STANDARD";
  action: string;
  deployable: boolean;
}
interface DomainSeverities {
  meteorological?: string;
  hydrological?: string;
  fire?: string;
}
interface DistroPoint {
  category: string;
  count: number;
}
interface HistoricalAnalysis {
  matched_event?: string;
  match_confidence?: number;
  similarity_summary?: string;
  past_damages?: string[];
  past_procedures?: string[];
  current_procedures?: string[];
  future_measures?: string[];
}
interface RiskReport {
  id: string;
  generated_at: string;
  overall_risk_level: string;
  ai_confidence: number;
  populations_at_risk: number;
  domain_severities: DomainSeverities;
  meteorological_findings: string[];
  hydrological_findings: string[];
  fire_findings: string[];
  recommendations_list: RecommendationItem[];
  incident_distribution: DistroPoint[];
  historical_analysis: HistoricalAnalysis;
  sources_count: number;
  alerts_count: number;
  meteorological_summary: string;
  hydrological_risk: string;
  fire_threats: string;
  recommendations: string;
}

const MOCK_REPORT: RiskReport = {
  id: "mock-1",
  generated_at: new Date().toISOString(),
  overall_risk_level: "HIGH",
  ai_confidence: 92,
  populations_at_risk: 50000,
  domain_severities: {
    meteorological: "Monitor",
    hydrological: "Elevated",
    fire: "High Risk"
  },
  meteorological_findings: [
    "Winds at Cedar Ridge Wildfire are 25 mph from the NE, hindering containment.",
    "No immediate meteorological threats are indicated for other active incidents.",
    "NOAA predicts +2.1 ft above MHHW high tide for Outer Banks, NC."
  ],
  hydrological_findings: [
    "Trinity River near Trinity County, TX: USGS gauge 08066500 is at 18.4 ft, rising 0.3 ft/hr (action stage 19 ft).",
    "Mississippi River at St. Louis, MO: USGS gauge 07010000 is at 41.2 ft (major flood stage 40 ft), with NOAA forecasting a crest of 43.1 ft in 18 hours.",
    "Coastal Flood Watch issued for Outer Banks, NC, due to predicted high tides."
  ],
  fire_findings: [
    "Cedar Ridge Wildfire (Cedar Ridge, CA): 3,200 acres burning, 0% contained, high confidence from NASA FIRMS.",
    "Pine Hollow Wildfire (Pine Hollow, OR): 480 acres, 15% contained, 2 structures threatened (InciWeb incident #2026-OR-PHF).",
    "Brush Fire (Sector 14B, NV): Approximately 12 acres, low confidence, remote location (NASA FIRMS MODIS detection)."
  ],
  recommendations_list: [
    { priority: "IMMEDIATE", action: "Deploy additional firefighting resources to Cedar Ridge Wildfire.", deployable: true },
    { priority: "URGENT", action: "Issue evacuation warnings for areas affected by the Mississippi River flood in St. Louis.", deployable: false },
    { priority: "STANDARD", action: "Monitor Trinity River levels and prepare for potential flood stage.", deployable: false },
    { priority: "STANDARD", action: "Assess potential impact and prepare for response to Ridgecrest, CA M5.4 earthquake.", deployable: false }
  ],
  incident_distribution: [
    { category: "wildfire", count: 3 },
    { category: "flood", count: 3 },
    { category: "earthquake", count: 1 }
  ],
  historical_analysis: {
    matched_event: "Camp Fire 2018 Pattern",
    match_confidence: 85,
    similarity_summary: "Similar high wind conditions and rapid spread in dry vegetation areas.",
    past_damages: ["Widespread structural loss", "Evacuation route congestion"],
    past_procedures: ["Early mass evacuation", "Staging resources outside active zones"],
    current_procedures: ["Active monitoring", "Resource staging"],
    future_measures: ["Enhanced vegetation management", "Improved alert systems"]
  },
  sources_count: 5,
  alerts_count: 7,
  meteorological_summary: "",
  hydrological_risk: "",
  fire_threats: "",
  recommendations: ""
};

const MOCK_MAJOR_COUNT = 4;
const MOCK_MINOR_COUNT = 3;

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
  children: React.ReactNode;
  icon: React.ElementType;
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

function FindingsCard({
  icon: Icon,
  title,
  severity,
  bullets,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  severity?: string;
  bullets: string[];
  tone: "blue" | "primary" | "red";
}) {
  const toneClass = {
    blue: "bg-blue-500/10 text-blue-600",
    primary: "bg-slate-100 text-slate-800",
    red: "bg-red-500/10 text-red-600",
  }[tone];
  return (
    <Card className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/50 border-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-base font-extrabold tracking-tight text-slate-800">{title}</h3>
        </div>
        {severity && (
          <Badge variant="outline" className={`text-[10px] font-extrabold uppercase ${domainTone(severity)}`}>
            {severity}
          </Badge>
        )}
      </div>
      <ul className="mt-4 space-y-3">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-600">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span dangerouslySetInnerHTML={{ __html: highlightNumbers(b) }} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function highlightNumbers(text: string) {
  const escaped = text.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
  );
  return escaped.replace(
    /(\b\d[\d,\.]*\s?(?:mph|kph|km\/h|acres|ft|m|inches|in|cfs|°F|°C|%|people|residents|homes)?\b)/gi,
    '<strong class="text-slate-800 font-bold">$1</strong>',
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
  return (
    <ul className="space-y-2.5">
      {items.map((b, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span dangerouslySetInnerHTML={{ __html: highlightNumbers(b) }} />
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
  icon: React.ElementType;
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
          <p
            className="mt-1.5 text-sm leading-relaxed text-slate-600"
            dangerouslySetInnerHTML={{ __html: highlightNumbers(h.similarity_summary) }}
          />
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

  useEffect(() => {
    // Simulate loading initial data
    const timer = setTimeout(() => {
      setBootstrapping(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setReport(MOCK_REPORT);
      toast.success("AI Risk Assessment generated.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  };

  const majorCount = report ? MOCK_MAJOR_COUNT : 0;
  const minorCount = report ? MOCK_MINOR_COUNT : 0;

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
    writeKv("Populations at Risk", report.populations_at_risk.toLocaleString());
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
    report.recommendations_list.forEach((r) => {
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
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
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
              Multi-source intelligence aggregator. Synthesizes USGS, NOAA, NASA FIRMS,
              FEMA and InciWeb signals into a structured situational report.
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

            <KpiCard label="Populations at Risk" icon={Users}>
              <p className="text-3xl font-extrabold tabular-nums text-slate-800">
                {report.populations_at_risk.toLocaleString()}
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Estimated across affected zones
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
                  Active threats grouped by category
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
                    Prioritized action plan · review and deploy
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold uppercase bg-slate-50 text-slate-600 border-slate-200">
                {report.recommendations_list.length} actions
              </Badge>
            </div>

            <ol className="space-y-3">
              {report.recommendations_list.map((rec, i) => {
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
                      <p
                        className="text-sm leading-relaxed text-slate-700"
                        dangerouslySetInnerHTML={{ __html: highlightNumbers(rec.action) }}
                      />
                    </div>
                    {rec.deployable && (
                      <Button
                        size="sm"
                        onClick={() => toast.success("Resources deployed (simulated).")}
                        className="h-8 shrink-0 rounded-lg bg-[#33375D] px-3 text-[11px] font-bold text-white hover:bg-[#2A2E4D]"
                      >
                        <Rocket className="mr-1.5 h-3.5 w-3.5" />
                        Deploy Resources
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>

          <p className="text-center text-[11px] text-slate-400">
            Last assessment generated {new Date(report.generated_at).toLocaleString()} · {report.sources_count} signals · {report.alerts_count} incidents
          </p>
        </div>
      )}
    </div>
  );
}
