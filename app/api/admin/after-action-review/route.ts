import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmergencyEvent from '@/models/EmergencyEvent';
import IncidentReport from '@/models/IncidentReport';
import WeatherAlertRecord from '@/models/WeatherAlertRecord';
import { openaiService } from '@/lib/services/openai-service';
import { getSession } from '@/lib/auth';
import { getSubAdminTextLocationFilter } from '@/lib/admin-filters';
import { resolveDemoSessionContext, buildDemoAfterActionReview } from '@/lib/demo/provider';
import { fetchAlignedUnifiedEventFeed } from '@/lib/services/alert-communication-aligned-feed';
import {
    fetchScopedCitizenMarkers,
    fetchScopedResponderMarkers,
} from '@/lib/services/situational-map-markers';
import {
    buildAfterActionFromEmergencyEvent,
    buildAfterActionFromUnifiedEvents,
} from '@/lib/services/after-action-review-builder';
import type { AfterActionReviewData } from '@/lib/types/after-action-review';

function inferTypeFromUnifiedEvents(
    events: Array<{ name?: string; category?: string; properties?: Record<string, unknown> }>,
): string {
    const blob = events.map((e) => `${e.name ?? ''} ${e.category ?? ''}`).join(' ').toLowerCase();
    if (blob.includes('tornado')) return 'Tornado Event';
    if (blob.includes('flood')) return 'Flood Event';
    if (blob.includes('wildfire') || blob.includes('fire')) return 'Wildfire Event';
    if (blob.includes('earthquake')) return 'Earthquake Event';
    if (blob.includes('hurricane')) return 'Hurricane Event';
    return 'Severe Weather Event';
}

export async function GET() {
    try {
        await connectDB();

        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        const userId = session.user.id as string;

        const demoCtx = await resolveDemoSessionContext(userId, session.user.email as string);
        if (demoCtx && role === 'sub-admin') {
            const data = buildDemoAfterActionReview();
            return NextResponse.json({ success: true, data });
        }

        let eventFilter: Record<string, unknown> | null = null;
        let incFilter: Record<string, unknown> | null = null;

        if (role === 'sub-admin') {
            eventFilter = await getSubAdminTextLocationFilter(session.user.id, 'location.address');
            incFilter = await getSubAdminTextLocationFilter(session.user.id, 'location');
        }

        const recentIncidentQuery: Record<string, unknown> = { status: 'resolved' };
        if (eventFilter) recentIncidentQuery.$and = [eventFilter];

        const recentIncident = await EmergencyEvent.findOne(recentIncidentQuery)
            .sort({ updatedAt: -1 })
            .lean();

        if (recentIncident) {
            const formattedEvents = (recentIncident.timeline || []).map((t: { timestamp: Date; description: string }, index: number) => {
                let color = 'blue';
                let eventType = 'System Update';

                if (t.description.toLowerCase().includes('alert')) {
                    color = 'red';
                    eventType = 'Alert Issued';
                } else if (
                    t.description.toLowerCase().includes('responder') ||
                    t.description.toLowerCase().includes('dispatched')
                ) {
                    color = 'blue';
                    eventType = 'Responder Action';
                } else if (
                    t.description.toLowerCase().includes('citizen') ||
                    t.description.toLowerCase().includes('report')
                ) {
                    color = 'green';
                    eventType = 'Citizen Report';
                }

                return {
                    id: index + 1,
                    time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    type: eventType,
                    title: t.description.length > 30 ? `${t.description.substring(0, 30)}...` : t.description,
                    description: t.description,
                    color,
                };
            });

            const incQuery: Record<string, unknown> = {
                createdAt: {
                    $gte: new Date(recentIncident.createdAt),
                    $lte: new Date(recentIncident.updatedAt),
                },
            };
            if (incFilter) incQuery.$and = [incFilter];

            const incidentReports = await IncidentReport.countDocuments(incQuery);

            const highSeverityAlerts = await WeatherAlertRecord.countDocuments({
                severity: { $in: ['high', 'severe', 'extreme'] },
                timestamp: {
                    $gte: new Date(recentIncident.createdAt),
                    $lte: new Date(recentIncident.updatedAt),
                },
            });

            const aiInsights = await openaiService.generateAfterActionInsights({
                incidentType: recentIncident.type,
                timelineEvents: Array.isArray(recentIncident.timeline) ? recentIncident.timeline.length : 0,
                incidentReports,
                highSeverityAlerts,
            });

            const data = buildAfterActionFromEmergencyEvent(
                recentIncident as Parameters<typeof buildAfterActionFromEmergencyEvent>[0],
                aiInsights,
                {
                    incidentReports,
                    highSeverityAlerts,
                    timelineEvents: formattedEvents.length,
                },
            );

            if (formattedEvents.length > 0) {
                data.events = formattedEvents as AfterActionReviewData['events'];
            }

            return NextResponse.json({ success: true, data });
        }

        // Fallback: build review from aligned unified events in jurisdiction (live sub-admin / super-admin)
        const alignedRows = await fetchAlignedUnifiedEventFeed({ userId, role });
        if (alignedRows.length === 0) {
            return NextResponse.json({ success: true, data: null });
        }

        const sorted = [...alignedRows].sort((a, b) => {
            const ta = new Date(String(a.issuedAt ?? 0)).getTime();
            const tb = new Date(String(b.issuedAt ?? 0)).getTime();
            return ta - tb;
        });

        const primary = sorted.find((r) =>
            /tornado|warning|emergency/i.test(String(r.name ?? '')),
        ) ?? sorted[sorted.length - 1];

        const issuedAt = String(primary.issuedAt ?? new Date().toISOString());
        const resolvedAt = String(
            sorted[sorted.length - 1]?.expiresAt ??
                primary.expiresAt ??
                new Date(new Date(issuedAt).getTime() + 4 * 60 * 60_000).toISOString(),
        );

        let citizenReports = 0;
        let responderDeployments = 0;
        if (role === 'sub-admin') {
            const [citizens, responders] = await Promise.all([
                fetchScopedCitizenMarkers(userId),
                fetchScopedResponderMarkers(userId),
            ]);
            citizenReports = citizens.length;
            responderDeployments = responders.length;
        }

        const eventType = inferTypeFromUnifiedEvents(sorted as Array<{ name?: string; category?: string }>);

        const aiInsights = await openaiService.generateAfterActionInsights({
            incidentType: eventType,
            timelineEvents: sorted.length,
            incidentReports: citizenReports,
            highSeverityAlerts: sorted.filter((r) =>
                /extreme|severe|high/i.test(String(r.severity ?? '')),
            ).length,
        });

        const data = buildAfterActionFromUnifiedEvents(
            sorted.map((r) => ({
                issuedAt: r.issuedAt as string | undefined,
                name: r.name as string | undefined,
                description: r.description as string | undefined,
                severity: r.severity as string | undefined,
                type: r.type as string | undefined,
                category: r.category as string | undefined,
            })),
            aiInsights,
            {
                id: String(primary._id ?? primary.id ?? 'aligned-primary'),
                name: String(primary.name ?? 'Operational Incident Review'),
                type: eventType,
                location: String(primary.location ?? 'Jurisdiction'),
                issuedAt,
                resolvedAt,
                citizenReports,
                responderDeployments,
            },
        );

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching After Action Review:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch After Action Review data' }, { status: 500 });
    }
}
