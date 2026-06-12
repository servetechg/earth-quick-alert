import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ContinuityPlan from '@/models/ContinuityPlan';
import ContinuityAuditReport from '@/models/ContinuityAuditReport';
import { getSession } from '@/lib/auth';
import {
    analyzeCoopAttachmentIntegrity,
    persistCoopAttachmentIntegrity,
} from '@/lib/services/continuity-integrity-service';
import {
    deleteIntegrityAttachments,
    usePythonIntegrityBackend,
} from '@/lib/services/python-integrity-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

function canManageEmergencyPlans(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin' || role === 'admin';
}

function asNonEmptyString(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s.length ? s : null;
}

function extensionFromFilename(name: string): string {
    const m = /\.([^.]+)$/i.exec(name.trim());
    return m ? m[1].toLowerCase() : '';
}

function mimeFromExtension(ext: string): string {
    const map: Record<string, string> = {
        pdf: 'application/pdf',
        csv: 'text/csv',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return map[ext] || 'application/octet-stream';
}

/**
 * Analyze (or re-analyze) a single attachment.
 * Body: { planId, attachmentId, force?: boolean }
 * When `force` is true the AI cache is purged first (DELETE /attachments) so the pipeline recomputes.
 */
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        let body: { planId?: unknown; attachmentId?: unknown; force?: unknown };
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
        }

        const planId = asNonEmptyString(body?.planId);
        const attachmentId = asNonEmptyString(body?.attachmentId);
        const force = body?.force === true;

        if (!planId || !attachmentId) {
            return NextResponse.json(
                { success: false, error: 'planId and attachmentId are required' },
                { status: 400 },
            );
        }
        if (!mongoose.Types.ObjectId.isValid(attachmentId)) {
            return NextResponse.json({ success: false, error: 'Invalid attachment id' }, { status: 400 });
        }

        const ownerUserId = session.user.id;
        const plan = await ContinuityPlan.findOne({ ownerUserId, planId });
        if (!plan) {
            return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
        }

        const att = plan.attachments.find((a) => a._id?.toString() === attachmentId);
        if (!att) {
            return NextResponse.json({ success: false, error: 'Attachment not found on plan' }, { status: 404 });
        }

        const ext = extensionFromFilename(att.fileName);
        const mime = mimeFromExtension(ext);

        // Re-analyze: clear the AI cache first so POST /analyze recomputes (contract §3.E / §9.3).
        if (force && usePythonIntegrityBackend()) {
            await deleteIntegrityAttachments(String(ownerUserId), [attachmentId]);
        }

        const result = await analyzeCoopAttachmentIntegrity({
            ownerUserId: String(ownerUserId),
            plan: {
                planId: plan.planId,
                label: plan.label,
                overview: plan.overview || '',
                category: plan.category,
                steps: Array.isArray(plan.steps) ? plan.steps.map(String) : [],
            },
            attachment: {
                attachmentId: String(attachmentId),
                fileName: att.fileName,
                fileExtension: ext,
                fileMime: mime,
                fileSizeBytes: typeof att.size === 'number' ? att.size : 0,
                fileUrl: att.fileUrl,
                cloudinaryPublicId: att.cloudinaryPublicId,
                cloudinaryResourceType: att.cloudinaryResourceType as string | undefined,
            },
        });

        await persistCoopAttachmentIntegrity(String(ownerUserId), planId, attachmentId, result);

        // Inventory changed — drop the cached audit so the next Generate refreshes it.
        await ContinuityAuditReport.deleteOne({ ownerUserId }).catch((e) => {
            console.warn('[continuity-analyze] failed to clear cached audit report:', e);
        });

        return NextResponse.json({
            success: true,
            data: {
                attachmentId: String(attachmentId),
                status: result.status,
                score: result.score,
                summary: result.summary,
                analyzedAt: result.analyzedAt,
                degraded: result.degraded === true,
                cacheHit: result.cacheHit === true,
                componentScores: result.componentScores ?? null,
            },
        });
    } catch (error) {
        console.error('ContinuityPlan analyze error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
