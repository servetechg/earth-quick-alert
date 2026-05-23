export interface RecommendationItem {
  priority: 'IMMEDIATE' | 'URGENT' | 'STANDARD';
  action: string;
  deployable: boolean;
  step?: number;
}

export type UnifiedEventSource =
  | 'nws' | 'fema' | 'usgs' | 'earthquake' | 'noaa_ncei'
  | 'noaa_nwis' | 'nwps' | 'nasa_firms' | 'inciweb' | 'manual' | 'seed';

export const SOURCE_LABEL_MAP: Record<UnifiedEventSource, { label: string; tone: string }> = {
  nws:        { label: 'NWS',         tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  fema:       { label: 'FEMA',        tone: 'bg-red-50 text-red-700 border-red-200' },
  usgs:       { label: 'USGS',        tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  earthquake: { label: 'USGS Quakes', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  noaa_ncei:  { label: 'NOAA NCEI',   tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  noaa_nwis:  { label: 'NOAA NWIS',   tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  nwps:       { label: 'NOAA NWPS',   tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  nasa_firms: { label: 'NASA FIRMS',  tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  inciweb:    { label: 'InciWeb',     tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  manual:     { label: 'Manual',      tone: 'bg-slate-50 text-slate-700 border-slate-200' },
  seed:       { label: 'Seed',        tone: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export interface EventGroupSummary {
  name: string;
  source: UnifiedEventSource;
  severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
  primaryLocation: string;
  state?: string;
  affectedCounties: string[];
  duplicateCount: number;
  lat?: number;
  lng?: number;
  hasCoordinates: boolean;
  formattedTimestamp: string;
}

/** One severity bucket from the new /summary endpoint */
export interface SeverityCategoryItem {
  category: string;
  eventCount: number;
  groupCount: number;
  bullets: string[];
  groups: EventGroupSummary[];
  events?: unknown[];
}

export interface SeverityBucket {
  severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
  categories: SeverityCategoryItem[];
}

/** Payload returned by GET /api/risk-assessment/summary */
export interface RiskSummaryPayload {
  generated_at: string;
  overall_risk_level: string;
  alerts_count: number;
  major_incidents: number;
  minor_incidents: number;
  incident_distribution: DistroPoint[];
  active_categories: string[];
  active_severities: string[];
  ai_confidence: number;
  populations_at_risk: number;
  sources_count: number;
  /** False when OPENAI_API_KEY is unset — UI shows a banner and deterministic fallbacks are used. Added by /summary route, not by computeRiskSnapshot. */
  ai_available?: boolean;
}

/** Payload returned by POST /api/risk-assessment/historical/[category] */
export interface HistoricalTabPayload {
  category: string;
  historical_analysis: HistoricalAnalysis;
  hasSimilarPast: boolean;
  recommendations_list?: RecommendationItem[];
}

export interface DomainSeverities {
  meteorological?: string;
  hydrological?: string;
  fire?: string;
}

export interface DistroPoint {
  category: string;
  count: number;
}

export interface HistoricalAnalysis {
  matched_event?: string;
  match_confidence?: number;
  similarity_summary?: string;
  past_damages?: string[];
  past_procedures?: string[];
  current_procedures?: string[];
  future_measures?: string[];
}

/** Tabs under Historical Context — one per bar-chart incident family; only categories with live ingest lines are emitted in `historical_analysis_by_incident`. */
export const INCIDENT_HISTORY_TAB_KEYS = [
  'flood',
  'tornado',
  'storm',
  'hazardous',
  'coastal_surf',
  'marine',
  'wildfire',
  'earthquake',
  'hurricane_typhoon',
  'tsunami',
  'volcanic',
  'landslide',
  'winter_weather',
  'air_quality',
  'extreme_heat',
  'fema_declaration',
] as const;

export type IncidentHistoryCategory = (typeof INCIDENT_HISTORY_TAB_KEYS)[number];

/** County / parish ACS resolution used for population estimate (see `risk-exposure-service`). */
export interface RiskExposureCountyRow {
  stateAbbr: string;
  countyStem: string;
  label: string;
  population: number;
}

export interface RiskExposureCentroid {
  lat: number;
  lon: number;
  radiusKm: number;
  label?: string;
}

export interface RiskExposureSnapshot {
  /** Sum of ACS B01003 totals for resolved counties / parishes (approx. people in named jurisdictions). */
  populationAffectedEstimate: number;
  censusVintageLabel: string;
  countiesResolved: RiskExposureCountyRow[];
  /** Hint strings for tooling / UI. */
  countyHintsApplied: string[];
  /** Counties / parishes parsed from feeds (used to match users when ACS row missing). */
  countyMatchHints: { stateAbbr: string; countyStem: string }[];
  centroids: RiskExposureCentroid[];
  dashboardStateCd: string;
}

export interface RiskReport {
  id: string;
  generated_at: string;
  overall_risk_level: string;
  ai_confidence: number;
  populations_at_risk: number;
  /** Approved app users inferred inside exposure counties or proximity buffers. */
  ready2go_users_reachable?: number;
  domain_severities: DomainSeverities;
  meteorological_findings: string[];
  hydrological_findings: string[];
  fire_findings: string[];
  recommendations_list: RecommendationItem[];
  incident_distribution: DistroPoint[];
  historical_analysis: HistoricalAnalysis;
  /** Per hazard tab: matched event / playbook vs live findings in `current_procedures`. */
  historical_analysis_by_incident?: Partial<
    Record<IncidentHistoryCategory, HistoricalAnalysis>
  >;
  sources_count: number;
  alerts_count: number;
  meteorological_summary: string;
  hydrological_risk: string;
  fire_threats: string;
  recommendations: string;
  /** Optional counts for KPI row / PDF */
  major_incidents?: number;
  minor_incidents?: number;
}

export interface IngestSourceResult<T = unknown> {
  ok: boolean;
  source: string;
  error?: string;
  data?: T;
  summary?: string;
  /** VIIRS hotspot row count before narrative grouping (NASA FIRMS only). */
  signalCount?: number;
}

export interface DashboardIngestBundle {
  stateCd: string;
  nwpsGaugeId: string;
  usgsSite?: string;
  /** Nationwide vs single-state AOI (AI ingest); drives NWS/USGS/NWPS scope. */
  ingestScope?: 'nationwide' | 'state';
  /** ISO timestamp when ingest ran */
  ingestedAt: string;
  sources: IngestSourceResult[];
  /** Compact text for LLM */
  narrative: string;
  successfulSources: number;
  totalSignals: number;
  /** ACS-based population in inferred hazard counties + centroids for Mongo user matching. */
  riskExposure?: RiskExposureSnapshot | null;
}
