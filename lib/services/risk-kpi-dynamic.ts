import type { DashboardIngestBundle, RiskReport } from '@/lib/types/risk-assessment';

const isFloodHydroEvt = (ev?: string) => /\bflood|\bhydro|\bflash|\bdam\b/i.test(ev ?? '');

const nwsSeverityWeight = (s?: string): number => {
  const x = (s ?? '').toLowerCase();
  if (!x || x === 'unknown') return 1;
  if (x === 'minor') return 2;
  if (x === 'moderate') return 5;
  if (x === 'severe') return 10;
  if (x === 'extreme') return 18;
  return 1;
};

const nwpsFloodPts = (raw?: string): number => {
  const c = (raw ?? '').toLowerCase();
  if (!c || c.includes('unknown')) return 2;
  if (c.includes('major')) return 28;
  if (c.includes('moderate')) return 22;
  if (c.includes('minor')) return 14;
  if (c.includes('action')) return 10;
  if (c.includes('no_flood')) return 5;
  return 4;
};

const magWeight = (mag: number): number => {
  if (!Number.isFinite(mag)) return 0;
  if (mag >= 6.5) return 22;
  if (mag >= 5.5) return 16;
  if (mag >= 4.5) return 12;
  if (mag >= 3.8) return 8;
  if (mag >= 2.5) return 4;
  return 2;
};

/**
 * Continuous severity pressure from live ingest (NWS, NWPS, USGS eq, FIRMS density, exposure population).
 */
export function aggregateSeverityPressure(bundle: DashboardIngestBundle): number {
  let score = 0;

  const nws = bundle.sources.find((s) => s.source === 'NWS_FLOOD_ALERTS');
  const feats = (nws?.data as { features?: unknown[] } | undefined)?.features;
  if (Array.isArray(feats)) {
    let sub = 0;
    for (const f of feats) {
      const p = (f as { properties?: Record<string, string> }).properties;
      if (!p || !isFloodHydroEvt(p.event)) continue;
      let w = nwsSeverityWeight(p.severity);
      const hl = `${p.headline ?? ''} ${p.description ?? ''}`.toLowerCase();
      if (!p.severity && /\bflash flood warning\b|\bsevere\b|\bemergency\b/i.test(hl)) w += 8;
      if (/\bwarning\b|\bemergency\b/i.test(p.headline ?? '')) w += 4;
      else if (/\badvisory\b|\bwatch\b/i.test(p.headline ?? '')) w += 2;
      sub += w;
      if (sub >= 72) break;
    }
    score += Math.min(72, sub);
  }

  const nwpsSrc = bundle.sources.find((s) => s.source === 'NOAA_NWPS_GAUGE');
  if (nwpsSrc?.ok && nwpsSrc.data && typeof nwpsSrc.data === 'object') {
    const data = nwpsSrc.data as Record<string, unknown>;
    const fc = ['ObservedFloodCategory', 'ForecastFloodCategory']
      .map((k) => String((data[k] ?? '') || ''))
      .join(' ')
      .toLowerCase();
    score += nwpsFloodPts(fc);
  }

  const eqSrc = bundle.sources.find((s) => s.source === 'USGS_EARTHQUAKES');
  const ef = (eqSrc?.data as { features?: unknown[] } | undefined)?.features;
  if (Array.isArray(ef)) {
    let sub = 0;
    for (const f of ef.slice(0, 26)) {
      const p = (f as { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> })?.properties;
      const coords = (f as { geometry?: { coordinates?: number[] } }).geometry?.coordinates;
      const mag = Number(p?.mag ?? NaN);
      if (!Array.isArray(coords) || coords.length < 2 || !Number.isFinite(mag)) continue;
      const lon = coords[0] as number;
      const lat = coords[1] as number;
      if (lon >= -170 && lon <= -60 && lat >= 15 && lat <= 72) sub += magWeight(mag);
      if (sub >= 62) break;
    }
    score += Math.min(62, sub);
  }

  const firms = bundle.sources.find((s) => s.source === 'NASA_FIRMS');
  const n = firms?.signalCount ?? 0;
  if (typeof n === 'number' && n > 0) score += Math.min(36, Math.log10(1 + n) * 10);

  const pop = bundle.riskExposure?.populationAffectedEstimate ?? 0;
  if (pop > 0) score += Math.min(32, Math.log10(1 + pop) * 5);

  return score;
}

