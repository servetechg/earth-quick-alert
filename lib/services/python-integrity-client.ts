import { createHmac } from 'crypto';
import type {
    ContinuityAuditInput,
    ContinuityAuditSummary,
} from '@/lib/services/openai-service';

const DEFAULT_PYTHON_URL = 'http://localhost:8000';
/** Client poll budget — Python ANALYZE_TIMEOUT_S default is 300s (§9.1). */
const ANALYZE_POLL_TIMEOUT_MS =
    Number(process.env.PYTHON_ANALYZE_POLL_TIMEOUT_MS) || 300_000;
const AUDIT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;

export type PythonAnalyzeResponse = {
    status?: string;
    score?: number;
    summary?: string;
    analyzedAt?: string;
    modelVersion?: string;
    details?: {
        componentScores?: {
            content?: number | null;
            name?: number | null;
            quality?: number | null;
            duplication?: number | null;
        };
        similarFiles?: Array<{ attachmentId?: string; similarity?: number }>;
        degraded?: boolean;
        cacheHit?: boolean;
    };
};

type PythonAsyncAnalyzeResponse = {
    state?: string;
    attachmentId?: string;
    pollUrl?: string;
    detail?: string | null;
    result?: PythonAnalyzeResponse;
};

export type PythonAuditSummaryResponse = {
    summary?: string;
    findings?: string[];
    posture?: ContinuityAuditSummary['posture'];
    averageScore?: number;
    degraded?: boolean;
};

/** True when the Python AI microservice should handle integrity + audit (default). */
export function usePythonIntegrityBackend(): boolean {
    return process.env.INTEGRITY_BACKEND !== 'openai';
}

/** Normalized Python service base URL from env (no trailing slash). */
export function getPythonIntegrityBaseUrl(): string {
    const fromEnv =
        process.env.PYTHON_URL?.trim() ||
        process.env.PYTHON_INTEGRITY_URL?.trim() ||
        process.env.AI_SERVICE_URL?.trim();

    if (!fromEnv) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'PYTHON_URL is required in production when INTEGRITY_BACKEND=python. Set it to your Ready2Go AI service base URL.',
            );
        }
        console.warn(
            `[continuity-integrity] PYTHON_URL is not set — falling back to ${DEFAULT_PYTHON_URL}. ` +
                'Set PYTHON_URL in .env.local (e.g. your dev tunnel) and restart the Next.js dev server.',
        );
    }

    const raw = (fromEnv || DEFAULT_PYTHON_URL).replace(/\/+$/, '');
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^localhost(?:[:/]|$)/i.test(raw) || /^127\./.test(raw)) return `http://${raw}`;
    return `https://${raw}`;
}

/** Normalize Python or legacy OpenAI status strings for display. */
export function normalizeIntegrityStatusLabel(status: string | undefined): string {
    const u = String(status ?? '')
        .trim()
        .toLowerCase();
    if (u === 'compliant' || u === 'in sync') return 'Compliant';
    if (u === 'non-compliant' || u === 'non compliant' || u.includes('non-compliant')) return 'Non-Compliant';
    if (u === 'under review' || u === 'reviewing') return 'Under Review';
    if (u === 'deviation found') return 'Non-Compliant';
    return 'Under Review';
}

export function classifyIntegrityStatusForAudit(
    status: string | undefined,
): 'compliant' | 'underReview' | 'nonCompliant' | 'unanalyzed' {
    if (!status?.trim()) return 'unanalyzed';
    const label = normalizeIntegrityStatusLabel(status);
    if (label === 'Compliant') return 'compliant';
    if (label === 'Non-Compliant') return 'nonCompliant';
    return 'underReview';
}

/** Tenant key for Python — default `sub_<ownerUserId>` per SERVICE_DOCUMENTATION §9. */
export function buildPythonTenantKey(ownerUserId: string): string {
    const prefix =
        process.env.PYTHON_TENANT_KEY_PREFIX !== undefined
            ? process.env.PYTHON_TENANT_KEY_PREFIX
            : 'sub_';
    return `${prefix}${ownerUserId}`;
}

function buildBearerHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = process.env.PYTHON_INTEGRITY_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const tunnelCookie = process.env.PYTHON_DEV_TUNNEL_COOKIE?.trim();
    if (tunnelCookie) headers.Cookie = tunnelCookie;
    return headers;
}

function buildAuthHeaders(rawBody: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...buildBearerHeaders(),
    };

    const token = process.env.PYTHON_INTEGRITY_TOKEN?.trim();
    if (!token) {
        throw new Error(
            'PYTHON_INTEGRITY_TOKEN is not set. Add it to .env (same Bearer token as Postman) and restart Next.js.',
        );
    }

    const hmacSecret =
        process.env.PYTHON_HMAC_SECRET?.trim() || process.env.HMAC_SECRET?.trim();
    if (hmacSecret) {
        headers['X-Ready2Go-Signature'] = createHmac('sha256', hmacSecret)
            .update(rawBody)
            .digest('hex');
    }
    return headers;
}

