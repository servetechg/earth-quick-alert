import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors'

/** Verified public ArcGIS FeatureServer layer (user-provided Hp6G80Pky0om7QvQ URLs return 400). */
export interface HifldLayerSource {
  /** ArcGIS REST layer root, e.g. …/FeatureServer/0 */
  layerUrl: string
  /** Optional ArcGIS definition query */
  where?: string
  titleFields: string[]
  statusField?: string
  sourceLabel: string
}

export interface HifldInfrastructureFilterDef {
  id: string
  label: string
  layers: HifldLayerSource[]
  /** Maps to CISA sector when used from critical-infra panel */
  sectorId?: CriticalInfraSectorId
}

const NTAD = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services'
const HIFLD_TX = 'https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services'
const HIFLD_OPEN = 'https://services.arcgis.com/njFNhDsUCentVYJW/ArcGIS/rest/services'
const HIFLD_CD5 = 'https://services1.arcgis.com/CD5mKowwN6nIaqd8/ArcGIS/rest/services'
const EPA_FRS = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services'

/** Explorer-style infrastructure filters + CISA sector aliases. */
export const HIFLD_INFRASTRUCTURE_FILTERS: HifldInfrastructureFilterDef[] = [
  {
    id: 'dams',
    label: 'Dams',
    sectorId: 'ci_dams',
    layers: [
      {
        layerUrl: `${NTAD}/NTAD_Dams/FeatureServer/0`,
        titleFields: ['DAM_NAME', 'NID_NAME', 'NAME'],
        statusField: 'STATUS',
        sourceLabel: 'NTAD National Inventory of Dams',
      },
    ],
  },
  {
    id: 'chemical',
    label: 'Chemical Facilities',
    sectorId: 'ci_chemical',
    layers: [
      {
        layerUrl: `${EPA_FRS}/FRS_INTERESTS/FeatureServer/0`,
        where: "PGM_SYS_ACRNM='RMP'",
        titleFields: ['PRIMARY_NAME', 'FACILITY_NAME', 'NAME'],
        statusField: 'ACTIVE_STATUS',
        sourceLabel: 'EPA FRS Risk Management Plan (RMP)',
      },
    ],
  },
  {
    id: 'energy',
    label: 'Energy (Power Plants)',
    sectorId: 'ci_energy',
    layers: [
      {
        layerUrl: `${HIFLD_TX}/HIFLD_US_EPA_FRS_Power_Plants/FeatureServer/0`,
        titleFields: ['PLANT_NAME', 'PRIMARY_NA', 'NAME'],
        statusField: 'STATUS',
        sourceLabel: 'HIFLD EPA FRS Power Plants',
      },
      {
        layerUrl: `${HIFLD_TX}/DOE_US_Power_Plants/FeatureServer/0`,
        titleFields: ['Plant_Name', 'NAME'],
        statusField: 'status',
        sourceLabel: 'DOE EIA Power Plants',
      },
      {
        layerUrl: `${HIFLD_OPEN}/Substations/FeatureServer/0`,
        titleFields: ['NAME'],
        statusField: 'STATUS',
        sourceLabel: 'HIFLD Electric Substations',
      },
    ],
  },
  {
    id: 'ci_nuclear',
    label: 'Nuclear Power',
    sectorId: 'ci_nuclear',
    layers: [
      {
        layerUrl: `${HIFLD_TX}/HIFLD_US_EPA_FRS_Power_Plants/FeatureServer/0`,
        where: "ENERGY_SRC LIKE '%uclear%'",
        titleFields: ['PLANT_NAME', 'PRIMARY_NA'],
        statusField: 'STATUS',
        sourceLabel: 'HIFLD Nuclear Generating Units',
      },
    ],
  },
  {
    id: 'ci_defense',
    label: 'Defense Facilities',
    sectorId: 'ci_defense',
    layers: [
      {
        layerUrl: `${NTAD}/NTAD_Military_Bases/FeatureServer/0`,
        titleFields: ['NAME', 'SITE_NAME', 'BASE_NAME'],
        sourceLabel: 'NTAD Military Bases',
      },
      {
        layerUrl: `${HIFLD_OPEN}/Military_Facilities/FeatureServer/0`,
        titleFields: ['NAME', 'SITE_NAME'],
        sourceLabel: 'HIFLD Military Facilities',
      },
    ],
  },
  {
    id: 'ci_emergency_services',
    label: 'Emergency Services',
    sectorId: 'ci_emergency_services',
    layers: [
      {
        layerUrl: `${HIFLD_CD5}/Emergency_Medical_Service_EMS_Stations/FeatureServer/0`,
        titleFields: ['NAME', 'EMSNAME'],
        sourceLabel: 'HIFLD EMS Stations',
      },
      {
        layerUrl: `${HIFLD_CD5}/Law_Enforcement/FeatureServer/0`,
        titleFields: ['NAME'],
        sourceLabel: 'HIFLD Law Enforcement',
      },
      {
        layerUrl: `${HIFLD_OPEN}/Law_Enforcement_Locations_Public/FeatureServer/0`,
        titleFields: ['NAME', 'AGENCY'],
        sourceLabel: 'HIFLD Law Enforcement (public)',
      },
    ],
  },
  {
    id: 'ci_healthcare',
    label: 'Healthcare',
    sectorId: 'ci_healthcare',
    layers: [
      {
        layerUrl: `${NTAD}/Proximity_Hospital_National/FeatureServer/0`,
        titleFields: ['NAME', 'HOSPITAL_NAME', 'FACILITY_NAME'],
        sourceLabel: 'NTAD Hospitals (national proximity)',
      },
    ],
  },
  {
    id: 'ci_transportation',
    label: 'Transportation',
    sectorId: 'ci_transportation',
    layers: [
      {
        layerUrl: `${NTAD}/NTAD_Aviation_Facilities/FeatureServer/0`,
        titleFields: ['NAME', 'ARPT_NAME', 'FACILITY_NAME'],
        sourceLabel: 'NTAD Aviation Facilities',
      },
      {
        layerUrl: `${NTAD}/NTAD_Commercial_Strategic_Seaports/FeatureServer/0`,
        titleFields: ['NAME', 'PORT_NAME'],
        sourceLabel: 'NTAD Strategic Seaports',
      },
      {
        layerUrl: `${NTAD}/NTAD_Rail_Yards/FeatureServer/0`,
        titleFields: ['NAME', 'YARDNAME'],
        sourceLabel: 'NTAD Rail Yards',
      },
      {
        layerUrl: `${NTAD}/NTAD_National_Transit_Map_Stops/FeatureServer/0`,
        titleFields: ['STOP_NAME', 'NAME'],
        sourceLabel: 'NTAD Transit Stops',
      },
    ],
  },
  {
    id: 'ci_water',
    label: 'Water & Wastewater',
    sectorId: 'ci_water',
    layers: [
      {
        layerUrl: `${HIFLD_OPEN}/Wastewater_Treatment_Plants/FeatureServer/0`,
        titleFields: ['CWP_NAME', 'NAME', 'FACILITY_NAME'],
        statusField: 'CWP_STATUS',
        sourceLabel: 'HIFLD Wastewater Treatment Plants',
      },
    ],
  },
  {
    id: 'ci_manufacturing',
    label: 'Critical Manufacturing',
    sectorId: 'ci_manufacturing',
    layers: [
      {
        layerUrl: `${EPA_FRS}/FRS_INTERESTS/FeatureServer/0`,
        where: "PGM_SYS_ACRNM='TRI'",
        titleFields: ['PRIMARY_NAME'],
        statusField: 'ACTIVE_STATUS',
        sourceLabel: 'EPA TRI Manufacturing Facilities',
      },
    ],
  },
  {
    id: 'ci_communications',
    label: 'Communications',
    sectorId: 'ci_communications',
    layers: [
      {
        layerUrl: `${HIFLD_TX}/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0`,
        titleFields: ['NAME', 'ID'],
        sourceLabel: 'HIFLD Power Transmission (backbone)',
      },
    ],
  },
]

