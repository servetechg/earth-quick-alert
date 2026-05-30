import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config';
import { resolveMaxRadiusForState } from '@/lib/geo/license-coverage-radius';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.user.role !== 'super-admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const stateCode = searchParams.get('stateCode') ?? undefined;
        const countryCode = searchParams.get('countryCode') ?? undefined;
        const stateName = searchParams.get('stateName') ?? undefined;
        const countryName = searchParams.get('countryName') ?? undefined;

        if (!stateCode && !stateName) {
            return NextResponse.json(
                { error: 'stateCode or stateName is required' },
                { status: 400 }
            );
        }

        const maxRadiusMile = await resolveMaxRadiusForState(
            { stateCode, countryCode, stateName, countryName },
            GOOGLE_MAPS_API_KEY
        );

        if (maxRadiusMile == null) {
            return NextResponse.json(
                { error: 'Could not resolve state boundaries' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            maxRadiusMile,
            stateCode: stateCode ?? null,
            stateName: stateName ?? null,
            countryCode: countryCode ?? null,
        });
    } catch (error) {
        console.error('coverage-max error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
