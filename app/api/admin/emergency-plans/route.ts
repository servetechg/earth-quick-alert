import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmergencyPlan from '@/models/EmergencyPlan';
import { getSession } from '@/lib/auth';
import { uploadEmergencyPlanBuffer } from '@/lib/emergency-plan-cloudinary';
import { openaiService } from '@/lib/services/openai-service';
import { extractTextFromBuffer, FAST_TEXT_CAP } from '@/lib/emergency-plan-ai-integrity';

export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024;

/** Continuity vault — PDF, Word, CSV, Excel only */
const ALLOWED_EXT = new Set(['pdf', 'docx', 'csv', 'xlsx']);

function canManageEmergencyPlans(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin' || role === 'admin';
}

function extensionFromFilename(name: string): string {
    const m = /\.([^.]+)$/i.exec(name.trim());
    return m ? m[1].toLowerCase() : '';
}

function mimeFromExtension(ext: string): string {
    const map: Record<string, string> = {
        pdf: 'application/pdf',
        csv: 'text/csv',
        txt: 'text/plain',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return map[ext] || 'application/octet-stream';
}

function asNonEmptyString(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s.length ? s : null;
}

const PLAN_ID_RE = /^[a-z0-9][a-z0-9-_]*$/i;

const PLAN_CATEGORIES = ['coop', 'bcp', 'compliance'] as const;
type PlanCategory = typeof PLAN_CATEGORIES[number];

function normalizeCategory(v: unknown): PlanCategory | null {
    if (typeof v !== 'string') return null;
    const s = v.trim().toLowerCase();
    return (PLAN_CATEGORIES as readonly string[]).includes(s) ? (s as PlanCategory) : null;
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const plans = await EmergencyPlan.find({});
        const dataMap = plans.reduce(
            (acc, plan) => {
                acc[plan.planId] = {
                    id: plan._id,
                    label: plan.label,
                    overview: plan.overview,
                    category: plan.category,
                    steps: plan.steps,
                    attachments: plan.attachments,
                };
                return acc;
            },
            {} as Record<string, unknown>
        );

        return NextResponse.json({ success: true, data: dataMap });
    } catch (error) {
        console.error('Fetch EmergencyPlans error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch plans' }, { status: 500 });
    }
}

