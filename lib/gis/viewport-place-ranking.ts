import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch'
import { resolveUsStateCode } from '@/lib/constants/us-state-bounding-boxes'
import {
    maxResultsPerType,
    minReviewCountForViewport,
    prominenceScore,
} from '@/lib/gis/infrastructure-place-filter'
import { viewportSpanDeg, type MapBounds } from '@/lib/gis/infrastructure-search-grid'

const SHELTER_NAME_RE =
    /\b(shelter|evacuation center|evacuation centre|emergency housing|disaster relief|red cross|warming center|cooling center)\b/i

function pointInBounds(lat: number, lng: number, bounds: MapBounds, padRatio = 0.06): boolean {
    const latPad = (bounds.north - bounds.south) * padRatio
    const lngPad = (bounds.east - bounds.west) * padRatio
    return (
        lng >= bounds.west - lngPad &&
        lng <= bounds.east + lngPad &&
        lat >= bounds.south - latPad &&
        lat <= bounds.north + latPad
    )
}

/** Google Maps–style relevance for shelter POIs (community centers & named shelters rank higher). */
export function shelterRelevanceScore(place: InfrastructurePlaceResult): number {
    const name = place.name ?? ''
    let score = prominenceScore(place.rating, place.user_ratings_total)

    if (SHELTER_NAME_RE.test(name)) score += 8_000
    if (/community center|community centre|civic center|recreation center/i.test(name)) {
        score += 5_000
    }
    if (/red cross|salvation army|emergency/i.test(name)) score += 4_000
    if (/school|elementary|high school|academy/i.test(name)) score += 200

    return score
}

function relevanceScoreForPlace(place: InfrastructurePlaceResult): number {
    if (place.placeType === 'shelter') return shelterRelevanceScore(place)
    return prominenceScore(place.rating, place.user_ratings_total)
}

function passesReviewThreshold(
    place: InfrastructurePlaceResult,
    spanDeg: number,
): boolean {
    if (place.placeType === 'shelter') {
        const name = place.name ?? ''
        if (SHELTER_NAME_RE.test(name)) return true
        if (/community center|community centre|civic center|recreation center|red cross/i.test(name)) {
            return true
        }
        const reviews = place.user_ratings_total ?? 0
        if (spanDeg > 1.2) return reviews >= 5
        if (spanDeg > 0.45) return reviews >= 2
        return true
    }

    const minReviews = minReviewCountForViewport(spanDeg, place.placeType)
    const reviews = place.user_ratings_total ?? 0
    if (reviews >= minReviews) return true
    if (spanDeg <= 0.75 && reviews === 0) return true
    return false
}

/** Metro / neighborhood zoom — show every POI in view (Google Maps layer behavior). */
export function isDenseViewportZoom(spanDeg: number): boolean {
    return spanDeg <= 1.0
}

/** Sample viewport to count how many US states are visible. */
export function statesInViewport(bounds: MapBounds): Set<string> {
    const states = new Set<string>()
    const steps = 4
    for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps; j++) {
            const lat = bounds.south + (i / steps) * (bounds.north - bounds.south)
            const lng = bounds.west + (j / steps) * (bounds.east - bounds.west)
            const code = resolveUsStateCode(lng, lat)
            if (code) states.add(code)
        }
    }
    return states
}

/**
 * Spread 1–2 markers per state only when the viewport covers most of the US.
 * Single-state views (e.g. all of Oklahoma) must show many local hospitals.
 */
export function shouldUseNationwideStateSpread(bounds: MapBounds, spanDeg: number): boolean {
    if (spanDeg > 8) return true
    if (spanDeg <= 2.5) return false
    return statesInViewport(bounds).size >= 4
}

function perStateMarkerBudget(spanDeg: number): number {
    if (spanDeg > 10) return 1
    if (spanDeg > 2.5) return 2
    return 0
}

/** At country zoom, spread markers across states instead of clustering in a few metros. */
function rankNationwideByState(
    places: InfrastructurePlaceResult[],
    spanDeg: number,
): InfrastructurePlaceResult[] {
    const perState = perStateMarkerBudget(spanDeg)
    if (perState <= 0) return places

    const byTypeState = new Map<string, InfrastructurePlaceResult[]>()
    for (const place of places) {
        const state = resolveUsStateCode(place.lng, place.lat) ?? 'OTHER'
        const key = `${place.placeType}|${state}`
        const list = byTypeState.get(key) ?? []
        list.push(place)
        byTypeState.set(key, list)
    }

    const ranked: InfrastructurePlaceResult[] = []
    for (const group of byTypeState.values()) {
        const filtered = group.filter((p) => passesReviewThreshold(p, spanDeg))
        const pool = filtered.length > 0 ? filtered : group
        const sorted = [...pool].sort(
            (a, b) => relevanceScoreForPlace(b) - relevanceScoreForPlace(a),
        )
        ranked.push(...sorted.slice(0, perState))
    }

    return ranked
}

/**
 * Keep only the most relevant POIs for the current viewport — similar to Google Maps layer density.
 */
export function rankPlacesForViewport(
    places: InfrastructurePlaceResult[],
    viewportBounds: MapBounds | null | undefined,
): InfrastructurePlaceResult[] {
    if (!viewportBounds) return places

    const spanDeg = viewportSpanDeg(viewportBounds)
    const inView = places.filter((p) => pointInBounds(p.lat, p.lng, viewportBounds))

    if (isDenseViewportZoom(spanDeg)) {
        return inView
    }

    if (shouldUseNationwideStateSpread(viewportBounds, spanDeg)) {
        return rankNationwideByState(inView, spanDeg)
    }

    const byType = new Map<string, InfrastructurePlaceResult[]>()
    for (const place of inView) {
        const key = place.placeType
        const list = byType.get(key) ?? []
        list.push(place)
        byType.set(key, list)
    }

    const ranked: InfrastructurePlaceResult[] = []
    for (const [placeType, group] of byType) {
        const filtered = group.filter((p) => passesReviewThreshold(p, spanDeg))
        const pool = filtered.length > 0 ? filtered : group

        const limit = maxResultsPerType(spanDeg, placeType)
        const sorted = [...pool].sort(
            (a, b) => relevanceScoreForPlace(b) - relevanceScoreForPlace(a),
        )
        ranked.push(...sorted.slice(0, limit))
    }

    return ranked
}
