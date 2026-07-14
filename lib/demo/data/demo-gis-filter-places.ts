import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch'
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid'
import type { GisFilterLayerDef } from '@/lib/gis/gis-filter-layers'
import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes'

type DemoSiteSeed = {
  name: string
  lat: number
  lng: number
  vicinity: string
}

function seedPlaces(
  seeds: DemoSiteSeed[],
  placeType: string,
  idPrefix: string,
): InfrastructurePlaceResult[] {
  return seeds.map((site, index) => ({
    place_id: `demo-infra-${idPrefix}-${index + 1}`,
    name: site.name,
    placeType,
    lat: site.lat,
    lng: site.lng,
    vicinity: site.vicinity,
  }))
}

const HOSPITAL_SEEDS: DemoSiteSeed[] = [
  { name: 'UAMS Medical Center', lat: 34.7465, lng: -92.2896, vicinity: 'Little Rock, AR' },
  { name: 'Baptist Health Medical Center', lat: 34.738, lng: -92.365, vicinity: 'Little Rock, AR' },
  { name: 'CHI St. Vincent Infirmary', lat: 34.752, lng: -92.318, vicinity: 'Little Rock, AR' },
  { name: 'Arkansas Children\'s Hospital', lat: 34.735, lng: -92.322, vicinity: 'Little Rock, AR' },
  { name: 'Baptist Health — North Little Rock', lat: 34.781, lng: -92.248, vicinity: 'North Little Rock, AR' },
  { name: 'Baptist Health Medical Center — Beebe', lat: 35.068, lng: -91.878, vicinity: 'Beebe, AR' },
  { name: 'Unity Health White County Medical', lat: 35.071, lng: -91.895, vicinity: 'Searcy, AR' },
  { name: 'Cabot Emergency Hospital', lat: 34.974, lng: -92.016, vicinity: 'Cabot, AR' },
  { name: 'Sherwood Medical Pavilion', lat: 34.815, lng: -92.224, vicinity: 'Sherwood, AR' },
  { name: 'Jacksonville Regional Care', lat: 34.866, lng: -92.12, vicinity: 'Jacksonville, AR' },
  { name: 'Ward Community Clinic', lat: 35.029, lng: -91.944, vicinity: 'Ward, AR' },
  { name: 'Austin Urgent Care & ER', lat: 35.0, lng: -91.985, vicinity: 'Austin, AR' },
]

const PHARMACY_SEEDS: DemoSiteSeed[] = [
  { name: 'CVS Pharmacy — Chenal Valley', lat: 34.765, lng: -92.418, vicinity: 'Little Rock, AR' },
  { name: 'Walgreens — Breckenridge', lat: 34.758, lng: -92.392, vicinity: 'Little Rock, AR' },
  { name: 'Walgreens — North Little Rock', lat: 34.771, lng: -92.255, vicinity: 'North Little Rock, AR' },
  { name: 'CVS Pharmacy — Beebe', lat: 35.065, lng: -91.888, vicinity: 'Beebe, AR' },
  { name: 'Walgreens — Ward', lat: 35.029, lng: -91.947, vicinity: 'Ward, AR' },
  { name: 'CVS Pharmacy — Jacksonville', lat: 34.862, lng: -92.108, vicinity: 'Jacksonville, AR' },
  { name: 'Walgreens — Sherwood', lat: 34.808, lng: -92.218, vicinity: 'Sherwood, AR' },
  { name: 'CVS Pharmacy — Cabot', lat: 34.968, lng: -92.028, vicinity: 'Cabot, AR' },
  { name: 'Walgreens — Austin', lat: 34.998, lng: -91.978, vicinity: 'Austin, AR' },
  { name: 'CVS Pharmacy — Cammack Village', lat: 34.772, lng: -92.358, vicinity: 'Cammack Village, AR' },
]

