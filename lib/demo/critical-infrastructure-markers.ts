import {
  CRITICAL_INFRASTRUCTURE_SECTORS,
  type CriticalInfraSectorId,
} from '@/lib/gis/critical-infrastructure-sectors'

export type CriticalInfraMapMarker = {
  id: string
  sectorId: CriticalInfraSectorId
  lat: number
  lng: number
  title: string
  status: 'operational' | 'at_risk' | 'offline' | 'unknown'
  location: string
  description: string
  riskLevel?: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
}

/** Demo facilities around Little Rock metro for Arkansas tornado scenario (Dashboard A). */
export const DEMO_CRITICAL_INFRA_MARKERS: CriticalInfraMapMarker[] = [
  {
    id: 'ci-demo-hosp-1',
    sectorId: 'ci_healthcare',
    lat: 34.7465,
    lng: -92.2896,
    title: 'UAMS Medical Center',
    status: 'at_risk',
    location: 'Little Rock, AR',
    description: 'Level 1 trauma center — surge capacity monitoring post-tornado track.',
    riskLevel: 'CRITICAL',
  },
  {
    id: 'ci-demo-fire-1',
    sectorId: 'ci_emergency_services',
    lat: 34.769,
    lng: -92.355,
    title: 'North Little Rock Fire Station 7',
    status: 'operational',
    location: 'North Little Rock, AR',
    description: 'Primary mutual-aid staging for Zone A response.',
    riskLevel: 'HIGH',
  },
  {
    id: 'ci-demo-energy-1',
    sectorId: 'ci_energy',
    lat: 34.758,
    lng: -92.438,
    title: 'Entergy Substation — Breckenridge',
    status: 'offline',
    location: 'Little Rock, AR',
    description: 'Power outage reported along EF-3 damage swath.',
    riskLevel: 'CRITICAL',
  },
  {
    id: 'ci-demo-water-1',
    sectorId: 'ci_water',
    lat: 34.792,
    lng: -92.265,
    title: 'Central Arkansas Water — Main Pump Station',
    status: 'at_risk',
    location: 'Sherwood, AR',
    description: 'Pressure loss in Zone B; boil advisory possible.',
    riskLevel: 'HIGH',
  },
  {
    id: 'ci-demo-trans-1',
    sectorId: 'ci_transportation',
    lat: 34.771,
    lng: -92.388,
    title: 'I-430 / I-40 Interchange',
    status: 'at_risk',
    location: 'Little Rock, AR',
    description: 'Debris on primary evacuation corridor.',
    riskLevel: 'HIGH',
  },
  {
    id: 'ci-demo-comm-1',
    sectorId: 'ci_communications',
    lat: 34.805,
    lng: -92.235,
    title: 'Cell Tower — Jacksonville',
    status: 'offline',
    location: 'Jacksonville, AR',
    description: 'Communications degradation in eastern Zone B.',
    riskLevel: 'MODERATE',
  },
  {
    id: 'ci-demo-gov-1',
    sectorId: 'ci_government',
    lat: 34.748,
    lng: -92.272,
    title: 'Pulaski County EOC',
    status: 'operational',
    location: 'Little Rock, AR',
    description: 'Virtual EOC bridge active — continuity of government site.',
    riskLevel: 'MODERATE',
  },
  {
    id: 'ci-demo-food-1',
    sectorId: 'ci_food_ag',
    lat: 34.738,
    lng: -92.448,
    title: 'Regional Grocery Distribution Hub',
    status: 'at_risk',
    location: 'Little Rock, AR',
    description: 'Cold chain and supply staging for Zone A/B relief.',
    riskLevel: 'HIGH',
  },
  {
    id: 'ci-demo-chem-1',
    sectorId: 'ci_chemical',
    lat: 34.815,
    lng: -92.215,
    title: 'Industrial Chemical Storage — Lonoke Co.',
    status: 'unknown',
    location: 'Lonoke County, AR',
    description: 'FEMA NRI industrial exposure — verify containment post-storm.',
    riskLevel: 'HIGH',
  },
  {
    id: 'ci-demo-fin-1',
    sectorId: 'ci_financial',
    lat: 34.746,
    lng: -92.267,
    title: 'Downtown Financial District ATM Cluster',
    status: 'operational',
    location: 'Little Rock, AR',
    description: 'Financial access monitoring for disaster assistance distribution.',
    riskLevel: 'LOW',
  },
  {
    id: 'ci-demo-pharm-1',
    sectorId: 'ci_healthcare',
    lat: 34.765,
    lng: -92.418,
    title: 'CVS Pharmacy — Chenal Valley',
    status: 'offline',
    location: 'Little Rock, AR',
    description: 'RxOpen status pending — pharmacy closure in Zone A.',
    riskLevel: 'CRITICAL',
  },
  {
    id: 'ci-demo-dam-1',
    sectorId: 'ci_dams',
    lat: 34.866,
    lng: -92.125,
    title: 'Lonoke County Reservoir Dam',
    status: 'operational',
    location: 'Lonoke County, AR',
    description: 'NID-listed structure — no breach indicators; monitor inflow.',
    riskLevel: 'LOW',
  },
]

export type CriticalInfraAtRiskSummary = {
  sectorId: CriticalInfraSectorId
  label: string
  facilitiesAtRisk: number
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
}

export function buildCriticalInfraAtRiskSummary(
  markers: CriticalInfraMapMarker[] = DEMO_CRITICAL_INFRA_MARKERS,
): CriticalInfraAtRiskSummary[] {
  const bySector = new Map<CriticalInfraSectorId, CriticalInfraMapMarker[]>()
  for (const m of markers) {
    const list = bySector.get(m.sectorId) ?? []
    list.push(m)
    bySector.set(m.sectorId, list)
  }

  const order: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 }
  const riskRank = (levels: (string | undefined)[]) => {
    let max = 'LOW' as CriticalInfraAtRiskSummary['riskLevel']
    for (const l of levels) {
      if (l && (order[l] ?? 0) > (order[max] ?? 0)) max = l as CriticalInfraAtRiskSummary['riskLevel']
    }
    return max
  }

  return Array.from(bySector.entries()).map(([sectorId, items]) => {
    const atRisk = items.filter((i) => i.status === 'at_risk' || i.status === 'offline').length
    const sectorDef = CRITICAL_INFRASTRUCTURE_SECTORS.find((s) => s.id === sectorId)
    return {
      sectorId,
      label: sectorDef?.label ?? sectorId,
      facilitiesAtRisk: atRisk || items.length,
      riskLevel: riskRank(items.map((i) => i.riskLevel)),
    }
  })
}
