import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ContinuityPlan from '@/models/ContinuityPlan';
import ContinuityAuditReport from '@/models/ContinuityAuditReport';
import { getSession } from '@/lib/auth';
import { openaiService, type ContinuityAuditInput } from '@/lib/services/openai-service';

export const runtime = 'nodejs';

function canManageEmergencyPlans(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin' || role === 'admin';
}

const HAZARD_RE = /hurricane|earthquake|flood|wildfire|tornado|tsunami|severe|weather|national|dispatch|response|citizen|alert|evacuation/i;
const COOP_RE = /staff|human|personnel|hr|employee|workforce|succession|essential|vital.?records|devolution/i;
const BCP_RE = /telecom|communicat|it|network|technical|critical|system|data|supply|vendor|facility/i;

type Category = 'coop' | 'bcp' | 'compliance' | 'response';

function inferCategory(planId: string): Category {
    if (HAZARD_RE.test(planId)) return 'response';
    if (COOP_RE.test(planId)) return 'coop';
    if (BCP_RE.test(planId)) return 'bcp';
    return 'compliance';
}

function resolveCategory(stored: string | undefined, planId: string): Category {
    if (stored === 'coop' || stored === 'bcp' || stored === 'compliance') return stored;
    return inferCategory(planId);
}

type CachedAudit = {
    summary: string;
    findings: string[];
    posture: 'Resilient' | 'Steady' | 'At Risk';
    averageScore: number;
    totals: { plans: number; attachments: number; analyzed: number };
    integrity: { inSync: number; reviewing: number; deviation: number; unanalyzed: number };
    generatedAt: string;
};

function shapeCacheDoc(doc: Record<string, unknown> | null): CachedAudit | null {
    if (!doc) return null;
    const totals = (doc.totals as CachedAudit['totals']) || { plans: 0, attachments: 0, analyzed: 0 };
    const integrity = (doc.integrity as CachedAudit['integrity']) || {
        inSync: 0,
        reviewing: 0,
        deviation: 0,
        unanalyzed: 0,
    };
    const generatedAtRaw = doc.generatedAt;
    const generatedAt =
        generatedAtRaw instanceof Date
            ? generatedAtRaw.toISOString()
            : typeof generatedAtRaw === 'string'
              ? generatedAtRaw
              : new Date().toISOString();
    return {
        summary: typeof doc.summary === 'string' ? doc.summary : '',
        findings: Array.isArray(doc.findings) ? (doc.findings as unknown[]).map(String) : [],
        posture: (doc.posture as CachedAudit['posture']) || 'At Risk',
        averageScore: typeof doc.averageScore === 'number' ? doc.averageScore : 0,
        totals,
        integrity,
        generatedAt,
    };
}

async function buildAuditInput(ownerUserId: string): Promise<ContinuityAuditInput> {
    const plans = await ContinuityPlan.find({ ownerUserId }).lean<
        Array<{
            planId: string;
            label: string;
            overview?: string;
            category?: string;
            steps?: string[];
            attachments?: Array<{
                fileName: string;
                aiIntegrityStatus?: string;
                aiIntegrityScore?: number;
                aiIntegritySummary?: string;
                aiIntegrityAnalyzedAt?: Date;
            }>;
        }>
    >();

    const counts = { coop: 0, bcp: 0, compliance: 0, response: 0 };
    const integrity = { inSync: 0, reviewing: 0, deviation: 0, unanalyzed: 0 };
    let scoreSum = 0;
    let scoreCount = 0;
    let totalAttachments = 0;
    let analyzed = 0;

    const planSummaries: ContinuityAuditInput['plans'] = plans.map((p) => {
        const cat = resolveCategory(p.category, p.planId);
        const atts = p.attachments || [];
        counts[cat] += atts.length;
        totalAttachments += atts.length;

        const attachmentSummaries = atts.map((a) => {
            const status = a.aiIntegrityStatus;
            if (status === 'In Sync') integrity.inSync++;
            else if (status === 'Deviation Found') integrity.deviation++;
            else if (status === 'Reviewing') integrity.reviewing++;
            else integrity.unanalyzed++;
            if (typeof a.aiIntegrityScore === 'number') {
                scoreSum += a.aiIntegrityScore;
                scoreCount++;
            }
            if (a.aiIntegrityAnalyzedAt) analyzed++;
            return {
                fileName: a.fileName,
                status: a.aiIntegrityStatus,
                score: typeof a.aiIntegrityScore === 'number' ? a.aiIntegrityScore : undefined,
                summary: a.aiIntegritySummary,
            };
        });

        return {
            planId: p.planId,
            label: p.label,
            category: cat,
            attachmentCount: atts.length,
            stepCount: Array.isArray(p.steps) ? p.steps.length : 0,
            attachments: attachmentSummaries,
        };
    });

    const averageScore = scoreCount ? Math.round(scoreSum / scoreCount) : 0;

    return {
        totals: {
            plans: plans.length,
            attachments: totalAttachments,
            analyzed,
        },
        averageScore,
        counts,
        integrity,
        plans: planSummaries,
    };
}

/** Returns the cached audit summary for the signed-in subadmin. Does NOT call OpenAI. */
export async function GET() {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        await connectDB();
        const ownerUserId = session.user.id;
        const cached = await ContinuityAuditReport.findOne({ ownerUserId }).lean<Record<string, unknown> | null>();
        return NextResponse.json({ success: true, data: shapeCacheDoc(cached) });
    } catch (error) {
        console.error('continuity audit-summary GET error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

/** Regenerates the audit summary against the subadmin's inventory and persists it. */
export async function POST() {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        await connectDB();

        const ownerUserId = session.user.id;
        const input = await buildAuditInput(ownerUserId);
        const result = await openaiService.generateContinuityAuditSummary(input);

        const now = new Date();
        await ContinuityAuditReport.findOneAndUpdate(
            { ownerUserId },
            {
                $set: {
                    ownerUserId,
                    summary: result.summary,
                    findings: result.findings,
                    posture: result.posture,
                    averageScore: result.averageScore,
                    totals: input.totals,
                    integrity: input.integrity,
                    generatedAt: now,
                },
            },
            { upsert: true, new: true }
        );

        return NextResponse.json({
            success: true,
            data: {
                ...result,
                totals: input.totals,
                integrity: input.integrity,
                generatedAt: now.toISOString(),
            },
        });
    } catch (error) {
        console.error('continuity audit-summary POST error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
