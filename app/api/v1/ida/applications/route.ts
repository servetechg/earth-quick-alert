import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { submitIdaApplication } from '@/lib/services/ida-service';
import {
    IDA_FINANCIAL_IMPACT_IDS,
    IDA_HOUSING_DAMAGE_IDS,
    IDA_IMMEDIATE_NEED_IDS,
    IDA_INSURANCE_TYPE_IDS,
    IDA_LIVING_SITUATION_IDS,
    IDA_SAFE_TO_LIVE_IDS,
    IDA_DOCUMENT_KIND_IDS,
} from '@/lib/types/ida';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const mediaRefSchema = z.object({
    url: z.string().url(),
    fileName: z.string().min(1).optional(),
    mimeType: z.string().optional(),
    publicId: z.string().optional(),
    resourceType: z.enum(['image', 'video', 'raw']).optional(),
    kind: z.enum(IDA_DOCUMENT_KIND_IDS).optional(),
});

const schema = z.object({
    invitationId: z.string().min(1),
    applicant: z.record(z.string(), z.unknown()).optional(),
    household: z.record(z.string(), z.unknown()).optional(),
    didEvacuate: z.boolean().nullable().optional(),
    currentLocation: z.string().max(500).optional(),
    homeAccessible: z.boolean().nullable().optional(),
    housingDamage: z.enum(IDA_HOUSING_DAMAGE_IDS),
    safeToLive: z.enum(IDA_SAFE_TO_LIVE_IDS),
    livingSituation: z.enum(IDA_LIVING_SITUATION_IDS),
    livingSituationOther: z.string().max(240).optional(),
    immediateNeeds: z.array(z.enum(IDA_IMMEDIATE_NEED_IDS)).min(1),
    immediateNeedsOther: z.string().max(240).optional(),
    insuranceTypes: z.array(z.enum(IDA_INSURANCE_TYPE_IDS)).min(1),
    insuranceCompany: z.string().max(240).optional(),
    contactedInsurance: z.boolean().nullable().optional(),
    financialImpact: z.enum(IDA_FINANCIAL_IMPACT_IDS),
    documents: z.array(mediaRefSchema).max(20).optional(),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
});

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) return validationError(zodFieldErrors(parsed.error));

        const result = await submitIdaApplication(auth.userId, {
            ...parsed.data,
            applicant: parsed.data.applicant as never,
            household: parsed.data.household as never,
        });
        return apiJson(
            {
                message: 'Application submitted',
                claimNumber: result.claimNumber,
                applicationId: result.applicationId,
                submittedAt: result.submittedAt,
            },
            201,
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'SUBMIT_FAILED';
        if (msg === 'INVITATION_NOT_FOUND') {
            return apiError('Invitation not found', 404, { code: 'NOT_FOUND' });
        }
        if (msg === 'ALREADY_SUBMITTED') {
            return apiError('Application already submitted', 409, { code: 'CONFLICT' });
        }
        if (
            msg === 'HOUSING_DAMAGE_REQUIRED' ||
            msg === 'SAFE_TO_LIVE_REQUIRED' ||
            msg === 'LIVING_SITUATION_REQUIRED' ||
            msg === 'FINANCIAL_IMPACT_REQUIRED' ||
            msg === 'IMMEDIATE_NEEDS_REQUIRED' ||
            msg === 'INSURANCE_TYPES_REQUIRED'
        ) {
            return apiError('Please complete all required sections', 400, {
                code: 'VALIDATION_ERROR',
            });
        }
        console.error('POST /ida/applications:', e);
        return apiError('Failed to submit application', 500);
    }
}
