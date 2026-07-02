import connectDB from '@/lib/mongodb'
import type { InfrastructureSearchScope, MapBounds } from '@/lib/gis/infrastructure-search-grid'
import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch'
import type { DeploymentResourceKind, GisFilterLayerDef } from '@/lib/gis/gis-filter-layers'
import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes'
import { calculateDistance } from '@/lib/services/mock-map-service'
import { coordinatesInJurisdiction, type SubAdminJurisdiction } from '@/lib/sub-admin/jurisdiction'
import ResponderElectricDeployment from '@/models/ResponderElectricDeployment'
import ResponderWaterDeployment from '@/models/ResponderWaterDeployment'
import ResponderGasDeployment from '@/models/ResponderGasDeployment'
import ResponderEnergyDeployment from '@/models/ResponderEnergyDeployment'
import ResponderFoodLogisticsDeployment from '@/models/ResponderFoodLogisticsDeployment'
import ResponderNonprofitDeployment from '@/models/ResponderNonprofitDeployment'
import mongoose from 'mongoose'
import { rankPlacesForViewport } from '@/lib/gis/viewport-place-ranking'
import { fetchMongoGisFilterLayerPlaces } from '@/lib/gis/static-mongo-filter-places-fetch'

type SiteRow = {
    id: string
    name: string
    address?: string
    lat?: number
    lng?: number
    siteKind?: string
    volunteersDeployed?: number
    crewsDeployed?: number
    vehiclesDeployed?: number
}

function siteInScope(
    lat: number,
    lng: number,
    scope: InfrastructureSearchScope,
    jurisdiction?: SubAdminJurisdiction | null,
): boolean {
    if (jurisdiction) {
        return coordinatesInJurisdiction(lat, lng, jurisdiction)
    }
    if (scope.mode === 'state') {
        return pointInUsStateBBox(lng, lat, scope.stateCode)
    }
    if (scope.mode === 'radius') {
        return (
            calculateDistance(lat, lng, scope.center.lat, scope.center.lng) <=
            scope.radiusMile
        )
    }
    const b = scope.bounds
    if (lng < b.west || lng > b.east || lat < b.south || lat > b.north) return false
    if (scope.radiusClip) {
        return (
            calculateDistance(
                lat,
                lng,
                scope.radiusClip.center.lat,
                scope.radiusClip.center.lng,
            ) <= scope.radiusClip.radiusMile
        )
    }
    return true
}

function siteToResult(
    site: SiteRow,
    resultType: string,
    scope: InfrastructureSearchScope,
    jurisdiction?: SubAdminJurisdiction | null,
): InfrastructurePlaceResult | null {
    const lat = site.lat
    const lng = site.lng
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null
    }
    if (lat === 0 && lng === 0) return null
    if (!siteInScope(lat, lng, scope, jurisdiction)) return null

    return {
        place_id: `deploy-${resultType}-${site.id}`,
        name: site.name,
        placeType: resultType,
        lat,
        lng,
        vicinity: site.address?.trim() || 'Address not available',
    }
}

async function loadDeploymentSites(
    Model: mongoose.Model<any>,
    licenseId?: string | null,
): Promise<SiteRow[]> {
    await connectDB()
    const query: Record<string, unknown> = {}
    if (licenseId && mongoose.Types.ObjectId.isValid(licenseId)) {
        query.licenseId = new mongoose.Types.ObjectId(licenseId)
    }
    const docs = await Model.find(query).select('sites').lean()
    const rows: SiteRow[] = []
    for (const doc of docs) {
        if (!Array.isArray(doc.sites)) continue
        for (const site of doc.sites) {
            if (site && typeof site === 'object') rows.push(site as SiteRow)
        }
    }
    return rows
}

async function sitesForDeploymentKind(
    kind: DeploymentResourceKind,
    licenseId?: string | null,
): Promise<SiteRow[]> {
    switch (kind) {
        case 'power_crews':
            return loadDeploymentSites(ResponderElectricDeployment, licenseId)
        case 'water_crews':
            return loadDeploymentSites(ResponderWaterDeployment, licenseId)
        case 'fuel_sites':
            return loadDeploymentSites(ResponderGasDeployment, licenseId)
        case 'generators':
            return loadDeploymentSites(ResponderEnergyDeployment, licenseId)
        case 'meals_ready':
            return loadDeploymentSites(ResponderFoodLogisticsDeployment, licenseId)
        case 'volunteers': {
            const sites = await loadDeploymentSites(ResponderNonprofitDeployment, licenseId)
            return sites.filter(
                (s) =>
                    s.siteKind === 'volunteer' ||
                    (s.volunteersDeployed ?? 0) > 0,
            )
        }
        default:
            return []
    }
}

function deploymentKindsForLayer(layer: GisFilterLayerDef): DeploymentResourceKind[] {
    if (layer.fetch.mode === 'deployment') return [layer.fetch.deployment]
    return []
}

export async function fetchDeploymentResourcePlaces(
    scope: InfrastructureSearchScope,
    layers: GisFilterLayerDef[],
    opts?: { licenseId?: string | null; jurisdiction?: SubAdminJurisdiction | null },
): Promise<InfrastructurePlaceResult[]> {
    const byId = new Map<string, InfrastructurePlaceResult>()

    for (const layer of layers) {
        const kinds = deploymentKindsForLayer(layer)
        if (kinds.length === 0) continue

        for (const kind of kinds) {
            const sites = await sitesForDeploymentKind(kind, opts?.licenseId)
            for (const site of sites) {
                const result = siteToResult(
                    site,
                    layer.resultType,
                    scope,
                    opts?.jurisdiction,
                )
                if (!result || byId.has(result.place_id)) continue
                byId.set(result.place_id, result)
            }
        }
    }

    return [...byId.values()]
}

export async function fetchAllFilterLayerPlaces(
    scope: InfrastructureSearchScope,
    layers: GisFilterLayerDef[],
    opts?: {
        viewportBounds?: MapBounds | null
        licenseId?: string | null
        jurisdiction?: SubAdminJurisdiction | null
    },
): Promise<InfrastructurePlaceResult[]> {
    const { fetchInfrastructurePlacesForLayers } = await import(
        '@/lib/gis/infrastructure-places-fetch'
    )

    const [googlePlaces, deploymentPlaces, mongoPlaces] = await Promise.all([
        fetchInfrastructurePlacesForLayers(scope, layers, opts),
        fetchDeploymentResourcePlaces(scope, layers, opts),
        fetchMongoGisFilterLayerPlaces(scope, layers, {
            stateKey: opts?.jurisdiction?.stateCode ?? undefined,
        }),
    ])

    const byId = new Map<string, InfrastructurePlaceResult>()
    for (const place of [...googlePlaces, ...deploymentPlaces, ...mongoPlaces]) {
        if (!byId.has(place.place_id)) byId.set(place.place_id, place)
    }

    const merged = [...byId.values()]
    if (opts?.viewportBounds) {
        return rankPlacesForViewport(merged, opts.viewportBounds)
    }
    return merged
}
