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

/**
 * A single real past event resolved from a live historical API.
 * The complete structured data is passed to OpenAI, which decides what statistics
 * to extract and how to present them — no pre-formatting by the server.
 */
export interface PastHazardEvent {
  category: IncidentHistoryCategory;
  /** e.g. "M6.4 — Ridgecrest, California" or "SEVERE STORMS AND TORNADOES — Louisiana" */
  eventName: string;
  /** Friendly date string, e.g. "July 4, 2019" */
  occurredAt: string;
  location: string;
  /** e.g. "M6.4", "EF3", "70 mph wind", "2.50 in hail" */
  magnitude?: string;
  source: 'USGS_ARCHIVE' | 'NCEI_STORM_EVENTS' | 'FEMA_OPENFEMA';
  sourceUrl?: string;
  /** All available statistics — AI extracts what is relevant for the report. */
  stats: {
    deathsDirect?: number;
    injuriesDirect?: number;
    /** Raw NCEI string like "2.90M" or "15.00K" */
    propertyDamage?: string;
    cropDamage?: string;
    /** USGS PAGER alert level: green / yellow / orange / red */
    alertLevel?: string;
    /** FEMA: total federal assistance approved in USD */
    federalAidApprovedUSD?: number;
    /** FEMA: number of individual assistance applications approved */
    individualApplicationsApproved?: number;
    disasterNumber?: number;
    programsActivated?: string[];
    /** Truncated event narrative from NCEI (max 400 chars) */
    narrative?: string;
  };
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

/** Tabs under Historical Context — one per bar-chart incident family. */
export const INCIDENT_HISTORY_TAB_KEYS = [
  'flood',
  'tornado',
  'storm',
  'hazardous',
  'coastal_surf',
  'marine',
  'wildfire',
  'earthquake',
] as const;

export type IncidentHistoryCategory = (typeof INCIDENT_HISTORY_TAB_KEYS)[number];

/** Past hazard context for external AI (no live `current_procedures`). */
export interface RiskAiPastBlock {
  matched_event?: string;
  similarity_summary?: string;
  past_damages?: string[];
  past_procedures?: string[];
  future_measures?: string[];
  /** Real historical events (complete structured data) — OpenAI reads these to extract statistics. */
  events?: PastHazardEvent[];
}

/** Nationwide or state AOI for AI context packs. */
export type RiskAiContextScope = 'nationwide' | 'state';

export interface RiskAiPastContext {
  scope: RiskAiContextScope;
  state_cd: string;
  ingested_at: string;
  /** FEMA OpenFEMA flood declaration lines from this ingest pull (grounded past signal). */
  fema_flood_declarations?: string[];
  rollup: RiskAiPastBlock;
  by_incident: Partial<Record<IncidentHistoryCategory, RiskAiPastBlock>>;
}

/** Exactly what we send to OpenAI before the executive report is generated. */
export interface RiskAiOpenAiInput {
  past: RiskAiPastContext;
  current: RiskAiCurrentContext;
}

/** Live operational picture for external AI (findings, ingest, current procedures). */
export interface RiskAiCurrentContext {
  scope: RiskAiContextScope;
  state_cd: string;
  ingested_at: string;
  /** Multi-feed ingest text (same family as internal LLM input). */
  ingest_narrative: string;
  rollup: { current_procedures?: string[] };
  by_incident: Partial<Record<IncidentHistoryCategory, { current_procedures?: string[] }>>;
  findings: {
    meteorological: string[];
    hydrological: string[];
    fire: string[];
  };
  summaries: {
    meteorological: string;
    hydrological: string;
    fire: string;
    recommendations: string;
  };
  incident_distribution: DistroPoint[];
  alerts_count: number;
  domain_severities: DomainSeverities;
  overall_risk_level: string;
  recommendations_list: RecommendationItem[];
  populations_at_risk: number;
  ready2go_users_reachable: number;
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
