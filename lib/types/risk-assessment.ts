export interface RecommendationItem {
  priority: 'IMMEDIATE' | 'URGENT' | 'STANDARD';
  action: string;
  deployable: boolean;
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