/** Create or replace metadata for a plan (no file). */
export async function PUT(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        let body: { planId?: unknown; label?: unknown; overview?: unknown; category?: unknown };
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
        }

        const planId = asNonEmptyString(body?.planId);
        const label = asNonEmptyString(body?.label);
        const overview = asNonEmptyString(body?.overview) ?? '';
        const category = normalizeCategory(body?.category);

        if (!planId || !PLAN_ID_RE.test(planId)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'planId must be a non-empty slug (letters, numbers, hyphen, underscore)',
                },
                { status: 400 }
            );
        }

        if (!label) {
            return NextResponse.json({ success: false, error: 'label is required' }, { status: 400 });
        }

        if (body?.category !== undefined && !category) {
            return NextResponse.json(
                { success: false, error: `category must be one of: ${PLAN_CATEGORIES.join(', ')}` },
                { status: 400 }
            );
        }

        let plan = await EmergencyPlan.findOne({ planId });
        if (!plan) {
            plan = new EmergencyPlan({
                planId,
                label,
                overview,
                ...(category ? { category } : {}),
                steps: [],
                attachments: [],
            });
        } else {
            plan.label = label;
            plan.overview = overview;
            if (category) plan.category = category;
        }

        await plan.save();
        return NextResponse.json({ success: true, message: 'Plan saved', data: plan });
    } catch (error: unknown) {
        const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: number }).code : undefined;
        if (code === 11000) {
            return NextResponse.json({ success: false, error: 'Duplicate plan key' }, { status: 409 });
        }
        console.error('EmergencyPlan PUT error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

/** Patch label / overview on an existing plan. */
export async function PATCH(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        let body: { planId?: unknown; label?: unknown; overview?: unknown; category?: unknown };
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
        }

        const planId = asNonEmptyString(body?.planId);
        if (!planId) {
            return NextResponse.json({ success: false, error: 'planId is required' }, { status: 400 });
        }

        const label = typeof body.label === 'string' ? body.label.trim() : undefined;
        const overview = typeof body.overview === 'string' ? body.overview.trim() : undefined;
        const categoryProvided = body.category !== undefined;
        const category = categoryProvided ? normalizeCategory(body.category) : undefined;

        if (categoryProvided && !category) {
            return NextResponse.json(
                { success: false, error: `category must be one of: ${PLAN_CATEGORIES.join(', ')}` },
                { status: 400 }
            );
        }

        if (label === undefined && overview === undefined && !categoryProvided) {
            return NextResponse.json({ success: false, error: 'Provide label, overview, and/or category' }, { status: 400 });
        }

        const plan = await EmergencyPlan.findOne({ planId });
        if (!plan) {
            return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
        }

        if (label !== undefined) {
            if (!label.length) return NextResponse.json({ success: false, error: 'label cannot be empty' }, { status: 400 });
            plan.label = label;
        }
        if (overview !== undefined) {
            plan.overview = overview;
        }
        if (category) {
            plan.category = category;
        }

        await plan.save();
        return NextResponse.json({ success: true, message: 'Plan updated', data: plan });
    } catch (error) {
        console.error('EmergencyPlan PATCH error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const formData = await req.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ success: false, error: 'Missing file' }, { status: 400 });
        }

        const ext = extensionFromFilename(file.name);
        if (!ALLOWED_EXT.has(ext)) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Unsupported file type ".${ext || '?'}"`,
                },
                { status: 415 }
            );
        }

        if (file.size <= 0) {
            return NextResponse.json({ success: false, error: 'Empty file' }, { status: 400 });
        }

        if (file.size > MAX_BYTES) {
            return NextResponse.json(
                {
                    success: false,
                    error: `File too large. Maximum ${Math.round(MAX_BYTES / (1024 * 1024))} MB`,
                },
                { status: 413 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const mime = file.type && file.type.trim() ? file.type.trim() : mimeFromExtension(ext);

        const upload = await uploadEmergencyPlanBuffer({
            buffer,
            mime,
            filename: file.name.replace(/[^\w.-]+/g, '_'),
        });

        // Extract text once so both AI metadata inference and AI integrity reuse it.
        let extractedText = '';
        try {
            extractedText = await extractTextFromBuffer(buffer, ext, {
                maxChars: FAST_TEXT_CAP,
                maxSheets: 5,
            });
        } catch (extractErr) {
            console.error('EmergencyPlan upload text extract:', extractErr);
        }

        let metadata;
        try {
            metadata = await openaiService.inferCoopPlanMetadata({
                fileName: file.name,
                fileExtension: ext,
                fileSizeBytes: buffer.length,
                extractedText: extractedText || undefined,
            });
        } catch (metaErr) {
            console.error('EmergencyPlan upload metadata inference:', metaErr);
            metadata = null;
        }

        const resolvedPlanId = metadata?.planId
            || file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
            || `upload-${Date.now()}`;
        const resolvedLabel = metadata?.label || file.name.replace(/\.[^.]+$/, '');
        const resolvedCategory = metadata?.category || 'coop';
        const resolvedOverview = metadata?.overview || `Imported ${ext.toUpperCase()} continuity artifact pending review.`;

        let plan = await EmergencyPlan.findOne({ planId: resolvedPlanId });
        const planExisted = Boolean(plan);
        if (!plan) {
            plan = new EmergencyPlan({
                planId: resolvedPlanId,
                label: resolvedLabel,
                overview: resolvedOverview,
                category: resolvedCategory,
                steps: [],
                attachments: [],
            });
        }

        plan.attachments.push({
            fileName: file.name,
            fileUrl: upload.secure_url,
            size: buffer.length,
            uploadedAt: new Date(),
            cloudinaryPublicId: upload.public_id,
            cloudinaryResourceType: upload.resource_type,
        });

        await plan.save();

        let responsePlan = plan;
        const lastAtt = plan.attachments[plan.attachments.length - 1];
        const attachmentId = lastAtt?._id;

        if (attachmentId) {
            try {
                const result = await openaiService.analyzeCoopAttachmentIntegrity({
                    planLabel: plan.label,
                    planOverview: plan.overview || '',
                    steps: Array.isArray(plan.steps) ? plan.steps.map(String) : [],
                    fileName: file.name,
                    fileExtension: ext,
                    fileSizeBytes: buffer.length,
                    extractedText: extractedText || undefined,
                    maxExcerptChars: FAST_TEXT_CAP,
                });

                await EmergencyPlan.updateOne(
                    { planId: resolvedPlanId, 'attachments._id': attachmentId },
                    {
                        $set: {
                            'attachments.$.aiIntegrityStatus': result.status,
                            'attachments.$.aiIntegrityScore': result.score,
                            'attachments.$.aiIntegritySummary': result.summary,
                            'attachments.$.aiIntegrityAnalyzedAt': new Date(),
                        },
                    }
                );
            } catch (aiErr) {
                console.error('EmergencyPlan upload AI integrity:', aiErr);
            }
            responsePlan = (await EmergencyPlan.findOne({ planId: resolvedPlanId })) ?? plan;
        }

        return NextResponse.json({
            success: true,
            message: planExisted ? 'File attached to existing plan' : 'New plan created and file uploaded',
            attachedToExistingPlan: planExisted,
            planId: resolvedPlanId,
            data: responsePlan,
        });
    } catch (error) {
        console.error('EmergencyPlan POST error:', error);
        return NextResponse.json({ success: false, error: 'Upload failed — check Cloudinary credentials and retry' }, { status: 500 });
    }
}
