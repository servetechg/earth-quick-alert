import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import {
    getMedicalLogisticsPayload,
    setMedicalLogisticsPayload,
    type MedicalLogisticsResourceDeploymentPayload,
} from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('medical-logistics');
    if (!g.ok) return g.response;
    const payload = getMedicalLogisticsPayload();
    return NextResponse.json(payload);
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('medical-logistics');
    if (!g.ok) return g.response;

    let body: MedicalLogisticsResourceDeploymentPayload;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const updated = setMedicalLogisticsPayload({
        ...body,
        updatedAt: new Date().toISOString(),
    });
    return NextResponse.json(updated);
}

/** @deprecated Prefer PUT */
export async function POST(req: NextRequest) {
    return PUT(req);
}
