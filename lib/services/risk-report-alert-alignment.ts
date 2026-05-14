import type { RiskReport } from '@/lib/types/risk-assessment';
import {
    incidentDistributionFromAlignedAlerts,
    majorMinorFromAlignedAlerts,
} from '@/lib/services/alert-communication-aligned-feed';

/**
 * Forces KPI + bar chart to match the live Alerts & Communication list for this session
 * (same row count; categories derived from each card’s source/name).
 */
export function applyRiskReportToAlignedAlertFeed(report: RiskReport, alignedRows: unknown[]): RiskReport {
    const rows = Array.isArray(alignedRows) ? alignedRows : [];
    const n = rows.length;
    const distro = incidentDistributionFromAlignedAlerts(rows as any[]);
    const { major, minor } = majorMinorFromAlignedAlerts(rows as any[]);
    return {
        ...report,
        incident_distribution: distro,
        alerts_count: n,
        major_incidents: major,
        minor_incidents: minor,
    };
}
