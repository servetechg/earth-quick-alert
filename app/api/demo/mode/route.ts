import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import {
    clearDemoSimulationCookieOptions,
    demoSimulationCookieOptions,
} from '@/lib/demo/cookie';
import { DEMO_SCENARIO_TITLE, DEMO_PRESENTATION_EMAIL, DEMO_SIMULATION_MAX_AGE_SEC } from '@/lib/demo/constants';
import { isDemoEligibleEmail } from '@/lib/demo/eligibility';

export async function GET() {
    const session = await getSession();
    const email = session?.user?.email as string | undefined;
    const eligible = isDemoEligibleEmail(email);
    const enabled = eligible && (await cookies()).get('demo_simulation')?.value === '1';

    return NextResponse.json({
        eligible,
        enabled,
        email: eligible ? DEMO_PRESENTATION_EMAIL : null,
        scenarioTitle: DEMO_SCENARIO_TITLE,
    });
}

export async function POST(req: Request) {
    const session = await getSession();
    const email = session?.user?.email as string | undefined;

    if (!session?.user?.id || !isDemoEligibleEmail(email)) {
        return NextResponse.json({ error: 'Demo simulation is not available for this account.' }, { status: 403 });
    }

    let body: { enabled?: boolean } = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const jar = await cookies();
    if (body.enabled === true) {
        jar.set(demoSimulationCookieOptions(DEMO_SIMULATION_MAX_AGE_SEC));
    } else {
        jar.set(clearDemoSimulationCookieOptions());
    }

    return NextResponse.json({
        ok: true,
        enabled: body.enabled === true,
        scenarioTitle: DEMO_SCENARIO_TITLE,
    });
}
