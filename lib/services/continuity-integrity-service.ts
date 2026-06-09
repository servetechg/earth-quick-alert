import ContinuityPlan from '@/models/ContinuityPlan';
import {
    openaiService,
    type ContinuityAuditInput,
    type ContinuityAuditSummary,
} from '@/lib/services/openai-service';
import {
    analyzeCoopAttachmentViaPython,
    derivePostureFromInput,
    generateContinuityAuditViaPython,
    normalizeIntegrityStatusLabel,
    usePythonIntegrityBackend,
    type AnalyzeCoopAttachmentParams,
    type CoopIntegrityAnalysisResult,
} from '@/lib/services/python-integrity-client';

export type { CoopIntegrityAnalysisResult };

export async function persistCoopAttachmentIntegrity(
    ownerUserId: string,
    planId: string,
    attachmentId: unknown,
    result: CoopIntegrityAnalysisResult,
): Promise<void> {
    await ContinuityPlan.updateOne(
        { ownerUserId, planId, 'attachments._id': attachmentId },
        {
            $set: {
                'attachments.$.aiIntegrityStatus': result.status,
                'attachments.$.aiIntegrityScore': result.score,
                'attachments.$.aiIntegritySummary': result.summary,
                'attachments.$.aiIntegrityAnalyzedAt': result.analyzedAt,
            },
        },
    );
}

/** Run attachment integrity via Python (default) or legacy OpenAI-in-Next.js path. */
export async function analyzeCoopAttachmentIntegrity(
    params: AnalyzeCoopAttachmentParams & {
        extractedText?: string;
        maxExcerptChars?: number;
    },
): Promise<CoopIntegrityAnalysisResult> {
    if (usePythonIntegrityBackend()) {
        return analyzeCoopAttachmentViaPython(params);
    }

    const result = await openaiService.analyzeCoopAttachmentIntegrity({
        planLabel: params.plan.label,
        planOverview: params.plan.overview || '',
        steps: Array.isArray(params.plan.steps) ? params.plan.steps.map(String) : [],
        fileName: params.attachment.fileName,
        fileExtension: params.attachment.fileExtension,
        fileSizeBytes: params.attachment.fileSizeBytes,
        extractedText: params.extractedText,
        maxExcerptChars: params.maxExcerptChars,
    });

    return {
        ...result,
        status: normalizeIntegrityStatusLabel(result.status),
        analyzedAt: new Date(),
    };
}

export type ContinuityAuditResult = ContinuityAuditSummary & {
    degraded?: boolean;
};

/** Generate org-wide audit narrative via Python (default) with OpenAI fallback. */
export async function generateContinuityAuditSummary(
    ownerUserId: string,
    input: ContinuityAuditInput,
): Promise<ContinuityAuditResult> {
    if (usePythonIntegrityBackend()) {
        const pythonResult = await generateContinuityAuditViaPython(ownerUserId, input);
        if (pythonResult?.summary) {
            return pythonResult;
        }
    }

    const openaiResult = await openaiService.generateContinuityAuditSummary(input);
    if (openaiResult.summary) {
        return openaiResult;
    }

    return {
        summary: input.totals.plans
            ? `Continuity vault holds ${input.totals.plans} plan${input.totals.plans === 1 ? '' : 's'} and ${input.totals.attachments} attachment${input.totals.attachments === 1 ? '' : 's'}.`
            : 'No continuity plans yet — register a plan to begin tracking COOP/BCP/Compliance posture.',
        findings: [],
        posture: derivePostureFromInput(input),
        averageScore: input.averageScore,
    };
}
