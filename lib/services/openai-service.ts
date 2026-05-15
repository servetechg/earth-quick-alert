import { Alert, AlertSeverity, AlertSource, SocialMediaAlert, ResourceAlert } from '@/lib/types/api-alerts';
import type {
    DashboardIngestBundle,
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
import { applyHistoricalContextToReport } from '@/lib/services/risk-historical-context';

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
        inSync: number;
        reviewing: number;
        deviation: number;
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

export class OpenAIService {
    private apiKey = process.env.OPENAI_API_KEY || '';
    private model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    private canUseOpenAI(): boolean {
        return Boolean(this.apiKey);
    }

    private async callOpenAI<T>(
        messages: ChatMessage[],
        fallback: T,
        options?: { max_tokens?: number }
    ): Promise<T> {
        if (!this.canUseOpenAI()) return fallback;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    response_format: { type: 'json_object' },
                    ...(typeof options?.max_tokens === 'number' ? { max_tokens: options.max_tokens } : {}),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `OpenAI request failed: ${response.status}`);
            }

            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content;
            if (!content) return fallback;

            return JSON.parse(content) as T;
        } catch (error) {
            console.error('OpenAI request failed, using fallback:', error);
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

        const fallback: { posts: SocialMediaAlert[] } = { posts: [] };
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
            suggestedMessage: `Official NWS Alert for ${country}: Severe weather detected in region. Please monitor local conditions and follows safety protocols.`
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
        const fallback = applyHistoricalContextToReport(
            bundle,
            applyDynamicExecutiveKpis(bundle, fallbackHeuristic),
        );
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
historical_analysis: { matched_event, match_confidence 0-100, similarity_summary, past_damages[], past_procedures[], current_procedures[], future_measures[] },
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
                        `You are Ready2Go emergency intelligence. Output only valid JSON matching the user schema at the root (no wrapper keys). Ground findings in the ingested data; mark uncertainty where feeds conflict or are missing. Never invent specific incidents not supported by the summaries. Format each finding bullet as a short operations briefing clause (readable to a Duty Officer): emphasize location names, magnitudes/flows/acres/percents, and timing—not raw GPS coordinates.${stateOnly}`,
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
        return applyHistoricalContextToReport(bundle, applyDynamicExecutiveKpis(bundle, aligned));
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
        const deviations = input.integrity.deviation;
        const reviewing = input.integrity.reviewing;
        const analyzed = input.totals.analyzed;
        const avg = input.averageScore;
        if (deviations > 0 || avg < 55 || analyzed === 0) return 'At Risk';
        if (reviewing > 0 || avg < 75) return 'Steady';
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
            /** Filled after KPI alignment via {@link applyHistoricalContextToReport}. */
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
}

export const openaiService = new OpenAIService();