const POLICE_SEEDS: DemoSiteSeed[] = [
  { name: 'Little Rock Police Department', lat: 34.748, lng: -92.272, vicinity: 'Little Rock, AR' },
  { name: 'North Little Rock Police', lat: 34.769, lng: -92.267, vicinity: 'North Little Rock, AR' },
  { name: 'Beebe Police Department', lat: 35.072, lng: -91.892, vicinity: 'Beebe, AR' },
  { name: 'Ward Police Department', lat: 35.031, lng: -91.951, vicinity: 'Ward, AR' },
  { name: 'Sherwood Police Department', lat: 34.819, lng: -92.212, vicinity: 'Sherwood, AR' },
  { name: 'Jacksonville Police Department', lat: 34.869, lng: -92.115, vicinity: 'Jacksonville, AR' },
  { name: 'Cabot Police Department', lat: 34.977, lng: -92.012, vicinity: 'Cabot, AR' },
  { name: 'Lonoke County Sheriff — Ward', lat: 35.026, lng: -91.936, vicinity: 'Ward, AR' },
  { name: 'Austin Police Substation', lat: 35.003, lng: -91.991, vicinity: 'Austin, AR' },
  { name: 'Pulaski County Sheriff — LR', lat: 34.741, lng: -92.278, vicinity: 'Little Rock, AR' },
]

const FIRE_SEEDS: DemoSiteSeed[] = [
  { name: 'LRFD Engine 9 — Breckenridge', lat: 34.74, lng: -92.33, vicinity: 'Little Rock, AR' },
  { name: 'LRFD Station 5 — Chenal', lat: 34.762, lng: -92.41, vicinity: 'Little Rock, AR' },
  { name: 'North Little Rock Fire Station 7', lat: 34.769, lng: -92.355, vicinity: 'North Little Rock, AR' },
  { name: 'Sherwood Fire Department', lat: 34.812, lng: -92.22, vicinity: 'Sherwood, AR' },
  { name: 'Jacksonville Fire & Rescue', lat: 34.861, lng: -92.105, vicinity: 'Jacksonville, AR' },
  { name: 'Beebe Fire Department', lat: 35.069, lng: -91.885, vicinity: 'Beebe, AR' },
  { name: 'Ward Fire & EMS', lat: 35.028, lng: -91.949, vicinity: 'Ward, AR' },
  { name: 'Austin Fire & Rescue', lat: 35.002, lng: -91.982, vicinity: 'Austin, AR' },
  { name: 'Cabot Fire Department', lat: 34.971, lng: -92.019, vicinity: 'Cabot, AR' },
  { name: 'NLR EMS Task Force Staging', lat: 34.765, lng: -92.36, vicinity: 'North Little Rock, AR' },
]

const GENERATOR_SEEDS: DemoSiteSeed[] = [
  { name: 'United Rentals — Generator Fleet', lat: 34.728, lng: -92.262, vicinity: 'Little Rock, AR' },
  { name: 'Sunbelt Rentals Emergency Power', lat: 34.781, lng: -92.241, vicinity: 'North Little Rock, AR' },
  { name: 'Herc Rentals — Beebe', lat: 35.063, lng: -91.893, vicinity: 'Beebe, AR' },
  { name: 'Sunbelt — Jacksonville', lat: 34.855, lng: -92.118, vicinity: 'Jacksonville, AR' },
  { name: 'United Rentals — Ward', lat: 35.024, lng: -91.942, vicinity: 'Ward, AR' },
]

const MEALS_SEEDS: DemoSiteSeed[] = [
  { name: 'American Red Cross — Feeding Station', lat: 34.755, lng: -92.285, vicinity: 'Little Rock, AR' },
  { name: 'Arkansas Foodbank Distribution', lat: 34.722, lng: -92.301, vicinity: 'Little Rock, AR' },
  { name: 'Salvation Army — Beebe Kitchen', lat: 35.066, lng: -91.896, vicinity: 'Beebe, AR' },
  { name: 'VOAD Meal Site — Ward', lat: 35.027, lng: -91.938, vicinity: 'Ward, AR' },
  { name: 'NLR Emergency Feeding Center', lat: 34.784, lng: -92.268, vicinity: 'North Little Rock, AR' },
]

const POWER_CREW_SEEDS: DemoSiteSeed[] = [
  { name: 'Entergy Arkansas — Breckenridge Staging', lat: 34.762, lng: -92.378, vicinity: 'Little Rock, AR' },
  { name: 'Entergy Crew — White County', lat: 35.055, lng: -91.91, vicinity: 'Beebe, AR' },
  { name: 'Entergy — Jacksonville Line Crew', lat: 34.852, lng: -92.125, vicinity: 'Jacksonville, AR' },
  { name: 'Entergy — Ward Restoration Unit', lat: 35.022, lng: -91.948, vicinity: 'Ward, AR' },
]

