import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import EmergencyPlan from '@/models/EmergencyPlan';
import { getSession } from '@/lib/auth';
import { destroyEmergencyPlanAsset } from '@/lib/emergency-plan-cloudinary';
import type { EmergencyPlanCloudinaryResource } from '@/lib/emergency-plan-cloudinary';

export const runtime = 'nodejs';

function canManageEmergencyPlans(role: string | undefined) {
    return role === 'super-admin' || role === 'sub-admin' || role === 'admin';
}

function asNonEmptyString(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s.length ? s : null;
}

function safeUploadsRelativePath(fileUrl: string): string | null {
    const u = asNonEmptyString(fileUrl);
    if (!u || !u.startsWith('/uploads/')) return null;
    const rel = u.slice('/uploads/'.length);
    if (!rel || rel.includes('..') || rel.includes('/') || rel.includes('\\')) return null;
    return rel;
}

export async function DELETE(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.role || !canManageEmergencyPlans(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        let body: { planId?: unknown; attachmentId?: unknown };
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
        }

        const planId = asNonEmptyString(body?.planId);
        const attachmentId = asNonEmptyString(body?.attachmentId);

        if (!planId || !attachmentId) {
            return NextResponse.json(
                { success: false, error: 'planId and attachmentId are required' },
                { status: 400 }
            );
        }

        if (!mongoose.Types.ObjectId.isValid(attachmentId)) {
            return NextResponse.json({ success: false, error: 'Invalid attachment id' }, { status: 400 });
        }

        const subdocId = new mongoose.Types.ObjectId(attachmentId);

        const plan = await EmergencyPlan.findOne({ planId });
        if (!plan) {
            return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
        }

        const att = plan.attachments.find((a) => a._id?.toString() === attachmentId);
        if (!att) {
            return NextResponse.json({ success: false, error: 'Attachment not found on plan' }, { status: 404 });
        }

        if (att.cloudinaryPublicId && att.cloudinaryResourceType) {
            try {
                await destroyEmergencyPlanAsset(
                    att.cloudinaryPublicId,
                    att.cloudinaryResourceType as EmergencyPlanCloudinaryResource
                );
            } catch (e) {
                console.error('Cloudinary destroy error:', e);
                return NextResponse.json(
                    { success: false, error: 'Failed to delete file from Cloudinary' },
                    { status: 502 }
                );
            }
        } else if (typeof att.fileUrl === 'string' && att.fileUrl.startsWith('/uploads/')) {
            const rel = safeUploadsRelativePath(att.fileUrl);
            if (rel) {
                try {
                    await unlink(join(process.cwd(), 'public', 'uploads', rel));
                } catch {
                    // stale local file — still remove DB row
                }
            }
        }

        await EmergencyPlan.updateOne({ planId }, { $pull: { attachments: { _id: subdocId } } });

        const updated = await EmergencyPlan.findOne({ planId });
        return NextResponse.json({ success: true, message: 'Attachment deleted', data: updated });
    } catch (error) {
        console.error('EmergencyPlan attachment DELETE error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