const filterById = new Map(HIFLD_INFRASTRUCTURE_FILTERS.map((f) => [f.id, f]))
const filterBySector = new Map(
  HIFLD_INFRASTRUCTURE_FILTERS.filter((f) => f.sectorId).map((f) => [f.sectorId!, f]),
)

export function hifldFilterById(id: string): HifldInfrastructureFilterDef | undefined {
  const key = id.trim().toLowerCase()
  return filterById.get(key) ?? filterBySector.get(id as CriticalInfraSectorId)
}

export function hifldFiltersForSectors(sectorIds: CriticalInfraSectorId[]): HifldInfrastructureFilterDef[] {
  const out: HifldInfrastructureFilterDef[] = []
  const seen = new Set<string>()
  for (const sectorId of sectorIds) {
    const direct = filterBySector.get(sectorId)
    if (direct && !seen.has(direct.id)) {
      seen.add(direct.id)
      out.push(direct)
    }
  }
  return out
}

export function resolveInfrastructureFilters(filterParam: string): HifldInfrastructureFilterDef[] {
  const parts = filterParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const out: HifldInfrastructureFilterDef[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const def = hifldFilterById(part)
    if (!def || seen.has(def.id)) continue
    seen.add(def.id)
    out.push(def)
  }
  return out
}