const WATER_CREW_SEEDS: DemoSiteSeed[] = [
  { name: 'Central Arkansas Water — Sherwood', lat: 34.792, lng: -92.265, vicinity: 'Sherwood, AR' },
  { name: 'CAW Repair Crew — Beebe', lat: 35.061, lng: -91.902, vicinity: 'Beebe, AR' },
  { name: 'CAW — Ward Main Break Team', lat: 35.018, lng: -91.955, vicinity: 'Ward, AR' },
]

const VOLUNTEER_SEEDS: DemoSiteSeed[] = [
  { name: 'Arkansas VOAD Volunteer Staging', lat: 34.748, lng: -92.29, vicinity: 'Little Rock, AR' },
  { name: 'Lonoke County Volunteer Corps', lat: 35.025, lng: -91.94, vicinity: 'Ward, AR' },
  { name: 'Red Cross Volunteer Hub — NLR', lat: 34.776, lng: -92.259, vicinity: 'North Little Rock, AR' },
  { name: 'Beebe Volunteer Coordination Center', lat: 35.064, lng: -91.887, vicinity: 'Beebe, AR' },
]

const IT_SEEDS: DemoSiteSeed[] = [
  { name: 'Arkansas Department of Information Systems', lat: 34.746, lng: -92.275, vicinity: 'Little Rock, AR' },
  { name: 'UA Office of Information Technology', lat: 34.739, lng: -92.341, vicinity: 'Little Rock, AR' },
  { name: 'NLR Technology Operations Center', lat: 34.771, lng: -92.262, vicinity: 'North Little Rock, AR' },
  { name: 'Beebe County Technology Center', lat: 35.067, lng: -91.891, vicinity: 'Beebe, AR' },
]

/** Arkansas GIS filter facilities for the Little Rock EF-3 presentation demo. */
export const DEMO_GIS_FILTER_PLACES: InfrastructurePlaceResult[] = [
  ...seedPlaces(HOSPITAL_SEEDS, 'hospital', 'hosp'),
  ...seedPlaces(PHARMACY_SEEDS, 'pharmacy', 'pharm'),
  ...seedPlaces(POLICE_SEEDS, 'police', 'police'),
  ...seedPlaces(FIRE_SEEDS, 'fire_station', 'fire'),
  ...seedPlaces(GENERATOR_SEEDS, 'generator', 'gen'),
  ...seedPlaces(MEALS_SEEDS, 'meals_ready', 'meals'),
  ...seedPlaces(POWER_CREW_SEEDS, 'power_crews', 'power'),
  ...seedPlaces(WATER_CREW_SEEDS, 'water_crews', 'water'),
  ...seedPlaces(VOLUNTEER_SEEDS, 'volunteers', 'vol'),
  ...seedPlaces(IT_SEEDS, 'it_infrastructure', 'it'),
]

function pointInBounds(lat: number, lng: number, bounds: MapBounds): boolean {
  return lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north
}

export function pointInPaddedBounds(
  lat: number,
  lng: number,
  bounds: MapBounds,
  padRatio = 0.25,
): boolean {
  const latPad = (bounds.north - bounds.south) * padRatio
  const lngPad = (bounds.east - bounds.west) * padRatio
  return (
    lng >= bounds.west - lngPad &&
    lng <= bounds.east + lngPad &&
    lat >= bounds.south - latPad &&
    lat <= bounds.north + latPad
  )
}

export function filterDemoGisFilterPlaces(
  layers: GisFilterLayerDef[],
  opts?: { bounds?: MapBounds | null; stateCode?: string | null },
): InfrastructurePlaceResult[] {
  const resultTypes = new Set(layers.map((l) => l.resultType))
  if (resultTypes.size === 0) return []

  return DEMO_GIS_FILTER_PLACES.filter((place) => {
    if (!resultTypes.has(place.placeType)) return false
    if (opts?.stateCode && !pointInUsStateBBox(place.lng, place.lat, opts.stateCode)) {
      return false
    }
    if (opts?.bounds && !pointInBounds(place.lat, place.lng, opts.bounds)) {
      return false
    }
    return true
  })
}
