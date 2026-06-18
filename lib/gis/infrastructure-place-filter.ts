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

/** Heuristic when Google returns no `types` array. */
function inferTypesFromName(name?: string): string[] {
    const label = (name ?? '').toLowerCase()
    if (/\b(cvs|walgreens|rite aid|pharmacy|drugstore|apothecary)\b/i.test(label)) {
        return ['pharmacy']
    }
    if (/\b(hospital|medical center|med centre|health system|infirmary|regional medical)\b/i.test(label)) {
        return ['hospital']
    }
    return []
}

/** Keep only establishments that match the requested Google place category. */
export function placeMatchesRequestedType(
    placeTypes: string[] | undefined,
    requested: string,
    name?: string,
): boolean {
    const types =
        placeTypes && placeTypes.length > 0 ? placeTypes : inferTypesFromName(name)
    if (types.includes('veterinary_care')) return false

    switch (requested) {
        case 'hospital':
            return types.includes('hospital')
        case 'pharmacy':
            return types.includes('pharmacy') && !types.includes('hospital')
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

/** Ensure a fetched POI belongs on exactly one GIS filter layer. */
export function placeBelongsToGisFilterResultType(
    place: { placeType: string; name?: string; googleTypes?: string[] },
    resultType: string,
): boolean {
    if (place.placeType !== resultType) return false
    const types =
        place.googleTypes && place.googleTypes.length > 0
            ? place.googleTypes
            : inferTypesFromName(place.name)
    return placeMatchesRequestedType(types, resultType, place.name)
}

export function prominenceScore(rating?: number, reviewCount?: number): number {
    const reviews = typeof reviewCount === 'number' && reviewCount > 0 ? reviewCount : 0
    const stars = typeof rating === 'number' && rating > 0 ? rating : 0
    return reviews * 100 + stars
}

/** Minimum Google review count — higher when zoomed out (show only well-known places). */
export function minReviewCountForViewport(spanDeg: number, placeType: string): number {
    if (spanDeg <= 0.5) return 0
    if (spanDeg > 2.5) return 0
    const base = placeType === 'hospital' ? 4 : placeType === 'pharmacy' ? 3 : 2
    if (spanDeg > 1.2) return Math.max(base, 4)
    if (spanDeg > 0.75) return Math.max(base, 2)
    return base
}

/** Max markers per category for the current map zoom. */
export function maxResultsPerType(spanDeg: number, placeType?: string): number {
    if (placeType === 'hospital') {
        if (spanDeg > 6) return 80
        if (spanDeg > 2.5) return 120
        if (spanDeg > 1.0) return 80
        if (spanDeg > 0.5) return 60
        return 200
    }

    if (placeType === 'shelter') {
        if (spanDeg > 2.5) return 120
        if (spanDeg > 1.2) return 40
        if (spanDeg > 0.45) return 60
        if (spanDeg > 0.2) return 80
        return 120
    }

    if (spanDeg > 6) return 100
    if (spanDeg > 2.5) return 120
    if (spanDeg > 1.0) return 64
    if (spanDeg > 0.45) return 72
    return 200
}
