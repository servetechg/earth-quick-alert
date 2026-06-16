const EMERGENCY_NAME_RE =
    /\b(fire station|fire dept|fire department|fire & rescue|fire and rescue|ambulance|air care|aircare|emergency medical|\bems\b|paramedic|rescue squad|first responder)\b/i

const SHELTER_NAME_RE =
    /\b(shelter|evacuation center|evacuation centre|emergency housing|disaster relief|red cross|warming center|cooling center)\b/i

/** Match emergency shelters, community centers, and schools used as shelter sites. */
export function placeMatchesShelter(
    placeTypes: string[] | undefined,
    name?: string,
): boolean {
    const types = placeTypes ?? []
    const label = (name ?? '').trim()

    if (types.includes('community_center')) return true
    if (
        types.includes('school') ||
        types.includes('primary_school') ||
        types.includes('secondary_school')
    ) {
        return SHELTER_NAME_RE.test(label)
    }
    if (SHELTER_NAME_RE.test(label)) return true
    return false
}

/** Match Google-style emergency service providers (fire, EMS, ambulance). */
export function placeMatchesEmergencyService(
    placeTypes: string[] | undefined,
    name?: string,
): boolean {
    const types = placeTypes ?? []
    const label = (name ?? '').trim()

    if (types.includes('veterinary_care') || types.includes('pharmacy')) return false
    if (types.includes('police')) return false
    if (types.includes('fire_station')) return true

    if (types.includes('hospital')) {
        return EMERGENCY_NAME_RE.test(label) || /\b(er|emergency room|trauma|urgent care)\b/i.test(label)
    }

    if (EMERGENCY_NAME_RE.test(label)) return true

    if (types.length === 0 && label) {
        return EMERGENCY_NAME_RE.test(label)
    }

    return false
}

/** Keep only establishments that match the requested Google place category. */
export function placeMatchesRequestedType(
    placeTypes: string[] | undefined,
    requested: string,
    name?: string,
): boolean {
    const types = placeTypes ?? []
    if (types.length === 0 && requested !== 'fire_station') return true
    if (types.includes('veterinary_care')) return false

    switch (requested) {
        case 'hospital':
            return types.includes('hospital')
        case 'pharmacy':
            return types.includes('pharmacy')
        case 'police':
            return types.includes('police')
        case 'fire_station':
            return placeMatchesEmergencyService(types, name)
        case 'gas_station':
            return types.includes('gas_station')
        case 'community_center':
            return types.includes('community_center')
        case 'school':
            return (
                types.includes('school') ||
                types.includes('primary_school') ||
                types.includes('secondary_school')
            )
        case 'shelter':
            return placeMatchesShelter(types, name)
        default:
            return types.includes(requested)
    }
}

export function prominenceScore(rating?: number, reviewCount?: number): number {
    const reviews = typeof reviewCount === 'number' && reviewCount > 0 ? reviewCount : 0
    const stars = typeof rating === 'number' && rating > 0 ? rating : 0
    return reviews * 100 + stars
}

/** Minimum Google review count — higher when zoomed out (show only well-known places). */
export function minReviewCountForViewport(spanDeg: number, placeType: string): number {
    const base = placeType === 'hospital' ? 20 : placeType === 'pharmacy' ? 10 : 5
    if (spanDeg > 2.5) return Math.max(base, 30)
    if (spanDeg > 1.2) return Math.max(base, 15)
    if (spanDeg > 0.45) return Math.max(base, 8)
    return Math.max(base, 3)
}

/** Max markers per category for the current map zoom. */
export function maxResultsPerType(spanDeg: number, placeType?: string): number {
    if (placeType === 'shelter') {
        if (spanDeg > 2.5) return 8
        if (spanDeg > 1.2) return 12
        if (spanDeg > 0.45) return 18
        if (spanDeg > 0.2) return 28
        return 40
    }

    if (spanDeg > 2.5) return 10
    if (spanDeg > 1.2) return 16
    if (spanDeg > 0.45) return 24
    return 35
}