const INTEGRITY_FALLBACK = {
    status: 'Under Review',
    score: 50,
    summary: 'Analysis unavailable — will retry on next request.',
};

function fallbackResult(reason: string): CoopIntegrityAnalysisResult {
    console.error(`[continuity-integrity] analyze fallback: ${reason}`);
    return { ...INTEGRITY_FALLBACK, analyzedAt: new Date(), degraded: true };
}

function mapPythonAnalyzeToResult(data: PythonAnalyzeResponse): CoopIntegrityAnalysisResult {
    const analyzedAt = data.analyzedAt ? new Date(data.analyzedAt) : new Date();
    const normalizedStatus = normalizeIntegrityStatusLabel(data.status);

    return {
        status: normalizedStatus,
        score:
            typeof data.score === 'number' && Number.isFinite(data.score)
                ? Math.min(100, Math.max(0, Math.round(data.score)))
                : INTEGRITY_FALLBACK.score,
        summary: String(data.summary || INTEGRITY_FALLBACK.summary).slice(0, 2000),
        analyzedAt,
        degraded: Boolean(data.details?.degraded),
        componentScores: data.details?.componentScores,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll GET /v1/integrity/result/{attachmentId} after POST /analyze returns 202 (§9.1.1). */
async function pollIntegrityAnalysisResult(
    baseUrl: string,
    attachmentId: string,
    deadlineMs: number,
): Promise<CoopIntegrityAnalysisResult | null> {
    const pollUrl = `${baseUrl}/v1/integrity/result/${encodeURIComponent(attachmentId)}`;
    const headers = buildBearerHeaders();

    while (Date.now() < deadlineMs) {
        const res = await fetch(pollUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(30_000),
        });

        if (res.status === 404) {
            await sleep(POLL_INTERVAL_MS);
            continue;
        }

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            console.warn(
                `[continuity-integrity] poll HTTP ${res.status} for ${pollUrl}: ${errBody.slice(0, 200)}`,
            );
            await sleep(POLL_INTERVAL_MS);
            continue;
        }

        const data = (await res.json()) as PythonAsyncAnalyzeResponse & PythonAnalyzeResponse;

        if (data.state === 'processing') {
            await sleep(POLL_INTERVAL_MS);
            continue;
        }

        if (data.state === 'error') {
            return fallbackResult(
                typeof data.detail === 'string' && data.detail.trim()
                    ? data.detail.trim()
                    : `Analysis job failed (attachmentId=${attachmentId})`,
            );
        }

        if (data.state === 'done' && data.result) {
            return mapPythonAnalyzeToResult(data.result);
        }

        if (typeof data.score === 'number' && data.summary) {
            return mapPythonAnalyzeToResult(data);
        }

        await sleep(POLL_INTERVAL_MS);
    }

    return null;
}

export type CoopIntegrityAnalysisResult = {
    status: string;
    score: number;
    summary: string;
    analyzedAt: Date;
    degraded?: boolean;
    componentScores?: {
        content?: number | null;
        name?: number | null;
        quality?: number | null;
        duplication?: number | null;
    };
};

export type AnalyzeCoopAttachmentParams = {
    ownerUserId: string;
    plan: {
        planId: string;
        label: string;
        overview: string;
        category?: string;
        steps?: string[];
    };
    attachment: {
        attachmentId: string;
        fileName: string;
        fileExtension: string;
        fileMime: string;
        fileSizeBytes: number;
        fileUrl: string;
        cloudinaryPublicId?: string;
        cloudinaryResourceType?: string;
    };
};

