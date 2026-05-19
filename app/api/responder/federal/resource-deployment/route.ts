import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import { getFederalResourceDeployment, setFederalResourceDeployment } from '@/lib/services/responder';

export async function GET() {
    try {
        const gate = await gateResponder('federal');
        if (!gate.ok) return gate.response;

        const data = getFederalResourceDeployment();
        return NextResponse.json(data);
    } catch (e) {
        console.error('Error fetching federal data:', e);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const gate = await gateResponder('federal');
        if (!gate.ok) return gate.response;

        const body = await req.json();
        const updated = setFederalResourceDeployment({
            ...getFederalResourceDeployment(),
            ...body,
            updatedAt: new Date().toISOString(),
        });
        
        return NextResponse.json(updated);
    } catch (e) {
        console.error('Error updating federal data:', e);
        return NextResponse.json({ error: 'Failed to update data' }, { status: 500 });
    }
}
