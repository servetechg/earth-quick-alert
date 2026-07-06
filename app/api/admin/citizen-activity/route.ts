import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import IncidentReport from '@/models/IncidentReport';
import { getSession } from '@/lib/auth';
import { getSubAdminTextLocationFilter } from '@/lib/admin-filters';
import type { CitizenActivityFilter } from '@/lib/citizen-activity/types';
import { mapIncidentReportToActivity, mergeActivityItems } from '@/lib/citizen-activity/map-sources';
import {
    buildActivityStatsFromItems,
    filterActivityItems,
    listCitizenActivitiesForAdmin,
} from '@/lib/services/citizen-activity-service';

const ALLOWED_ROLES = new Set([
    'super-admin',
    'admin',
    'sub-admin',
    'observer',
    'manager',
    'eoc-manager',
    'eoc-observer',
]);

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = request.nextUrl;
        const filter = (searchParams.get('filter') ?? 'all') as CitizenActivityFilter;
        const query = searchParams.get('q') ?? '';
        const limitRaw = Number.parseInt(searchParams.get('limit') ?? '100', 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

        const userId = session.user.id as string;

        const stored = await listCitizenActivitiesForAdmin({
            adminUserId: userId,
            role,
            filter: 'all',
            query: '',
            limit: 500,
        });

        const incidentQuery: Record<string, unknown> = {};
        if (role === 'sub-admin') {
            const incFilter = await getSubAdminTextLocationFilter(userId, 'location');
            if (incFilter) incidentQuery.$and = [incFilter];
        }

        const incidentDocs = await IncidentReport.find(incidentQuery)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        const fromIncidents = incidentDocs.map((doc) =>
            mapIncidentReportToActivity(doc as Parameters<typeof mapIncidentReportToActivity>[0]),
        );

        const merged = mergeActivityItems(stored.items, fromIncidents);
        const items = filterActivityItems(merged, filter, query).slice(0, limit);
        const stats = buildActivityStatsFromItems(filterActivityItems(merged, 'all', ''));

        return NextResponse.json({
            items,
            stats,
            source: 'live',
        });
    } catch (error) {
        console.error('[citizen-activity] GET failed:', error);
        return NextResponse.json({ error: 'Failed to load citizen activity feed' }, { status: 500 });
    }
}
