import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ContinuityAuditReport from '@/models/ContinuityAuditReport';
import { getSession } from '@/lib/auth';
import { buildContinuityAuditInput } from '@/lib/services/continuity-audit-input';
import { generateContinuityAuditSummary } from '@/lib/services/continuity-integrity-service';
import { normalizeIntegrityBreakdown, type IntegrityBreakdown } from '@/lib/types/integrity-audit';

export const runtime = 'nodejs';
export const maxDuration = 120;

function canManageEmergencyPlans(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin' || role === 'admin';
}

type CachedAudit = {
    summary: string;
    findings: string[];
    posture: 'Resilient' | 'Steady' | 'At Risk';
    averageScore: number;
    totals: { plans: number; attachments: number; analyzed: number };
    integrity: IntegrityBreakdown;
    generatedAt: string;
    degraded?: boolean;
};

function shapeCacheDoc(doc: Record<string, unknown> | null): CachedAudit | null {
    if (!doc) return null;
    const totals = (doc.totals as CachedAudit['totals']) || { plans: 0, attachments: 0, analyzed: 0 };
    const integrity = normalizeIntegrityBreakdown(doc.integrity);
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
        degraded: doc.degraded === true,
    };
}

/** Returns the cached audit summary for the signed-in subadmin. Does NOT call AI. */
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

        const ownerUserId = String(session.user.id);
        const input = await buildContinuityAuditInput(ownerUserId);
        const result = await generateContinuityAuditSummary(ownerUserId, input);

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
                    degraded: result.degraded === true,
                },
            },
            { upsert: true, new: true },
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