export async function analyzeCoopAttachmentViaPython(
    params: AnalyzeCoopAttachmentParams,
): Promise<CoopIntegrityAnalysisResult> {
    const baseUrl = getPythonIntegrityBaseUrl();
    const tenantKey = buildPythonTenantKey(params.ownerUserId);
    const payload = {
        tenantContext: {
            tenantKey,
            actorUserId: String(params.ownerUserId),
        },
        plan: {
            planId: params.plan.planId,
            label: params.plan.label,
            overview: params.plan.overview || '',
            category: params.plan.category || 'coop',
            steps: Array.isArray(params.plan.steps) ? params.plan.steps.map(String) : [],
        },
        attachment: {
            attachmentId: params.attachment.attachmentId,
            fileName: params.attachment.fileName,
            fileExtension: params.attachment.fileExtension,
            fileMime: params.attachment.fileMime,
            fileSizeBytes: params.attachment.fileSizeBytes,
            fileUrl: params.attachment.fileUrl,
            cloudinaryPublicId: params.attachment.cloudinaryPublicId ?? null,
            cloudinaryResourceType: params.attachment.cloudinaryResourceType ?? null,
        },
    };

    const rawBody = JSON.stringify(payload);
    const deadlineMs = Date.now() + ANALYZE_POLL_TIMEOUT_MS;

    try {
        let headers: Record<string, string>;
        try {
            headers = buildAuthHeaders(rawBody);
        } catch (configErr) {
            return fallbackResult(configErr instanceof Error ? configErr.message : String(configErr));
        }

        const res = await fetch(`${baseUrl}/v1/integrity/analyze`, {
            method: 'POST',
            headers,
            body: rawBody,
            signal: AbortSignal.timeout(60_000),
        });

        if (res.status === 202) {
            const asyncData = (await res.json()) as PythonAsyncAnalyzeResponse;
            const pollAttachmentId =
                asyncData.attachmentId || params.attachment.attachmentId;
            const polled = await pollIntegrityAnalysisResult(
                baseUrl,
                pollAttachmentId,
                deadlineMs,
            );
            if (!polled) {
                return fallbackResult(
                    `Timed out waiting for integrity result (attachmentId=${pollAttachmentId})`,
                );
            }
            return polled;
        }

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            return fallbackResult(`HTTP ${res.status} from ${baseUrl}/v1/integrity/analyze — ${errBody.slice(0, 300)}`);
        }

        const data = (await res.json()) as PythonAnalyzeResponse;
        return mapPythonAnalyzeToResult(data);
    } catch (err) {
        return fallbackResult(
            `${baseUrl}/v1/integrity/analyze — ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

export async function generateContinuityAuditViaPython(
    ownerUserId: string,
    input: ContinuityAuditInput,
): Promise<(ContinuityAuditSummary & { degraded?: boolean }) | null> {
    const baseUrl = getPythonIntegrityBaseUrl();
    const payload = {
        tenantContext: {
            tenantKey: buildPythonTenantKey(ownerUserId),
            actorUserId: String(ownerUserId),
        },
        totals: input.totals,
        averageScore: input.averageScore,
        counts: input.counts,
        integrity: {
            compliant: input.integrity.compliant,
            underReview: input.integrity.underReview,
            nonCompliant: input.integrity.nonCompliant,
            unanalyzed: input.integrity.unanalyzed,
        },
        plans: input.plans.map((p) => ({
            planId: p.planId,
            label: p.label,
            category: p.category,
            attachmentCount: p.attachmentCount,
            stepCount: p.stepCount,
            attachments: p.attachments.map((a) => ({
                fileName: a.fileName,
                status: a.status ? normalizeIntegrityStatusLabel(a.status) : undefined,
                score: a.score,
                summary: a.summary,
            })),
        })),
    };

    const rawBody = JSON.stringify(payload);

    try {
        let headers: Record<string, string>;
        try {
            headers = buildAuthHeaders(rawBody);
        } catch (configErr) {
            console.error('python-integrity audit config error:', configErr);
            return null;
        }

        const res = await fetch(`${baseUrl}/v1/audit/summary`, {
            method: 'POST',
            headers,
            body: rawBody,
            signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
        });

        if (!res.ok) {
            console.error('python-integrity audit HTTP error:', res.status, await res.text().catch(() => ''));
            return null;
        }

        const data = (await res.json()) as PythonAuditSummaryResponse;
        const posture = data.posture;
        const validPosture =
            posture === 'Resilient' || posture === 'Steady' || posture === 'At Risk'
                ? posture
                : derivePostureFromInput(input);

        const findings = Array.isArray(data.findings)
            ? data.findings.map((f) => String(f ?? '').trim()).filter(Boolean).slice(0, 8)
            : [];

        return {
            summary: String(data.summary || '').slice(0, 1500),
            findings,
            posture: validPosture,
            averageScore:
                typeof data.averageScore === 'number' && Number.isFinite(data.averageScore)
                    ? Math.round(data.averageScore)
                    : input.averageScore,
            degraded: Boolean(data.degraded),
        };
    } catch (err) {
        console.error('python-integrity audit failed:', err);
        return null;
    }
}

export function derivePostureFromInput(input: ContinuityAuditInput): ContinuityAuditSummary['posture'] {
    if (!input.totals.plans) return 'At Risk';
    const { nonCompliant, underReview } = input.integrity;
    const { analyzed } = input.totals;
    const avg = input.averageScore;
    if (!analyzed || nonCompliant > 0 || avg < 55) return 'At Risk';
    if (underReview > 0 || avg < 75) return 'Steady';
    return 'Resilient';
}

/** Clear Python cache so the next /analyze rebuilds vectors (§9.2). */
export async function rescanIntegrityAttachments(
    ownerUserId: string,
    attachmentIds: string[],
    force = false,
): Promise<{ scheduled: number; skipped: number; message: string } | null> {
    if (!attachmentIds.length) return null;

    const baseUrl = getPythonIntegrityBaseUrl();
    const payload = {
        attachmentIds,
        tenantKey: buildPythonTenantKey(ownerUserId),
        force,
    };
    const rawBody = JSON.stringify(payload);

    try {
        const headers = buildAuthHeaders(rawBody);
        const res = await fetch(`${baseUrl}/v1/integrity/rescan`, {
            method: 'POST',
            headers,
            body: rawBody,
            signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
            console.error('python-integrity rescan HTTP error:', res.status, await res.text().catch(() => ''));
            return null;
        }
        return (await res.json()) as { scheduled: number; skipped: number; message: string };
    } catch (err) {
        console.error('python-integrity rescan failed:', err);
        return null;
    }
}