export function deriveDynamicOverallThreatLevel(bundle: DashboardIngestBundle): string {
  const s = aggregateSeverityPressure(bundle);
  const lift = bundle.successfulSources * 5;
  const total = Math.min(225, Math.round(s + lift));
  const text = bundle.narrative.toLowerCase();
  if (/dam failure|incoming tsunami|catastrophic|evacuat/.test(text)) return 'CRITICAL';
  if (total >= 120) return 'CRITICAL';
  if (total >= 98) return 'SEVERE';
  if (total >= 74) return 'HIGH';
  if (total >= 46) return 'ELEVATED';
  if (total >= 22) return 'MODERATE';
  return 'LOW';
}

export function deriveDynamicAiConfidence(bundle: DashboardIngestBundle): number {
  const hydroIds = ['USGS_NWIS_IV', 'NOAA_NWPS_GAUGE', 'NWS_FLOOD_ALERTS'];
  const hydroTotal = bundle.sources.filter((x) => hydroIds.includes(x.source)).length;
  const hydroOk = bundle.sources.filter((x) => hydroIds.includes(x.source) && x.ok).length;
  const hydrationRatio = hydroTotal > 0 ? hydroOk / hydroTotal : bundle.successfulSources / Math.max(1, bundle.sources.length);

  const criticalFail = bundle.sources.some(
    (x) => !x.ok && ['NASA_FIRMS', 'USGS_EARTHQUAKES', 'NWS_FLOOD_ALERTS'].includes(x.source),
  )
    ? 7
    : 0;

  const corroborators = aggregateSeverityPressure(bundle);
  const corroLift = Math.min(18, Math.round(Math.log10(1 + corroborators)));

  let conf = Math.round(42 + hydrationRatio * 45 + corroLift - criticalFail + bundle.successfulSources * 3);
  conf = Math.min(96, Math.max(42, conf));
  return conf;
}

export function deriveMajorMinorSplit(
  bundle: DashboardIngestBundle,
  alerts_count: number,
): { major_incidents: number; minor_incidents: number } {
  if (alerts_count < 1) return { major_incidents: 0, minor_incidents: 0 };
  if (alerts_count === 1) return { major_incidents: 1, minor_incidents: 0 };

  const pressure = aggregateSeverityPressure(bundle);
  /** As pressure rises relative to a diminishing return constant, Major share ramps smoothly (no flat 42% constant). */
  const share =
    alerts_count <= 12
      ? 0.5 * Math.min(0.92, pressure / (pressure + 72))
      : Math.min(
          0.74,
          Math.max(
            0.12,
            0.12 + 0.58 * Math.min(1, pressure / (pressure + 48)),
          ),
        );

  let major_incidents = Math.round(alerts_count * share);

  /** Ensure at least one minor when totals are ample unless catastrophe pressure forces all-heavier posture. */
  if (pressure < 145 && alerts_count >= 4 && major_incidents >= alerts_count)
    major_incidents = Math.max(1, alerts_count - Math.max(1, Math.ceil(alerts_count * 0.12)));

  major_incidents = Math.min(alerts_count, Math.max(1, major_incidents));

  /** Very strong scientific pressure biases toward more Major-class slots. */
  if (pressure >= 120 && alerts_count >= 24)
    major_incidents = Math.min(alerts_count, Math.max(major_incidents, Math.ceil(alerts_count * 0.32)));

  return {
    major_incidents,
    minor_incidents: Math.max(0, alerts_count - major_incidents),
  };
}

export function applyDynamicExecutiveKpis(bundle: DashboardIngestBundle, r: RiskReport): RiskReport {
  return {
    ...r,
    overall_risk_level: deriveDynamicOverallThreatLevel(bundle),
    ai_confidence: deriveDynamicAiConfidence(bundle),
  };
}
