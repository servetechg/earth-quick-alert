import { Alert, AlertSeverity, AlertSource, SocialMediaAlert, ResourceAlert } from '@/lib/types/api-alerts';
import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import { formatEventTimestamp } from '@/lib/services/event-formatters';
import type {
    BulletWithRefs,
    DashboardIngestBundle,
    HistoricalAnalysis,
    IncidentHistoryCategory,
    RecommendationItem,
    RiskReport,
} from '@/lib/types/risk-assessment';
import { INCIDENT_HISTORY_TAB_KEYS } from '@/lib/types/risk-assessment';

function normalizeRecommendationPriority(p: string | undefined): RecommendationItem['priority'] {
    const u = String(p ?? 'STANDARD').toUpperCase().trim();
    if (u === 'IMMEDIATE' || u.startsWith('IMMEDIATE')) return 'IMMEDIATE';
    if (u === 'URGENT' || u === 'URGENCY' || u.startsWith('URGENT')) return 'URGENT';
    return 'STANDARD';
}
import {
    aggregateSeverityPressure,
    applyDynamicExecutiveKpis,
    deriveDynamicAiConfidence,
    deriveDynamicOverallThreatLevel,
    deriveMajorMinorSplit,
} from '@/lib/services/risk-kpi-dynamic';
import { deriveEventBasedIncidentDistribution } from '@/lib/services/risk-event-distribution';
import { buildLiveHistoricalContext } from '@/lib/services/risk-historical-context';
import { normalizeAiBullet, normalizeAiBulletList } from '@/lib/utils/normalize-ai-text';

export interface EmergencyInsights {
    status: 'All Clear' | 'Warning' | 'Emergency';
    message: string;
    recommendations: string[];
}

export interface DynamicNews {
    title: string;
    category: 'Traffic' | 'Community' | 'Safety' | 'Emergency';
    time: string;
    img: string;
}

export interface PreparednessTip {
    title: string;
    desc: string;
}

export interface ThreatAssessment {
    relevance: 'High' | 'Medium' | 'Low';
    severity: string;
    affectedAreas: string;
    confidence: number;
    summary: string;
}

export interface AfterActionInsight {
    id: string;
    category: string;
    description: string;
    status: 'Pending' | 'Addressed';
}

export interface OperationalSignals {
    socialSignalLevel: 'normal' | 'elevated' | 'critical';
    hospitalCapacityLevel: 'normal' | 'stressed' | 'overloaded';
    recommendVirtualEOC: boolean;
    rationale: string;
}

/** Emergency-plan attachment integrity (PDF / DOCX / CSV / XLSX). */
export interface CoopAttachmentIntegrity {
    status: 'In Sync' | 'Reviewing' | 'Deviation Found';
    score: number;
    summary: string;
}

/** AI-inferred metadata for a freshly uploaded continuity-vault file. */
export interface CoopPlanMetadata {
    planId: string;
    label: string;
    category: 'coop' | 'bcp' | 'compliance';
    overview: string;
}

/** Audit summary for the entire continuity-plan inventory shown on the admin emergency-plan page. */
export interface ContinuityAuditSummary {
    summary: string;
    findings: string[];
    posture: 'Resilient' | 'Steady' | 'At Risk';
    averageScore: number;
}

export interface ContinuityAuditInput {
    totals: {
        plans: number;
        attachments: number;
        analyzed: number;
    };
    averageScore: number;
    counts: {
        coop: number;
        bcp: number;
        compliance: number;
        response: number;
    };
    integrity: {
        compliant: number;
        underReview: number;
        nonCompliant: number;
        unanalyzed: number;
    };
    plans: Array<{
        planId: string;
        label: string;
        category: 'coop' | 'bcp' | 'compliance' | 'response';
        attachmentCount: number;
        stepCount: number;
        attachments: Array<{
            fileName: string;
            status?: string;
            score?: number;
            summary?: string;
        }>;
    }>;
}

type ChatMessage = {
    role: 'system' | 'user';
    content: string;
};

/**
 * Plain-English writing rules shared by every public-facing report section
 * (executive risk report + Historical Context). Keeps the voice consistent.
 */
const PLAIN_ENGLISH_STYLE_RULES = `WRITING STYLE — this report is read by ordinary members of the public, not specialists. Every finding, summary, recommendation, and historical-analysis sentence MUST be understandable by someone with no emergency-management, weather, or science background:
- Write in plain, everyday English using complete, self-explanatory sentences.
- Do not use jargon, acronyms, or agency codes (such as NWPS, USGS, FIRMS, WFIGS, ICS, EOC, AOI, SCADA, URM, PSAP, WUI, SAR, LiDAR, cfs, kcfs, "stage", "gage") without explaining them in plain words — prefer the plain term outright.
- When a technical number or measurement is unavoidable, explain what it means right after it. Examples: "a river flow of 10,200 cubic feet per second (very high — well above the normal range)", "a magnitude 5.1 earthquake (moderate — felt widely and can damage weaker buildings)", "30% contained (crews have a fire line around roughly a third of the fire's edge)".
- Emphasize place names, what is happening, who or what it affects, and timing. Never output raw GPS coordinates.
- Keep each bullet to one or two short, clear sentences.`;

export interface IncidentDetailNarrative {
    overview: string;
    currentStatus: string;
    affectedAreas: string;
    keyStatistics: string;
    historicalContext: string;
    /** Optional survey/path segment lines (demo scenarios). */
    pathSegments?: string[];
}

export class OpenAIService {
    private apiKey = process.env.OPENAI_API_KEY || '';
    private model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    private canUseOpenAI(): boolean {
        return Boolean(this.apiKey);
    }

    isAvailable(): boolean {
        return this.canUseOpenAI();
    }

