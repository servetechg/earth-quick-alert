import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import {
    fetchAllApprovedResponderRecipients,
    fetchSubAdminResponderRecipients,
} from '@/lib/services/dashboard-snapshot-recipients';

export async function GET() {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        const userId = session?.user?.id as string | undefined;

        if (!role || !userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (role !== 'super-admin' && role !== 'sub-admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const responders =
            role === 'sub-admin'
                ? await fetchSubAdminResponderRecipients(userId)
                : await fetchAllApprovedResponderRecipients();

        return NextResponse.json({
            responders,
            scoped: role === 'sub-admin',
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load recipients';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
