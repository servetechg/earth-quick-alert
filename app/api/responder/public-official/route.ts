import { NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import { getPublicOfficialSummary } from '@/lib/services/responder';

export async function GET() {
    try {
        const gate = await gateResponder('public-official');
        if (!gate.ok) return gate.response;

        const data = getPublicOfficialSummary();
        return NextResponse.json(data);
    } catch (e) {
        console.error('Error fetching public official data:', e);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