    private async callOpenAI<T>(
        messages: ChatMessage[],
        fallback: T,
        options?: { max_tokens?: number; model?: string; temperature?: number }
    ): Promise<T> {
        if (!this.canUseOpenAI()) {
            return fallback;
        }

        const effectiveModel = options?.model || this.model;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: effectiveModel,
                    messages,
                    response_format: { type: 'json_object' },
                    ...(typeof options?.max_tokens === 'number' ? { max_tokens: options.max_tokens } : {}),
                    ...(typeof options?.temperature === 'number' ? { temperature: options.temperature } : {}),
                }),
            });

            if (!response.ok) {
                throw new Error(`OpenAI request failed: ${response.status}`);
            }

            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content;

            if (!content) {
                return fallback;
            }

            return JSON.parse(content) as T;
        } catch (error) {
            return fallback;
        }
    }

    private countHighRiskAlerts(alerts: Alert[]): number {
        return alerts.filter(alert =>
            [AlertSeverity.SEVERE, AlertSeverity.EXTREME, AlertSeverity.HIGH].includes(alert.severity)
        ).length;
    }

    detectOperationalSignals(input: {
        alerts: Alert[];
        incidentCount: number;
        safeCheckins: number;
        totalUsers: number;
    }): OperationalSignals {
        const highRiskAlerts = this.countHighRiskAlerts(input.alerts);
        const unsafeUsers = Math.max(input.totalUsers - input.safeCheckins, 0);
        const unsafeRatio = input.totalUsers > 0 ? unsafeUsers / input.totalUsers : 0;

        const socialSignalLevel: OperationalSignals['socialSignalLevel'] =
            input.incidentCount > 30 || highRiskAlerts > 20 || unsafeRatio > 0.35
                ? 'critical'
                : input.incidentCount > 10 || highRiskAlerts > 8 || unsafeRatio > 0.15
                    ? 'elevated'
                    : 'normal';

        const hospitalCapacityLevel: OperationalSignals['hospitalCapacityLevel'] =
            highRiskAlerts > 25 || input.incidentCount > 40
                ? 'overloaded'
                : highRiskAlerts > 10 || input.incidentCount > 15
                    ? 'stressed'
                    : 'normal';

        const recommendVirtualEOC =
            socialSignalLevel !== 'normal' ||
            hospitalCapacityLevel !== 'normal' ||
            unsafeRatio > 0.2;

        const rationale = recommendVirtualEOC
            ? 'Escalation indicators detected from incident tempo, alert severity, and community check-ins.'
            : 'No systemic escalation indicators detected; monitoring can remain in standard operations mode.';

        return {
            socialSignalLevel,
            hospitalCapacityLevel,
            recommendVirtualEOC,
            rationale,
        };
    }

    async generateThreatAssessment(location: string, weatherData: any, earthquakeData: any[]): Promise<ThreatAssessment> {
        const weatherCount = Array.isArray(weatherData) ? weatherData.length : 0;
        const quakeCount = Array.isArray(earthquakeData) ? earthquakeData.length : 0;
        const extremeSignals = (Array.isArray(weatherData) ? weatherData : []).filter(
            (item: any) => item.severity === AlertSeverity.EXTREME || item.severity === AlertSeverity.SEVERE
        ).length;

        const fallback: ThreatAssessment = {
            relevance: extremeSignals > 0 || quakeCount > 0 ? 'High' : weatherCount > 0 ? 'Medium' : 'Low',
            severity: extremeSignals > 0 ? 'Immediate Hazard' : weatherCount > 0 || quakeCount > 0 ? 'Monitoring Required' : 'Stable',
            affectedAreas: location,
            confidence: extremeSignals > 0 ? 92 : weatherCount > 0 || quakeCount > 0 ? 82 : 74,
            summary: extremeSignals > 0
                ? 'Severe alert signals detected; immediate readiness actions are recommended.'
                : weatherCount > 0 || quakeCount > 0
                    ? 'Active hazard signals detected; continue close monitoring and preparedness actions.'
                    : 'No immediate hazard indicators detected at this time.',
        };

        return this.callOpenAI<ThreatAssessment>([
            {
                role: 'system',
                content: 'You are an emergency risk analyst. Return valid JSON only with keys: relevance, severity, affectedAreas, confidence, summary.',
            },
            {
                role: 'user',
                content: `Location: ${location}\nWeather Alerts: ${JSON.stringify(weatherData)}\nEarthquake Alerts: ${JSON.stringify(earthquakeData)}\nAssess risk.`,
            },
        ], fallback);
    }

    async generateEmergencyInsights(weatherData: any, earthquakeData: any[]): Promise<EmergencyInsights> {
        const weatherAlerts = Array.isArray(weatherData) ? weatherData : [];
        const quakeAlerts = Array.isArray(earthquakeData) ? earthquakeData : [];
        const severeCount = [...weatherAlerts, ...quakeAlerts].filter(
            (item: any) => item.severity === AlertSeverity.SEVERE || item.severity === AlertSeverity.EXTREME
        ).length;

        const fallback: EmergencyInsights = severeCount > 0
            ? {
                status: 'Emergency',
                message: 'High-severity hazards are active. Immediate protective actions are advised.',
                recommendations: [
                    'Activate incident coordination and verify responder availability.',
                    'Push immediate public guidance for sheltering or evacuation.',
                    'Track hospital and shelter capacity every 15 minutes.',
                ],
            }
            : weatherAlerts.length + quakeAlerts.length > 0
                ? {
                    status: 'Warning',
                    message: 'Active hazard indicators detected. Stay alert and keep response assets ready.',
                    recommendations: [
                        'Monitor official alerts and operational dashboards continuously.',
                        'Prepare escalation messaging for impacted zones.',
                        'Validate critical infrastructure readiness status.',
                    ],
                }
                : {
                    status: 'All Clear',
                    message: 'No immediate high-risk hazard indicators are active.',
                    recommendations: [
                        'Continue routine monitoring of official feeds.',
                        'Review preparedness resources with community members.',
                        'Validate emergency communication channels daily.',
                    ],
                };

        return this.callOpenAI<EmergencyInsights>([
            {
                role: 'system',
                content: 'You are an emergency operations AI. Return valid JSON with keys: status, message, recommendations.',
            },
            {
                role: 'user',
                content: `Weather data: ${JSON.stringify(weatherData)}\nEarthquake data: ${JSON.stringify(earthquakeData)}\nGenerate concise operational guidance.`,
            },
        ], fallback);
    }

    async generateDynamicNews(location: string): Promise<DynamicNews[]> {
        const fallback: DynamicNews[] = [
            {
                title: `Emergency coordinators issue preparedness reminder for ${location}`,
                category: 'Safety',
                time: '1 hour ago',
                img: 'https://images.unsplash.com/photo-1510442650500-93217e634e4c?w=600&h=400&fit=crop',
            },
            {
                title: `Traffic control updates released for evacuation corridors near ${location}`,
                category: 'Traffic',
                time: '3 hours ago',
                img: 'https://images.unsplash.com/photo-1541888946425-d81bb19440f4?w=600&h=400&fit=crop',
            },
            {
                title: `Community volunteers mobilized to support relief logistics in ${location}`,
                category: 'Community',
                time: '6 hours ago',
                img: 'https://images.unsplash.com/photo-1511673319455-2117e221146c?w=600&h=400&fit=crop',
            },
        ];

        const result = await this.callOpenAI<{ news: DynamicNews[] }>([
            {
                role: 'system',
                content: 'Return valid JSON with key "news" as an array of 3 items. Each item must have title, category, time, img.',
            },
            {
                role: 'user',
                content: `Create realistic emergency management news updates for ${location}.`,
            },
        ], { news: fallback });

        return Array.isArray(result.news) && result.news.length > 0 ? result.news : fallback;
    }

    async generateSocialMediaPosts(location: string = 'your area'): Promise<SocialMediaAlert[]> {
        const prompt = `Generate 5 realistic social media posts (X, Facebook, Instagram) about a current emergency or safety situation in ${location}. 
        Return a JSON object with a "posts" array. Each post must follow the SocialMediaAlert interface:
        - id: string
        - source: "social_media"
        - platform: "X" | "Facebook" | "Instagram"
        - severity: "info" | "low" | "moderate" | "high" | "severe" | "extreme"
        - title: string (short catchy summary)
        - description: string (the actual post content)
        - author: string
        - handle: string (optional)
        - timestamp: ISO string (recent)
        - engagement: { likes: number, shares: number }`;

        const result = await this.callOpenAI<{ posts: any[] }>([{ role: 'system', content: 'You are an emergency management AI.' }, { role: 'user', content: prompt }], { posts: [] });
        
        return (result.posts || []).map(p => ({
            ...p,
            source: AlertSource.SOCIAL_MEDIA,
            timestamp: p.timestamp || new Date().toISOString(),
        })) as SocialMediaAlert[];
    }

    async generateFuelStatus(location: string = 'your area'): Promise<ResourceAlert[]> {
        const prompt = `Generate 4 realistic gas station fuel availability reports for ${location} during an emergency.
        Return a JSON object with a "reports" array. Each report must follow the ResourceAlert interface:
        - id: string
        - source: "gas_buddy"
        - resourceType: "fuel"
        - severity: "info" | "low" | "moderate" | "high"
        - title: string (Station name, e.g. "Chevron on 5th")
        - description: string (Detailed status, e.g. "Has regular and diesel, premium sold out")
        - subTitle: string (Quick price/status, e.g. "$4.55/gal - Normal lines")
        - status: "available" | "limited" | "closed"
        - locationName: string (Specific address or cross streets)
        - timestamp: ISO string (now)
        - coordinates: { lat: number, lon: number } (make them near ${location})`;

        const fallback: { reports: any[] } = { reports: [] };
        const result = await this.callOpenAI<{ reports: any[] }>([{ role: 'system', content: 'You are an emergency resource tracking AI.' }, { role: 'user', content: prompt }], fallback);
        return (result.reports || []).map(r => ({
            ...r,
            source: AlertSource.GAS_BUDDY,
            timestamp: r.timestamp || new Date().toISOString(),
        })) as ResourceAlert[];
    }

    async generateLodgingStatus(location: string = 'your area'): Promise<ResourceAlert[]> {
        const prompt = `Generate 4 realistic hotel/shelter availability reports for ${location} during an emergency.
        Return a JSON object with a "reports" array. Each report must follow the ResourceAlert interface:
        - id: string
        - source: "hotel_api"
        - resourceType: "lodging"
        - severity: "info" | "low" | "moderate" | "high"
        - title: string (Hotel name, e.g. "Hilton Downtown")
        - description: string (Room status, e.g. "Pet friendly, 5 king rooms remaining")
        - subTitle: string (Quick status, e.g. "Open - 12 rooms left")
        - status: "available" | "limited" | "closed"
        - locationName: string (Specific address)
        - timestamp: ISO string (now)
        - coordinates: { lat: number, lon: number } (make them near ${location})`;

        const fallback: { reports: any[] } = { reports: [] };
        const result = await this.callOpenAI<{ reports: any[] }>([{ role: 'system', content: 'You are an emergency lodging coordinator AI.' }, { role: 'user', content: prompt }], fallback);
        return (result.reports || []).map(r => ({
            ...r,
            source: AlertSource.HOTEL_API,
            timestamp: r.timestamp || new Date().toISOString(),
        })) as ResourceAlert[];
    }

    async generatePreparednessTips(location: string, weatherData: any): Promise<PreparednessTip[]> {
        const fallback: PreparednessTip[] = [
            { title: 'Communication Readiness', desc: 'Keep emergency contacts and check-in channels updated.' },
            { title: 'Supplies Check', desc: 'Maintain a 72-hour supply of water, food, and essential medications.' },
            { title: 'Evacuation Awareness', desc: 'Confirm your primary and backup evacuation routes.' },
        ];

        const result = await this.callOpenAI<{ tips: PreparednessTip[] }>([
            {
                role: 'system',
                content: 'Return valid JSON with key "tips" as an array of 3 concise preparedness tips.',
            },
            {
                role: 'user',
                content: `User location: ${location}. Weather context: ${JSON.stringify(weatherData)}. Generate practical preparedness tips.`,
            },
        ], { tips: fallback });

        return Array.isArray(result.tips) && result.tips.length > 0 ? result.tips : fallback;
    }

    async generateEOCInsights(incidentStats: any, alertStats: any): Promise<string[]> {
        const fallback = [
            'Monitor severe alerts and responder availability continuously.',
            'Prioritize zones with rising incident and alert density.',
            'Review shelter and medical resource capacity every cycle.',
        ];

        const result = await this.callOpenAI<{ insights: string[] }>([
            {
                role: 'system',
                content: 'Return valid JSON with key "insights" as an array of 3 short operational insights.',
            },
            {
                role: 'user',
                content: `Incident stats: ${JSON.stringify(incidentStats)}\nAlert stats: ${JSON.stringify(alertStats)}\nGenerate 3 concise operational insights.`,
            },
        ], { insights: fallback });

        return Array.isArray(result.insights) && result.insights.length > 0 ? result.insights : fallback;
    }

    async generateAfterActionInsights(context: {
        incidentType: string;
        timelineEvents: number;
        incidentReports: number;
        highSeverityAlerts: number;
    }): Promise<AfterActionInsight[]> {
        const fallback: AfterActionInsight[] = [
            {
                id: 'AAR-001',
                category: 'Response Efficiency',
                description: 'Track dispatch-to-arrival delay trends for rapid response optimization.',
                status: 'Pending',
            },
            {
                id: 'AAR-002',
                category: 'Communication',
                description: 'Increase early-stage public messaging cadence during hazard escalation.',
                status: 'Addressed',
            },
            {
                id: 'AAR-003',
                category: 'Resource Allocation',
                description: 'Pre-stage medical and shelter resources in historically impacted zones.',
                status: 'Pending',
            },
        ];

        const result = await this.callOpenAI<{ insights: AfterActionInsight[] }>([
            {
                role: 'system',
                content: 'Return valid JSON with key "insights" as an array. Each item has id, category, description, status ("Pending" or "Addressed").',
            },
            {
                role: 'user',
                content: `Generate after-action insights for incident context: ${JSON.stringify(context)}.`,
            },
        ], { insights: fallback });

        return Array.isArray(result.insights) && result.insights.length > 0 ? result.insights : fallback;
    }

    buildSignalsFromAlertSet(alerts: Alert[], incidentCount: number, safeCheckins: number, totalUsers: number): OperationalSignals {
        return this.detectOperationalSignals({
            alerts,
            incidentCount,
            safeCheckins,
            totalUsers,
        });
    }

    async generateCountryStatus(country: string, weatherData: any, earthquakeData: any[]): Promise<{
        summary: string;
        suggestedType?: string;
        suggestedMessage?: string;
    }> {
        const fallback = {
            summary: `Stability report for ${country}: Monitoring active hazards. Weather alerts are currently present in some sectors. No major seismic activity impacting operations.`,
            suggestedType: 'Severe Thunderstorm Warning',
            suggestedMessage: `Official NWS Alert for ${country}: Severe weather detected in region. Please monitor local conditions and follows safety protocols.`,
        };

        try {
            const result = await this.callOpenAI<{ 
                summary: string; 
                suggestedType: string; 
                suggestedMessage: string;
            }>([
                {
                    role: 'system',
                    content: 'You are a global emergency intelligence officer. Analyze the provided weather and earthquake data for the country and provide: 1) A concise professional summary. 2) A suggested NWS Alert Type from standard categories. 3) A drafted alert message (max 160 chars). Return valid JSON with keys: summary, suggestedType, suggestedMessage.',
                },
                {
                    role: 'user',
                    content: `Country: ${country}\nWeather Data: ${JSON.stringify(weatherData)}\nEarthquake Data: ${JSON.stringify(earthquakeData)}\nProvide intelligence report.`,
                },
            ], fallback);

            return {
                summary: result.summary || fallback.summary,
                suggestedType: result.suggestedType || fallback.suggestedType,
                suggestedMessage: result.suggestedMessage || fallback.suggestedMessage
            };
        } catch (error) {
            return fallback;
        }
    }

    async generateAlertLanguage(alertType: string, context?: string): Promise<string> {
        const fallback = `EMERGENCY ALERT: A ${alertType} has been issued. Seek shelter and monitor local communications for updates.`;

        try {
            const result = await this.callOpenAI<{ message: string }>([
                {
                    role: 'system',
                    content: 'You are an official Emergency Response Communications Officer. Generate a professional, authoritative, and concise emergency alert message (max 160 characters for SMS compatibility). Return JSON with key "message".',
                },
                {
                    role: 'user',
                    content: `Alert Type: ${alertType}\n${context ? `Additional Context: ${context}` : ''}\nGenerate the alert message.`,
                },
            ], { message: fallback });

            return result.message || fallback;
        } catch (error) {
            return fallback;
        }
    }

    splitAlertsBySource(alerts: Alert[]): { weather: Alert[]; earthquakes: Alert[]; social: Alert[]; resources: Alert[] } {
        return {
            weather: alerts.filter(alert => alert.source === AlertSource.WEATHER_API),
            earthquakes: alerts.filter(alert => alert.source === AlertSource.EARTHQUAKE_API),
            social: alerts.filter(alert => alert.source === AlertSource.SOCIAL_MEDIA),
            resources: alerts.filter(alert => alert.source === AlertSource.GAS_BUDDY || alert.source === AlertSource.HOTEL_API),
        };
    }

    /**
     * Dashboard A: fuse ingested USGS / NOAA / FEMA / FIRMS / InciWeb / ArcGIS summaries into the RiskReport UI shape.
     */
    /** Keeps `alerts_count` synced to bar chart + splits Major/Minor using feed-derived severity pressure (not a fixed 42%). */
    private alignAlertsToDistribution(r: RiskReport, bundle: DashboardIngestBundle): RiskReport {
        const d = r.incident_distribution ?? [];
        const sum = d.reduce((acc, x) => acc + Math.max(0, Math.floor(Number(x.count) || 0)), 0);
        if (sum < 1) return r;
        const alerts_count = Math.min(500, sum);
        const { major_incidents, minor_incidents } = deriveMajorMinorSplit(bundle, alerts_count);
        return { ...r, alerts_count, major_incidents, minor_incidents };
    }

    async synthesizeDashboardRiskReport(bundle: DashboardIngestBundle): Promise<RiskReport> {
        const fallbackHeuristic = this.alignAlertsToDistribution(this.heuristicDashboardRiskReport(bundle), bundle);
        const fallbackKpis = applyDynamicExecutiveKpis(bundle, fallbackHeuristic);
        // Live-data-only historical scaffold — never the static copyFor* playbook prose.
        const fallback: RiskReport = {
            ...fallbackKpis,
            ...buildLiveHistoricalContext(bundle, fallbackKpis),
        };
        if (!this.canUseOpenAI()) return fallback;

        const narrative = bundle.narrative.slice(0, 16000);
        const schemaHint = `Return ONE JSON object at the root with these keys exactly:
id (string), generated_at (ISO string), overall_risk_level (one of: LOW, MODERATE, ELEVATED, HIGH, SEVERE, CRITICAL),
ai_confidence (0-100), populations_at_risk (number estimate),
domain_severities: { meteorological, hydrological, fire } each short label like Monitor|Elevated|High Risk|Critical,
meteorological_findings (string array — executive briefing sentences; prefer place names over raw lat/long; earthquakes as magnitude + location + time prose),
hydrological_findings (string array — river/gauge-centric sentences; cfs, flood stage context; no coordinate dumps unless essential),
fire_findings (string array — named incidents, acres, containment; satellite cues as sectors—avoid bare lat/lon lists),
recommendations_list: array of { priority: IMMEDIATE|URGENT|STANDARD exactly (never URGENCY or other synonyms), action: string, deployable: boolean },
incident_distribution: optional — server recomputes unique event counts per category from ingest (you may omit),
historical_analysis: omit — the server generates the Historical Context section in a separate dedicated pass,
sources_count (number, successful feeds was ${bundle.successfulSources}),
alerts_count: optional — server sets from incident_distribution,
meteorological_summary, hydrological_risk, fire_threats, recommendations (short paragraph strings),
major_incidents, minor_incidents (numbers for KPI breakdown).`;

        const stateOnly =
            bundle.ingestScope === 'state'
                ? ` Jurisdiction is single-state (${bundle.stateCd?.toUpperCase() ?? 'state AOI'}): cite only hazards inside that state from the ingest summaries; do not mention Alaska, California, or other states unless explicitly in the data for this AOI.`
                : '';

        const result = await this.callOpenAI<RiskReport>(
            [
                {
                    role: 'system',
                    content:
                        `You are Ready2Go emergency intelligence. Output only valid JSON matching the user schema at the root (no wrapper keys). Ground every finding in the ingested data; mark uncertainty where feeds conflict or are missing, and never invent specific incidents not supported by the summaries.

${PLAIN_ENGLISH_STYLE_RULES}${stateOnly}`,
                },
                {
                    role: 'user',
                    content: `${schemaHint}\n\nINGEST_SCOPE=${bundle.ingestScope ?? 'nationwide'}\nCONTEXT_STATE_OR_US=${bundle.stateCd}\nNWPS_PRIMARY_OR_SAMPLE_LID=${bundle.nwpsGaugeId}\nUSGS_SITE_OR_EMPTY_FOR_SAMPLE=${bundle.usgsSite ?? ''}\nINGESTED_AT=${bundle.ingestedAt}\n\nDATA:\n${narrative}`,
                },
            ],
            fallback,
        );

        const merged = this.mergeRiskReport(fallback, result);
        const aligned = this.alignAlertsToDistribution(merged, bundle);
        const withKpis = applyDynamicExecutiveKpis(bundle, aligned);
        // Live-data-only scaffold: current procedures + confidence only. Every narrative field
        // is written by the AI below — the static copyFor* templates are never shown to users.
        const withHistory: RiskReport = {
            ...withKpis,
            ...buildLiveHistoricalContext(bundle, withKpis),
        };
        const aiHistory = await this.generateHistoricalContext(bundle, withHistory);
        return { ...withHistory, ...aiHistory };
    }

    /**
     * Dedicated OpenAI pass that GENERATES the public Historical Context
     * (rollup + per-incident tabs) from live ingest data — plain English,
     * scope-aware length caps, **bold** highlights. `current_procedures` comes
     * from live ingest; every narrative field is written entirely by the model.
     * No static copyFor* playbook templates are used for displayed content.
     */
    async generateHistoricalContext(
        bundle: DashboardIngestBundle,
        report: RiskReport,
    ): Promise<Pick<RiskReport, 'historical_analysis' | 'historical_analysis_by_incident'>> {
        const draftRollup: HistoricalAnalysis = report.historical_analysis ?? {};
        const draftByIncident: Partial<Record<IncidentHistoryCategory, HistoricalAnalysis>> =
            report.historical_analysis_by_incident ?? {};

        const scope: 'state' | 'nationwide' = bundle.ingestScope === 'state' ? 'state' : 'nationwide';
        const rollupCap = scope === 'state' ? 4 : 3;
        const incidentCap = 3;

        // Without an API key there is no narrative — keep only the live scaffold.
        if (!this.canUseOpenAI()) {
            return {
                historical_analysis: draftRollup,
                historical_analysis_by_incident: report.historical_analysis_by_incident,
            };
        }

        const stateLabel =
            scope === 'state'
                ? (bundle.stateCd || '').toUpperCase() || 'the licensed state'
                : 'the United States (nationwide)';

        const lengthRules =
            scope === 'state'
                ? `- "rollup": at most ${rollupCap} bullets per list; each bullet 1-2 short sentences. "similarity_summary" at most 2 sentences.
- each "by_incident" block: at most ${incidentCap} bullets per list.
- Focus only on ${stateLabel}. Do not mention other states unless they appear in the live data below.`
                : `- "rollup": at most ${rollupCap} bullets per list; each bullet 1-2 short sentences. "similarity_summary" at most 2 sentences.
- each "by_incident" block: at most ${incidentCap} bullets per list.
- This is a nationwide report — summarize at a national or regional level and mention only the few most significant events. Do not list every state.`;

        const system = `You are Ready2Go emergency intelligence, writing the "Historical Context & Mitigation Strategy" section of a public emergency report.

${PLAIN_ENGLISH_STYLE_RULES}

YOUR TASK
Write this section from the live emergency data below. "LIVE_SITUATION" lists what is happening or being tracked right now for each hazard. From those facts and the DATA section, produce the analysis for the public.

OUTPUT — return ONLY this JSON object (no wrapper keys):
{"rollup": <BLOCK>, "by_incident": {"<category>": <BLOCK>, ...}}
Produce a "rollup" block (the whole-region overview) plus one "by_incident" block for EVERY category key listed in ACTIVE_HAZARDS — use those exact keys, and never add a hazard that is not listed. If ACTIVE_HAZARDS is empty, return "by_incident" as {}.
Each <BLOCK> has exactly these keys:
- "matched_event": string — a short, plain headline naming the kind of past situation today's conditions most resemble.
- "similarity_summary": string — 1-2 plain sentences explaining, in everyday words, why today's conditions resemble that kind of past situation.
- "past_damages": string[] — the kinds of damage and disruption this type of hazard has caused in the past, in everyday terms.
- "past_procedures": string[] — the kinds of steps responders and officials have taken for this type of hazard in the past, in everyday terms.
- "current_procedures": string[] — rewrite the LIVE_SITUATION lines for this hazard into plain, complete sentences describing what is happening right now and who or where it affects. Use ONLY those lines; do not add anything they do not support.
- "future_measures": string[] — concrete, practical steps a community or household can take to be safer next time (for example: "Sign up for local emergency text alerts", "Keep a 3-day supply of drinking water"). Never policy or infrastructure jargon.
Do NOT output a "match_confidence" key — the server keeps its own value.

FORMATTING
- Wrap the crucial detail of each sentence in **double asterisks** — place names, dates and times, magnitudes, and severity words. Example: "A **Flood Warning** is active for **Clinton, Illinois** through **May 19, 2026**."
- Write every date and time in friendly form like "May 15, 2026, 10:23 PM" — never ISO timestamps, and never the words "Invalid Date".
- Never output raw GPS coordinates.

LENGTH
${lengthRules}

GROUNDING
Base "current_procedures" ONLY on the LIVE_SITUATION lines for that hazard. Base "matched_event", "similarity_summary", "past_damages", and "past_procedures" on how this type of hazard has typically behaved — do not fabricate specific named past disasters or invented dates. Never invent a hazard category that is not in ACTIVE_HAZARDS.`;

        const activeKeys = Object.keys(draftByIncident);
        const liveBlock = (label: string, lines?: string[]): string =>
            `${label}:\n${(lines && lines.length ? lines : ['(no live lines)']).join('\n')}`;
        const liveSituation = [
            liveBlock('ROLLUP', draftRollup.current_procedures),
            ...activeKeys.map((k) =>
                liveBlock(k, draftByIncident[k as IncidentHistoryCategory]?.current_procedures),
            ),
        ].join('\n\n');

        const user = `INGEST_SCOPE=${scope}
STATE=${bundle.stateCd ?? ''}

ACTIVE_HAZARDS — produce one "by_incident" block for each of these category keys, and no others:
${JSON.stringify(activeKeys)}

LIVE_SITUATION — what is happening or being tracked right now, grouped by hazard. Treat these as the ONLY current facts:
${liveSituation}

DATA — full ingest summary for background context:
${(bundle.narrative ?? '').slice(0, 8000)}`;

        type HistoryAiShape = {
            rollup?: Partial<HistoricalAnalysis>;
            by_incident?: Partial<Record<string, Partial<HistoricalAnalysis>>>;
        };

        const result = await this.callOpenAI<HistoryAiShape>(
            [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            { rollup: draftRollup, by_incident: draftByIncident },
            { model: this.model, max_tokens: 1800, temperature: 0.3 },
        );

        const historical_analysis = this.normalizeHistoricalAnalysis(
            result.rollup,
            draftRollup,
            rollupCap,
        );

        const incidentKeys = Object.keys(draftByIncident).filter((k): k is IncidentHistoryCategory =>
            (INCIDENT_HISTORY_TAB_KEYS as readonly string[]).includes(k),
        );
        let historical_analysis_by_incident: RiskReport['historical_analysis_by_incident'] =
            report.historical_analysis_by_incident;
        if (incidentKeys.length) {
            const out: Partial<Record<IncidentHistoryCategory, HistoricalAnalysis>> = {};
            for (const k of incidentKeys) {
                out[k] = this.normalizeHistoricalAnalysis(
                    result.by_incident?.[k],
                    draftByIncident[k] ?? {},
                    incidentCap,
                );
            }
            historical_analysis_by_incident = out;
        }

        return { historical_analysis, historical_analysis_by_incident };
    }

    /** Merge an AI-rewritten historical block over the deterministic draft, with array caps. */
    private normalizeHistoricalAnalysis(
        ai: Partial<HistoricalAnalysis> | undefined,
        deterministic: HistoricalAnalysis,
        cap: number,
    ): HistoricalAnalysis {
        const a = ai ?? {};
        const pickStr = (v: unknown, fb?: string): string | undefined => {
            const s = normalizeAiBullet(v);
            return s || (fb && fb.trim()) || undefined;
        };
        const pickArr = (v: unknown, fb: string[] | undefined): string[] | undefined => {
            const list = normalizeAiBulletList(v, cap);
            if (list.length) return list;
            return fb && fb.length ? fb : undefined;
        };

        // current_procedures: a capped AI summary wins; otherwise keep the full live ingest lines.
        const aiCurrent = normalizeAiBulletList(a.current_procedures, cap);
        const current_procedures = aiCurrent.length
            ? aiCurrent.slice(0, cap)
            : deterministic.current_procedures;

        return {
            matched_event: pickStr(a.matched_event, deterministic.matched_event),
            similarity_summary: pickStr(a.similarity_summary, deterministic.similarity_summary),
            past_damages: pickArr(a.past_damages, deterministic.past_damages),
            past_procedures: pickArr(a.past_procedures, deterministic.past_procedures),
            current_procedures,
            future_measures: pickArr(a.future_measures, deterministic.future_measures),
            match_confidence: deterministic.match_confidence,
        };
    }

    /**
     * Infer the continuity-plan metadata (planId slug, label, category bucket, overview)
     * for a freshly uploaded continuity-vault file. Used by the upload route to auto-create
     * or match a plan from the file content, without forcing the admin to fill out a form.
     */
    async inferCoopPlanMetadata(input: {
        fileName: string;
        fileExtension: string;
        fileSizeBytes: number;
        extractedText?: string;
    }): Promise<CoopPlanMetadata> {
        const ext = String(input.fileExtension || '').toLowerCase().replace(/^\./, '');
        const excerpt = (input.extractedText || '').trim().slice(0, 8000);
        const fallback = this.coopMetadataFallback(input.fileName, ext);

        if (!this.canUseOpenAI()) return fallback;

        const payload = {
            fileName: input.fileName,
            fileExtension: ext,
            fileSizeBytes: input.fileSizeBytes,
            fileKind:
                ext === 'pdf'
                    ? 'PDF'
                    : ext === 'docx' || ext === 'doc'
                      ? 'Word'
                      : ext === 'xlsx' || ext === 'xls'
                        ? 'Spreadsheet'
                        : ext === 'csv'
                          ? 'CSV'
                          : 'Document',
            documentTextExcerpt: excerpt.length ? excerpt : null,
        };

        const system = `You are a Continuity-of-Operations records librarian for the Ready2Go platform.
Given a single uploaded file (continuity-plan artifact), return STRICT JSON only:
{"planId":"<slug>","label":"<short title>","category":"coop"|"bcp"|"compliance","overview":"<1-2 sentences, max 280 chars>"}

Rules:
- planId: lowercase ASCII slug, 3-60 chars, [a-z0-9-] only, no leading/trailing hyphen. Derive it from the document's *subject* (e.g. "pandemic-coop-plan", "it-disaster-recovery", "annual-compliance-training-register"). If two different uploads describe the same program, the slug MUST collide (so they get attached to the same plan).
- label: human-readable title in Title Case, max 80 chars.
- category:
   * "coop"        — Continuity of Operations: essential functions, succession, vital records, hazard response playbooks for the *organization*, pandemic, evacuation, devolution, reconstitution.
   * "bcp"         — Business Continuity: IT/telecom disaster recovery, network, supply chain, vendor failover, facilities, RTO/RPO.
   * "compliance"  — Regulatory & audit: training records, NIMS/ICS, HIPAA, OSHA, audit findings, attestations, retention/policy.
- overview: factual purpose statement grounded in the excerpt (no marketing language, no markdown). If excerpt is empty, infer from the file name conservatively and keep overview short.
- Never output keys other than planId / label / category / overview. Never output category outside the three values above.`;

        const raw = await this.callOpenAI<Partial<CoopPlanMetadata>>(
            [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(payload) },
            ],
            fallback,
            { max_tokens: 220 },
        );

        const planId = this.normalizePlanSlug(raw.planId, fallback.planId);
        const label = this.normalizeLabel(raw.label, fallback.label);
        const overview = this.normalizeOverview(raw.overview, fallback.overview);
        const category = this.normalizePlanCategory(raw.category, fallback.category);
        return { planId, label, category, overview };
    }

    private coopMetadataFallback(fileName: string, ext: string): CoopPlanMetadata {
        const base = String(fileName || 'document')
            .replace(/\.[^.]+$/, '')
            .trim();
        const slug = this.normalizePlanSlug(base, 'uploaded-plan');
        const label = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Uploaded Plan';
        const overview = `Imported ${ext ? `${ext.toUpperCase()} ` : ''}continuity artifact pending review.`;
        return { planId: slug, label: this.titleCase(label), category: 'coop', overview };
    }

    private titleCase(s: string): string {
        return s
            .toLowerCase()
            .split(/\s+/)
            .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
            .join(' ');
    }

    private normalizePlanSlug(raw: unknown, fallback: string): string {
        const s = String(raw || '')
            .toLowerCase()
            .replace(/[^a-z0-9-_\s]/g, '')
            .replace(/[\s_]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
        if (s && /^[a-z0-9][a-z0-9-_]*$/i.test(s)) return s;
        return fallback;
    }

    private normalizeLabel(raw: unknown, fallback: string): string {
        const s = String(raw || '').trim().slice(0, 80);
        return s || fallback;
    }

    private normalizeOverview(raw: unknown, fallback: string): string {
        const s = String(raw || '').trim().slice(0, 320);
        return s || fallback;
    }

    private normalizePlanCategory(raw: unknown, fallback: 'coop' | 'bcp' | 'compliance'): 'coop' | 'bcp' | 'compliance' {
        const s = String(raw || '').toLowerCase().trim();
        if (s === 'coop' || s === 'bcp' || s === 'compliance') return s;
        return fallback;
    }

    /**
     * AI Integrity for COOP attachments: PDF, DOCX, CSV, XLSX (text excerpt + plan context).
     */
    async analyzeCoopAttachmentIntegrity(input: {
        planLabel: string;
        planOverview: string;
        steps: string[];
        fileName: string;
        fileExtension: string;
        fileSizeBytes: number;
        extractedText?: string;
        /** Cap excerpt length for latency/token use (default 12000). Upload uses ~8000. */
        maxExcerptChars?: number;
    }): Promise<CoopAttachmentIntegrity> {
        const fallback: CoopAttachmentIntegrity = {
            status: 'Reviewing',
            score: 50,
            summary: 'Analysis unavailable — configure OPENAI_API_KEY or retry.',
        };

        const cap = typeof input.maxExcerptChars === 'number' && input.maxExcerptChars > 0 ? input.maxExcerptChars : 12000;
        const ext = String(input.fileExtension || '').toLowerCase().replace(/^\./, '');
        const excerpt = (input.extractedText || '').trim().slice(0, cap);
        const payload = {
            fileKind: ext === 'pdf' ? 'PDF' : ext === 'docx' || ext === 'doc' ? 'Word' : ext === 'xlsx' || ext === 'xls' ? 'Spreadsheet' : ext === 'csv' ? 'CSV' : 'Document',
            planLabel: input.planLabel,
            planOverview: input.planOverview.slice(0, 4000),
            planSteps: input.steps.slice(0, 50).join('\n').slice(0, 6000),
            fileName: input.fileName,
            fileExtension: ext,
            fileSizeBytes: input.fileSizeBytes,
            documentTextExcerpt: excerpt.length ? excerpt : null,
            guidance:
                excerpt.length === 0
                    ? 'No extractable text (empty, corrupted, or scan-only PDF). Score conservatively (35–55) and use Reviewing or Deviation Found as appropriate; explain in summary.'
                    : `Evaluate the excerpt as a ${ext.toUpperCase()} continuity / emergency-plan artifact. Check alignment with plan overview and steps; clarity of objectives, roles, communications, recovery threads; tabular data coherence for spreadsheets.`,
        };

        const system = `You are a continuity of operations (COOP) and emergency preparedness document reviewer for Ready2Go.
The uploaded files are limited to PDF, DOCX, CSV, and XLSX for this module.
Return ONLY valid JSON: {"status":"In Sync"|"Reviewing"|"Deviation Found","score":<integer 0-100>,"summary":"<plain English, max 220 chars>"}.
Status meanings:
- "In Sync": content substantively supports the plan context and looks operationally usable.
- "Reviewing": partial/unclear content, weak alignment, or needs human review.
- "Deviation Found": serious gaps, wrong intent vs plan, or unusable as a continuity artifact.
Score: 0–100 (higher = stronger alignment and completeness). Map score visually: low scores (~0–40) imply deviation risk; mid (41–70) review; high (71–100) in sync.
Do not give legal advice. If excerpt is empty or useless, keep score low and status Reviewing or Deviation Found.`;

        const raw = await this.callOpenAI<{ status?: string; score?: number; summary?: string }>(
            [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(payload) },
            ],
            {
                status: fallback.status,
                score: fallback.score,
                summary: fallback.summary,
            },
            { max_tokens: 380 },
        );

        return {
            status: this.normalizeCoopIntegrityStatus(raw.status),
            score: Math.min(100, Math.max(0, Math.round(Number(raw.score) || fallback.score))),
            summary: String(raw.summary || fallback.summary).slice(0, 280),
        };
    }

    /**
     * Generates an executive-style audit summary for the entire continuity vault — what's in it,
     * AI integrity posture, and 2–4 actionable findings to surface to operators.
     */
    async generateContinuityAuditSummary(input: ContinuityAuditInput): Promise<ContinuityAuditSummary> {
        const posture = this.derivePosture(input);
        const fallback: ContinuityAuditSummary = {
            summary: input.totals.plans
                ? `Continuity vault holds ${input.totals.plans} plan${input.totals.plans === 1 ? '' : 's'} and ${input.totals.attachments} attachment${input.totals.attachments === 1 ? '' : 's'}; configure OPENAI_API_KEY for a tailored audit.`
                : 'No continuity plans yet — register a plan to begin tracking COOP/BCP/Compliance posture.',
            findings: [],
            posture,
            averageScore: input.averageScore,
        };

        if (!this.canUseOpenAI() || !input.totals.plans) return fallback;

        const compactPlans = input.plans.slice(0, 25).map((p) => ({
            planId: p.planId,
            label: p.label.slice(0, 80),
            category: p.category,
            files: p.attachmentCount,
            steps: p.stepCount,
            attachments: p.attachments.slice(0, 6).map((a) => ({
                file: a.fileName.slice(0, 80),
                status: a.status || 'unscored',
                score: typeof a.score === 'number' ? a.score : null,
            })),
        }));

        const payload = {
            totals: input.totals,
            averageScore: input.averageScore,
            categoryCounts: input.counts,
            integrityBreakdown: input.integrity,
            plans: compactPlans,
        };

        const system = `You are a Continuity-of-Operations auditor for the Ready2Go emergency-management platform.
Given a JSON inventory of COOP/BCP/Compliance plans and their AI-integrity scored attachments, output ONLY JSON:
{"summary":"<one or two sentences, plain English, max 360 chars, no markdown>","findings":["<short actionable bullet, max 140 chars>", ...]}
Rules:
- 2 to 4 findings, ordered by urgency. Reference real plan labels or categories where useful.
- Highlight: coverage gaps (empty categories), low integrity scores, files with "Deviation Found", plans without steps or attachments, missing analysis.
- If posture is strong, still flag the weakest area for continuous improvement.
- Do NOT recommend actions outside the continuity/emergency-management domain. No legal advice.`;

        const raw = await this.callOpenAI<{ summary?: string; findings?: unknown }>(
            [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(payload) },
            ],
            { summary: fallback.summary, findings: [] },
            { max_tokens: 420 },
        );

        const findings = Array.isArray(raw.findings)
            ? raw.findings
                  .map((f) => String(f ?? '').trim())
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((f) => f.slice(0, 160))
            : [];

        return {
            summary: String(raw.summary || fallback.summary).slice(0, 420),
            findings,
            posture,
            averageScore: input.averageScore,
        };
    }

    private derivePosture(input: ContinuityAuditInput): ContinuityAuditSummary['posture'] {
        if (!input.totals.plans) return 'At Risk';
        const { nonCompliant, underReview } = input.integrity;
        const analyzed = input.totals.analyzed;
        const avg = input.averageScore;
        if (nonCompliant > 0 || avg < 55 || analyzed === 0) return 'At Risk';
        if (underReview > 0 || avg < 75) return 'Steady';
        return 'Resilient';
    }

    private normalizeCoopIntegrityStatus(s: string | undefined): CoopAttachmentIntegrity['status'] {
        const u = String(s || '').trim().toLowerCase();
        if (u === 'deviation found' || (u.includes('deviation') && !u.includes('no deviation'))) return 'Deviation Found';
        if (u === 'in sync' || u.includes('in sync')) return 'In Sync';
        if (u === 'reviewing' || u.includes('review')) return 'Reviewing';
        return 'Reviewing';
    }

    private mergeRiskReport(base: RiskReport, ai?: RiskReport | null): RiskReport {
        if (!ai) return base;
        return {
            ...base,
            ...ai,
            domain_severities: { ...base.domain_severities, ...ai.domain_severities },
            meteorological_findings: ai.meteorological_findings?.length ? ai.meteorological_findings : base.meteorological_findings,
            hydrological_findings: ai.hydrological_findings?.length ? ai.hydrological_findings : base.hydrological_findings,
            fire_findings: ai.fire_findings?.length ? ai.fire_findings : base.fire_findings,
            recommendations_list: (ai.recommendations_list?.length ? ai.recommendations_list : base.recommendations_list).map(
                (rec) => ({ ...rec, priority: normalizeRecommendationPriority(rec.priority) }),
            ),
            /** Deterministic unique-event counts from ingest (same basis as AlertCommunication normalizers). */
            incident_distribution: base.incident_distribution,
            historical_analysis: { ...base.historical_analysis, ...ai.historical_analysis },
            historical_analysis_by_incident: this.mergeHistoricalAnalysisByIncident(
                base.historical_analysis_by_incident,
                ai?.historical_analysis_by_incident,
            ),
        };
    }

    private mergeHistoricalAnalysisByIncident(
        base?: Partial<Record<IncidentHistoryCategory, RiskReport['historical_analysis']>>,
        ai?: Partial<Record<IncidentHistoryCategory, RiskReport['historical_analysis']>>,
    ): Partial<Record<IncidentHistoryCategory, RiskReport['historical_analysis']>> | undefined {
        if (!base && !ai) return undefined;
        const out: Partial<Record<IncidentHistoryCategory, RiskReport['historical_analysis']>> = {
            ...(base ?? {}),
        };
        for (const k of INCIDENT_HISTORY_TAB_KEYS) {
            const next = ai?.[k];
            if (!next) continue;
            out[k] = { ...out[k], ...next };
        }
        return Object.keys(out).length ? out : undefined;
    }

    private heuristicDashboardRiskReport(bundle: DashboardIngestBundle): RiskReport {
        const now = new Date().toISOString();
        /** All trimmed non-empty lines (for dynamic incident counts — not UI-cropped). */
        const allLines = (s?: string) =>
            (s ?? '')
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);
        /** Bounded lines for readability in finding cards only. */
        const lines = (s?: string, cap = 6) => allLines(s).slice(0, cap);

        const usgs = bundle.sources.find((x) => x.source === 'USGS_NWIS_IV')?.summary;
        const nwps = bundle.sources.find((x) => x.source === 'NOAA_NWPS_GAUGE')?.summary;
        const nws = bundle.sources.find((x) => x.source === 'NWS_FLOOD_ALERTS')?.summary;
        const fema = bundle.sources.find((x) => x.source === 'FEMA_OPENFEMA')?.summary;
        const firmsResult = bundle.sources.find((x) => x.source === 'NASA_FIRMS');
        const firms = firmsResult?.summary;
        const firmsSignalCount =
            firmsResult?.ok && firmsResult.signalCount != null ? firmsResult.signalCount : null;
        const inci = bundle.sources.find((x) => x.source === 'INCIWEB_RSS')?.summary;
        const arcgis = bundle.sources.find((x) => x.source === 'ESRI_ARCGIS_WFIGS')?.summary;
        const usgsEq = bundle.sources.find((x) => x.source === 'USGS_EARTHQUAKES')?.summary;

        /** Domain card heuristics (line density), separate from bar chart event counts. */
        const floodLineSignals = Math.max(0, allLines(usgs).length + allLines(nwps).length + allLines(fema).length);
        const fireArcLines = allLines(arcgis).filter(
            (l) =>
                !/no perimeter features returned|returned no (?:perimeter|features)|query returned no|empty window or outside current aoi|unavailable\s*\([^)]*\)\s*$/i.test(
                    l,
                ),
        );
        const firmsDetectionTally =
            firmsSignalCount != null ? firmsSignalCount : firms ? allLines(firms).length : 0;
        const wildfireLineSignals = Math.max(0, firmsDetectionTally + allLines(inci).length + fireArcLines.length);

        /** Bar chart + Active incidents: deduped normalized events (aligned with Alerts & Communication logic). */
        const distro: RiskReport['incident_distribution'] = deriveEventBasedIncidentDistribution(bundle);

        const hydro = [...lines(usgs, 12), ...lines(nwps, 4), ...lines(fema, 20)].slice(0, 40);

        const eqBullets = allLines(usgsEq).slice(0, 40);
        const nwsBullets = lines(nws, 24);
        const met = [...eqBullets, ...nwsBullets].slice(0, 60);
        if (!met.length)
            met.push(
                'No notable earthquake or flood/hydro NWS headlines in this pull (feeds may be quiet or filtered).',
            );

        const fire = [...lines(firms, 80), ...lines(inci, 30), ...lines(arcgis, 20)].slice(0, 100);
        if (!fire.length) fire.push('Wildfire layer signals sparse or unavailable (check NASA MAP key / ArcGIS reachability).');

        const overall = deriveDynamicOverallThreatLevel(bundle);
        const pressure = aggregateSeverityPressure(bundle);

        /** KPI "Active incidents" = sum of deduped event counts (0 when no normalized events). */
        const barSum = distro.reduce((a, x) => a + Math.max(0, x.count || 0), 0);
        const alerts_count = Math.min(500, barSum);
        return {
            id: `risk-${Date.now()}`,
            generated_at: now,
            overall_risk_level: overall,
            ai_confidence: deriveDynamicAiConfidence(bundle),
            populations_at_risk: bundle.riskExposure?.populationAffectedEstimate ?? 0,
            domain_severities: {
                meteorological:
                    pressure >= 55 && (eqBullets.length || nwsBullets.length)
                        ? 'Critical'
                        : pressure >= 30 && nwsBullets.length
                          ? 'Elevated'
                          : eqBullets.length || nwsBullets.length
                            ? 'Monitor'
                            : 'Low',
                hydrological:
                    pressure >= 70 && floodLineSignals > 2
                        ? 'Critical'
                        : floodLineSignals > 8 || (pressure >= 38 && floodLineSignals > 1)
                          ? 'Elevated'
                          : floodLineSignals > 1
                            ? 'Monitor'
                            : 'Low',
                fire:
                    firmsDetectionTally > 400 || fireArcLines.length > 6
                        ? 'Critical'
                        : firmsDetectionTally > 120 || wildfireLineSignals > 25
                          ? 'High Risk'
                          : wildfireLineSignals > 4
                            ? 'Elevated'
                            : 'Monitor',
            },
            meteorological_findings: met,
            hydrological_findings: hydro.length ? hydro : ['Hydrological ingest incomplete — verify USGS/NWPS/FEMA connectivity.'],
            fire_findings: fire,
            recommendations_list: [
                {
                    priority: 'URGENT',
                    action: 'Cross-check FIRMS hot spots with InciWeb / ArcGIS perimeters before resource dispatch.',
                    deployable: false,
                },
                {
                    priority: 'STANDARD',
                    action: 'Monitor USGS gauge trends and NWPS forecast stages for the configured basin.',
                    deployable: false,
                },
                {
                    priority: 'IMMEDIATE',
                    action: 'If NWS Flood Warnings intersect licensed zones, trigger Virtual EOC pre-activation review.',
                    deployable: true,
                },
            ],
            incident_distribution: distro,
            /** Filled after KPI alignment via {@link buildLiveHistoricalContext} + the AI Historical Context pass. */
            historical_analysis: {},
            sources_count: bundle.successfulSources,
            alerts_count,
            meteorological_summary: met.join(' '),
            hydrological_risk: hydro.join(' '),
            fire_threats: fire.join(' '),
            recommendations: 'Blend redundant feeds; escalate when NWS warnings and hydrology agree.',
            /** Major/minor finalized in `alignAlertsToDistribution` from severity pressure. */
            major_incidents: 0,
            minor_incidents: 0,
        };
    }

    // ─── DB-driven methods (UnifiedEvent as source of truth) ───────────────

    /**
     * Recursively walks any properties object and returns a flat { "dot.path": value }
     * map containing ONLY leaves that are non-null, non-zero, non-empty-string, and
     * non-empty-array. Works for every UnifiedEvent category without knowing field names
     * in advance — the AI just receives the meaningful data points.
     */
    private flattenEventStats(
        obj: unknown,
        prefix = '',
        out: Record<string, unknown> = {},
    ): Record<string, unknown> {
        if (obj === null || obj === undefined) return out;
        if (Array.isArray(obj)) {
            const nonEmpty = (obj as unknown[]).filter(
                (v) => v !== null && v !== undefined && v !== '' && v !== 0,
            );
            if (nonEmpty.length > 0) out[prefix] = nonEmpty;
            return out;
        }
        if (typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
                this.flattenEventStats(v, prefix ? `${prefix}.${k}` : k, out);
            }
            return out;
        }
        // Leaf value — keep only if meaningful
        if (obj !== null && obj !== undefined && obj !== '' && obj !== 0 && obj !== '0.00K') {
            out[prefix] = obj;
        }
        return out;
    }

    private projectEventForAI(e: UnifiedEventDoc) {
        return {
            _ref: String(e._id),
            name: e.name,
            category: e.category,
            severity: e.severity,
            type: e.type,
            status: e.status,
            source: e.source,
            location: e.location,
            lat: e.lat ?? null,
            lng: e.lng ?? null,
            issuedAt: e.issuedAt,
            formattedTimestamp: formatEventTimestamp(e),
            expiresAt: e.expiresAt,
            description: e.description,
            instructions: e.instructions,
            properties: e.properties,
        };
    }

    async generateSeverityCategorySummary(input: {
        severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
        category: string;
        events: UnifiedEventDoc[];
    }): Promise<BulletWithRefs[]> {
        const fallback: BulletWithRefs[] = [{
            text: `${input.events.length} active ${input.category} event(s) at ${input.severity} severity in ${[...new Set(input.events.map((e) => e.location))].slice(0, 3).join(', ')}.`,
            eventIds: input.events.map((e) => String(e._id)),
        }];
        const result = await this.callOpenAI<{ bullets: { text: string; eventRefs: string[] }[] }>(
            [
                {
                    role: 'system',
                    content: `${PLAIN_ENGLISH_STYLE_RULES}

You are summarizing all active ${input.category} events at ${input.severity} severity for an executive emergency briefing.

IMPORTANT — output rules:
- Return AT MOST 5 bullets total.
- Cluster events by affected state or county — one bullet per cluster.
- Every event must be represented in at least one bullet. Do NOT drop any events silently.
- Do NOT produce a single semicolon-joined mega-bullet listing every event on one line.
- Do NOT use placeholder text like "N more events" or "X more events" — represent all events within the 5-bullet limit by clustering.
- FEMA grouping rule: if multiple events share the same "femaDisasterNumber" (or "femaDeclarationString") inside their properties, they are the SAME federal disaster declaration spanning multiple counties. Collapse them into ONE bullet that names the disaster once and lists every affected county (e.g., "covers **Saipan**, **Tinian**, **Rota**"). Mention per-county variations in incidentType, programs, or aid amounts if they actually differ across the county-docs. Never emit a separate bullet per county for the same disaster number.

Each bullet MUST:
- Be one complete, self-explanatory sentence.
- Include the event name, the affected location or county, the date and time from the "formattedTimestamp" field (e.g. "May 22, 2026, 3:45 PM"), and ALL key statistics present in the data.
- Draw statistics directly from the "properties" field of each event: intensity value (1=Low, 2=Moderate, 3=High, 4=Extreme), affectedCounties array, effectiveAt, endsAt, injuriesDirect, deathsDirect, damageProperty, damageCrops, totalFederalAidUsd, femaDisasterNumber — whichever are non-null for this event.
- NEVER omit numbers, counts, dollar amounts, names, or timestamps that appear in the data.
- Wrap place names, severity words, and numeric facts in **double asterisks**.

EVENT REFERENCE TRACKING — REQUIRED:
- Every input event has a "_ref" string field. You MUST echo back the exact "_ref" values of every event included in each bullet under "eventRefs".
- "eventRefs" is an array of strings, length >= 1, containing every _ref the bullet covers.
- Union of all "eventRefs" across all bullets MUST equal the full input set — no event may be silently dropped.
- Do NOT invent _ref values. Only return strings that appeared in the input.

Return JSON: {"bullets": [{"text": "<sentence>", "eventRefs": ["<_ref>", ...]}, ...]}.`,
                },
                {
                    role: 'user',
                    content: JSON.stringify(input.events.map((e) => this.projectEventForAI(e))),
                },
            ],
            { bullets: fallback.map((b) => ({ text: b.text, eventRefs: b.eventIds })) },
            { max_tokens: 2000 },
        );

        const validRefs = new Set(input.events.map((e) => String(e._id)));
        const cleaned: BulletWithRefs[] = result.bullets
            .map((b) => ({
                text: normalizeAiBullet(b.text),
                eventIds: (b.eventRefs ?? []).filter((r) => validRefs.has(r)),
            }))
            .filter((b) => b.text && b.eventIds.length > 0);

        if (cleaned.length === 0) return fallback;

        // Orphan rescue: ensure every input event is referenced by at least one bullet.
        const referenced = new Set(cleaned.flatMap((b) => b.eventIds));
        const missing = [...validRefs].filter((r) => !referenced.has(r));
        if (missing.length > 0) {
            cleaned[cleaned.length - 1].eventIds.push(...missing);
        }
        return cleaned;
    }

    async generateIncidentDetailNarrative(input: {
        events: UnifiedEventDoc[];
    }): Promise<IncidentDetailNarrative> {
        const fallback: IncidentDetailNarrative = {
            overview: `${input.events.length} incident record(s) summarized.`,
            currentStatus: 'See raw chip metadata.',
            affectedAreas: input.events.map((e) => e.location).join('; '),
            keyStatistics: '',
            historicalContext: '',
        };
        const result = await this.callOpenAI<IncidentDetailNarrative>(
            [
                {
                    role: 'system',
                    content: `${PLAIN_ENGLISH_STYLE_RULES}

You are writing a complete, detailed incident briefing for an emergency operations center. The user clicked "Learn More" to see the FULL picture of this specific incident — do NOT summarize loosely. Every non-null, non-zero, non-empty field in the event data MUST appear somewhere in the output.

Produce a structured JSON object with these six fields (all strings, required, use "" only when the source data truly has nothing for that field):

  - overview
      What is happening, what type of alert/declaration, which hazard category, issued by which source.
      Include name, type (Warning/Watch/Advisory/Declaration), severity level, and a plain-English explanation of what the severity means for ordinary people.

  - currentStatus
      When was it issued (issuedAt / formattedTimestamp). When does it expire (expiresAt). Is it ongoing, expiring soon, or already resolved.
      If lat/lng are non-null, say "centered near latitude X, longitude Y" — but ALSO explain what that location is in plain words (nearest town / coastal zone / ocean region).

  - affectedAreas
      List EVERY geographic detail in the data: location string, affectedCounties array, designatedArea, areaName, zone names, state codes, and lat/lng interpreted as a readable place.
      If the data contains a zone or area range description (e.g. "Flaxman Island to Demarcation Point out to 15 NM"), include it word for word.

  - keyStatistics
      Exhaustively extract EVERY non-null numeric and named value from the properties object, regardless of field name.
      This MUST include (when present): intensity/magnitude/level values, wind speed, gust speed, wave height, gauge height, river stage, flood stage, flow rate, fire acreage, containment %, temperature, air quality index, visibility, precipitation amounts, damage estimates (damageProperty, damageCrops), casualty counts (injuriesDirect, injuriesIndirect, deathsDirect, deathsIndirect), federal aid totals (totalFederalAidUsd, totalAmountIhpApproved, totalObligatedAmountPa, etc.), disaster/declaration numbers, program codes, any other numeric field.
      Format each as: "Field name: **value units** (plain-English explanation of what this means)".
      NEVER skip a field just because it seems minor. If it has a value, include it.

  - historicalContext
      Only if the description field explicitly mentions a past event, prior declaration, or historical comparison. Otherwise "".

Strict rules:
  - NEVER invent data. Only use values that appear in the provided event data.
  - NEVER drop a field that has a non-null/non-zero value.
  - If a field has NO available data, return exactly "" (empty string) — NEVER write sentences like "No data is available", "No coordinates are provided", "No numeric values were found", "No additional information", or any other negative/absence statement. Empty string silently hides the section; a negative sentence pollutes the report.
  - lat/lng: only mention coordinates if both lat and lng are non-null numbers in the data. If either is null, omit coordinates entirely — do not say "no coordinates provided".
  - keyStatistics: if there are genuinely zero non-null numeric or named values in properties, return "".
  - affectedAreas: if the only geographic data is the location string already shown in the header, return "".
  - historicalContext: if there is no historical reference in the data, return "".
  - If multiple events share a femaDisasterNumber, treat them as one declaration covering multiple areas — list all areas together.
  - Wrap every place name, measurement, number, and statistic in **double asterisks**.
  - Each field may be multiple sentences. Completeness matters more than brevity here.

Return JSON exactly: {"overview": "...", "currentStatus": "...", "affectedAreas": "...", "keyStatistics": "...", "historicalContext": ""}.`,
                },
                {
                    role: 'user',
                    content: JSON.stringify(input.events.map((e) => this.projectEventForAI(e))),
                },
            ],
            fallback,
            { max_tokens: 1400 },
        );
        return {
            overview: normalizeAiBullet(result.overview),
            currentStatus: normalizeAiBullet(result.currentStatus),
            affectedAreas: normalizeAiBullet(result.affectedAreas),
            keyStatistics: normalizeAiBullet(result.keyStatistics),
            historicalContext: normalizeAiBullet(result.historicalContext),
        };
    }

    async generateHistoricalPastSummary(input: {
        category: string;
        similarPastEvents: UnifiedEventDoc[];
        currentSeed: UnifiedEventDoc;
    }): Promise<{
        matched_event?: string;
        similarity_summary?: string;
        past_damages?: string[];
        past_procedures?: string[];
    }> {
        const fallback: {
            matched_event?: string;
            similarity_summary?: string;
            past_damages?: string[];
            past_procedures?: string[];
        } = {};
        if (input.similarPastEvents.length === 0) return fallback;

        // Build a flat stats map for each past event — every non-null, non-zero leaf
        // value from the entire properties object, regardless of category or field name.
        const pastStats = input.similarPastEvents.map((e, i) => ({
            index: i,
            name: e.name,
            location: e.location,
            lat: e.lat ?? null,
            lng: e.lng ?? null,
            issuedAt: e.issuedAt,
            formattedTimestamp: formatEventTimestamp(e),
            stats: this.flattenEventStats(e.properties),
        }));

        const seedStats = this.flattenEventStats(input.currentSeed.properties);

        return this.callOpenAI(
            [
                {
                    role: 'system',
                    content: `${PLAIN_ENGLISH_STYLE_RULES}

You are summarizing up to 3 past ${input.category} events similar to today's active situation. Wrap key facts in **double asterisks**.

DATA SOURCE — PAST_EVENT_STATS:
Each entry in PAST_EVENT_STATS contains a "stats" object. Every key-value pair in "stats" is a meaningful data point already extracted from the event's properties (nulls, zeros, and empty values were removed before sending). The keys use dot-notation paths (e.g. "fema_declaration.totalFederalAidUsd", "landslide.deathsDirect", "storm.intensity.display", "flood.affectedCounties"). You do not need to know the category schema — just read every key-value pair and use the values.

RULES:
1. Every value present in "stats" MUST be used in the appropriate bullet. Never drop a data point.
2. If "stats" is empty for a past event, describe what this category of hazard is known to cause from domain knowledge.
3. Coordinates (lat/lng) are provided when available — use them to name the place in plain English (e.g. "near downtown Memphis" not raw numbers). Never output raw coordinates.
4. Use friendly dates from "formattedTimestamp" (e.g. "May 22, 2026, 3:45 PM").
5. Classify each value as damage/loss (deaths, injuries, property damage, crop damage, acres burned, structures destroyed) OR procedural (federal aid amounts, programs activated, declaration numbers, evacuation orders, shelter activations) and put it in the correct bullet list.

Return JSON with exactly these keys:
- matched_event: One sentence identifying the closest past event. Must include: event name, location (use lat/lng to name it plainly if location string is vague), friendly date, and the single most impactful stat from PAST_EVENT_STATS[0].stats. Format: "**[Name]** — **[Location]**, **[Date]** — **[key stat]**".
- similarity_summary: 1-2 sentences explaining why today resembles that past situation.
- past_damages: string[] — One bullet per past event that has damage/loss data. Use every damage/casualty value from "stats". For events with no damage stats, write what the category is known to cause. Minimum 2 bullets. No response actions here.
- past_procedures: string[] — One bullet per past event that has procedural data. Use every aid/program/declaration value from "stats". Fall back to typical response steps only when stats has no procedural data. Minimum 2 bullets. No damage stats here.`,
                },
                {
                    role: 'user',
                    content: `CURRENT SEED EVENT:\n${JSON.stringify(this.projectEventForAI(input.currentSeed))}\n\nSEED_STATS (meaningful data points from current event):\n${JSON.stringify(seedStats)}\n\nPAST_EVENT_STATS (all meaningful data points per past event — use every value):\n${JSON.stringify(pastStats)}`,
                },
            ],
            fallback,
            { max_tokens: 1200 },
        );
    }

    async generateHistoricalCurrentSummary(input: {
        category: string;
        currentEvents: UnifiedEventDoc[];
        activeResponders?: Record<string, unknown[]>;
    }): Promise<{ current_procedures?: string[] }> {
        const fallback: { current_procedures?: string[] } = {};

        // Only generate AI summary when real responder activity exists in the DB.
        // If no responders are on record, return empty so the UI shows the placeholder.
        const hasResponders = input.activeResponders && Object.keys(input.activeResponders).length > 0;
        if (!hasResponders) return fallback;

        const system = `${PLAIN_ENGLISH_STYLE_RULES}

You are writing the "Current Procedures" section for a ${input.category} emergency briefing. Describe what each responding organization is actively doing right now based on the RESPONDERS data below. Name every organization, state their deployed numbers, and note any units that are stressed or at limited capacity. Use the EVENTS block only to give geographic or incident context to the responder actions.

Write in plain English. Examples of good bullets:
- "**Riverside County Medical Center** currently has **14 of 20 ICU beds occupied**, with clinical staff managing a surge of patients from the active wildfire zone."
- "**San Bernardino County Sheriff** has deployed **12 patrol vehicles** and **45 officers**, with two active incident operations and a staging area at **[location]**."
- "**[Network Name]** National Guard has **[X] personnel** and **[Y] vehicles** at **[site]** — status: **active**."

Return JSON: {"current_procedures": ["<sentence>", ...]}.`;

        return this.callOpenAI(
            [
                { role: 'system', content: system },
                {
                    role: 'user',
                    content: `RESPONDERS:\n${JSON.stringify(input.activeResponders)}\n\nEVENTS (context only):\n${JSON.stringify(input.currentEvents.map((e) => this.projectEventForAI(e)))}`,
                },
            ],
            fallback,
            { max_tokens: 900 },
        );
    }

    async generateHistoricalFutureMeasures(input: {
        category: string;
        pastSummary: { past_damages?: string[]; past_procedures?: string[] };
        currentSummary: { current_procedures?: string[] };
    }): Promise<{ future_measures?: string[] }> {
        const fallback: { future_measures?: string[] } = {};
        const hasPast =
            (input.pastSummary.past_damages?.length ?? 0) > 0 ||
            (input.pastSummary.past_procedures?.length ?? 0) > 0;
        const hasCurrent = (input.currentSummary.current_procedures?.length ?? 0) > 0;
        if (!hasPast && !hasCurrent) return fallback;

        return this.callOpenAI(
            [
                {
                    role: 'system',
                    content: `${PLAIN_ENGLISH_STYLE_RULES}\n\nYou are a senior emergency management advisor proposing expert-grade, realistic long-term mitigation strategies for ${input.category} hazards to be presented to senior executives. Be specific — name infrastructure upgrades, policy changes, funding mechanisms, training programs, or technology investments. Never generic platitudes. Return JSON: {"future_measures": ["<measure>", ...]}.`,
                },
                {
                    role: 'user',
                    content: `PAST DAMAGES:\n${JSON.stringify(input.pastSummary.past_damages ?? [])}\n\nPAST PROCEDURES:\n${JSON.stringify(input.pastSummary.past_procedures ?? [])}\n\nCURRENT SITUATION:\n${JSON.stringify(input.currentSummary.current_procedures ?? [])}`,
                },
            ],
            fallback,
            { max_tokens: 700 },
        );
    }

    async generateCategoryStrategicPlan(input: {
        category: string;
        futureMeasures: string[];
    }): Promise<RecommendationItem[]> {
        const fallback: RecommendationItem[] = [
            { priority: 'URGENT', action: `Review and activate emergency protocols for ${input.category} hazards.`, deployable: true, step: 1 },
            { priority: 'STANDARD', action: `Update ${input.category} response procedures based on the current situation.`, deployable: false, step: 2 },
        ];
        if (!input.futureMeasures.length) return fallback;

        const result = await this.callOpenAI<{ recommendations_list: RecommendationItem[] }>(
            [
                {
                    role: 'system',
                    content: `${PLAIN_ENGLISH_STYLE_RULES}\n\nYou are the Emergency Operations Chief. Translate the proposed future mitigation measures for ${input.category} hazards into a numbered, sequenced action plan. Each item must be concrete — specify who owns it, when, and what outcome it produces. Assign exactly one of: IMMEDIATE (life-safety, do now), URGENT (within 24-72 hours), STANDARD (within 1-4 weeks). Start each action with a bold verb. Return JSON: {"recommendations_list": [{"priority": "IMMEDIATE"|"URGENT"|"STANDARD", "action": "<string>", "step": <number>, "deployable": <boolean>}, ...]}.`,
                },
                {
                    role: 'user',
                    content: JSON.stringify(input.futureMeasures),
                },
            ],
            { recommendations_list: fallback },
            { max_tokens: 600 },
        );

        const list = result.recommendations_list;
        if (!Array.isArray(list) || list.length === 0) return fallback;
        return list.map((r, i) => ({
            ...r,
            priority: normalizeRecommendationPriority(r.priority),
            step: r.step ?? i + 1,
            deployable: Boolean(r.deployable),
        }));
    }

    async generateStrategicPlan(input: {
        futureMeasuresByCategory: Record<string, string[]>;
    }): Promise<RecommendationItem[]> {
        const fallback: RecommendationItem[] = [
            { priority: 'URGENT', action: 'Review and activate jurisdiction emergency protocols for all active hazard categories.', deployable: true, step: 1 },
            { priority: 'IMMEDIATE', action: 'Deploy emergency notifications to all affected communities via Ready2Go alert system.', deployable: true, step: 2 },
            { priority: 'STANDARD', action: 'Conduct after-action review of all active incidents and update response procedures.', deployable: false, step: 3 },
        ];

        const hasContent = Object.values(input.futureMeasuresByCategory).some((m) => m.length > 0);
        if (!hasContent) return fallback;

        const result = await this.callOpenAI<{ recommendations_list: RecommendationItem[] }>(
            [
                {
                    role: 'system',
                    content: `${PLAIN_ENGLISH_STYLE_RULES}\n\nYou are the Emergency Operations Chief. Translate the proposed future mitigation measures into a numbered, sequenced action plan. Each item must be concrete — specify who owns it, when, and what outcome it produces. Assign exactly one of: IMMEDIATE (life-safety, do now), URGENT (within 24-72 hours), STANDARD (within 1-4 weeks). Start each action with a bold verb. Return JSON: {"recommendations_list": [{"priority": "IMMEDIATE"|"URGENT"|"STANDARD", "action": "<string>", "step": <number>, "deployable": <boolean>}, ...]}.`,
                },
                {
                    role: 'user',
                    content: JSON.stringify(input.futureMeasuresByCategory),
                },
            ],
            { recommendations_list: fallback },
            { max_tokens: 900 },
        );

        const list = result.recommendations_list;
        if (!Array.isArray(list) || list.length === 0) return fallback;
        return list.map((r, i) => ({
            ...r,
            priority: normalizeRecommendationPriority(r.priority),
            step: r.step ?? i + 1,
            deployable: Boolean(r.deployable),
        }));
    }
}

export const openaiService = new OpenAIService();

