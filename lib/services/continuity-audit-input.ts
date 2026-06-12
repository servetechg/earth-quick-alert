import ContinuityPlan from '@/models/ContinuityPlan';
import type { ContinuityAuditInput } from '@/lib/services/openai-service';
import { classifyIntegrityStatusForAudit } from '@/lib/services/python-integrity-client';
import { emptyIntegrityBreakdown } from '@/lib/types/integrity-audit';

const HAZARD_RE =
    /hurricane|earthquake|flood|wildfire|tornado|tsunami|severe|weather|national|dispatch|response|citizen|alert|evacuation/i;
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

/** Aggregate this subadmin's continuity vault for audit generation. */
export async function buildContinuityAuditInput(ownerUserId: string): Promise<ContinuityAuditInput> {
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
    const integrity = emptyIntegrityBreakdown();
    let scoreSum = 0;
    let scoreCount = 0;
    let totalAttachments = 0;
    let analyzed = 0;

    // Only plans that actually hold files count toward the audit — empty shells (e.g. left over
    // before cleanup) must never inflate "N files across M plans".
    const nonEmptyPlans = plans.filter((p) => (p.attachments || []).length > 0);

    const planSummaries: ContinuityAuditInput['plans'] = nonEmptyPlans.map((p) => {
        const cat = resolveCategory(p.category, p.planId);
        const atts = p.attachments || [];
        counts[cat] += atts.length;
        totalAttachments += atts.length;

        const attachmentSummaries = atts.map((a) => {
            const bucket = classifyIntegrityStatusForAudit(a.aiIntegrityStatus);
            integrity[bucket]++;
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
            plans: nonEmptyPlans.length,
            attachments: totalAttachments,
            analyzed,
        },
        averageScore,
        counts,
        integrity,
        plans: planSummaries,
    };
}
