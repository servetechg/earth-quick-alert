import type { Road511Event } from '@/lib/gis/road511/road511-types'

/**
 * Strict gates for "genuine full road closure" — intended to match what users
 * expect on Google Maps (road closed), not incidents / permits / lane work.
 */

const FULL_CLOSURE_RE =
    /\b(?:full(?:y)?\s+clos(?:ed|ure)|complete\s+clos(?:ed|ure)|road(?:way)?\s+(?:is\s+)?closed|bridge\s+(?:is\s+)?closed|closed\s+to\s+(?:all\s+)?(?:thru\s+|through\s+)?(?:traffic|vehicles)|entire\s+(?:street|road|roadway)\s+(?:will\s+be\s+)?closed|all\s+lanes?\s+(?:are\s+)?closed|road\s+is\s+closed|closed\s+in\s+both\s+directions|impassable)\b/i

/** Explicit contradictions — still open to traffic in some form. */
const PARTIAL_OR_PERMIT_RE =
    /\b(?:close\s+one\s+(?:travel\s+)?lane|one\s+travel\s+lane|single\s+lane|shoulder\s+only|right\s+shoulder|left\s+shoulder|excavation\s+permit\s+has\s+been\s+issued|temporary\s+use\s+of\s+right\s+of\s+way\s+permit)\b/i

const TRAFFIC_NOISE_RE =
    /\b(?:disabled\s*vehicle|disabledvehicle|abandon(?:ed|ment)|stall(?:ed)?|collision|accident|crash|avl\s+vehicle)\b/i

function parseTimeMs(raw: unknown): number | null {
    if (raw == null || raw === '') return null
    const ms = Date.parse(String(raw))
    return Number.isFinite(ms) ? ms : null
}

export function road511EventBlob(event: Road511Event): string {
    const meta = event.metadata ?? {}
    return [
        event.title,
        event.description,
        event.lanes_affected,
        event.sub_type,
        event.cause,
        event.type,
        meta.event_type,
        meta.affected_lanes,
        Array.isArray(event.affected_roads) ? event.affected_roads.join(' ') : '',
    ]
        .filter((v) => v != null && String(v).trim() !== '')
        .join(' ')
}

export function hasExplicitFullClosureLanguage(text: string): boolean {
    const t = text.trim()
    if (!t) return false
    if (!FULL_CLOSURE_RE.test(t)) return false
    // "entire street will be closed" in a permit is OK; "close one travel lane" is not.
    if (PARTIAL_OR_PERMIT_RE.test(t) && !/\bentire\s+(?:street|road|roadway)\s+(?:will\s+be\s+)?closed\b/i.test(t)) {
        // Permit boilerplate alone — reject unless another strong phrase remains.
        // If both permit boilerplate AND full-closure phrase exist, keep only when
        // "entire street…closed" or "full closure" is present without one-lane wording.
        if (/\b(?:close\s+one\s+(?:travel\s+)?lane|one\s+travel\s+lane)\b/i.test(t)) return false
        if (
            /\bexcavation\s+permit\s+has\s+been\s+issued\b/i.test(t) &&
            !/\b(?:full(?:y)?\s+clos(?:ed|ure)|entire\s+(?:street|road|roadway)\s+(?:will\s+be\s+)?closed|road(?:way)?\s+closed)\b/i.test(
                t,
            )
        ) {
            return false
        }
    }
    return true
}

/** True for WZDx / city permit sources that over-tag `all-lanes-closed`. */
export function isWzdxLikeSource(event: Road511Event): boolean {
    const source = String(event.source ?? '').toUpperCase()
    const id = String(event.id ?? '').toUpperCase()
    const jurisdiction = String(event.jurisdiction ?? '').toUpperCase()
    return (
        source.startsWith('WZDX') ||
        jurisdiction.startsWith('WZDX') ||
        id.includes('WZDX')
    )
}

function isTrafficNoiseEvent(event: Road511Event): boolean {
    const blob = [
        event.sub_type,
        event.cause,
        event.title,
        event.description,
        event.metadata?.event_type,
    ]
        .filter(Boolean)
        .join(' ')
    return TRAFFIC_NOISE_RE.test(blob)
}

/**
 * Lane fields that describe partial impacts (not a full roadway shutdown).
 * Does NOT treat `all-lanes-closed` as proof of a real closure by itself.
 */
function isPartialLaneImpact(lanesAffected: string | undefined): boolean {
    if (!lanesAffected) return false
    const s = lanesAffected.toLowerCase().trim()
    if (!s || s === 'unknown') return false
    if (s === 'all-lanes-closed' || /all\s+lanes?\s+closed/.test(s)) return false

    const shoulderOnly =
        /\bshoulder\b/.test(s) && !/\blane\s*\d|\blanes?\b/.test(s.replace(/shoulders?/g, ''))
    if (shoulderOnly) return true

    // Named travel lanes without an "all lanes" marker → partial.
    if (/\blane\s*\d/.test(s) || /\blanes?\s+\d/.test(s)) return true
    if (/\bleft\s+lane|\bright\s+lane|\bcenter\s+lane|\bmiddle\s+lane\b/.test(s)) return true

    return false
}

export function isRoad511EventCurrentlyActive(
    event: Road511Event,
    nowMs: number = Date.now(),
): boolean {
    const status = String(event.status ?? 'active').toLowerCase()
    if (status && status !== 'active') return false

    const startMs = parseTimeMs(event.start_time)
    const endMs = parseTimeMs(event.end_time ?? event.effective_end_time)

    // Future / not yet in effect (planned permits, scheduled work).
    if (startMs != null && startMs > nowMs) return false
    // Expired.
    if (endMs != null && endMs < nowMs) return false

    return true
}

/**
 * Keep only genuine, currently active full road closures.
 */
export function isGenuineFullRoadClosure(
    event: Road511Event,
    nowMs: number = Date.now(),
): boolean {
    if (!isRoad511EventCurrentlyActive(event, nowMs)) return false

    const type = String(event.type ?? '').toLowerCase()
    // Native closure type from Road511 (rare in some states, but authoritative).
    if (type === 'closure') return true

    const blob = road511EventBlob(event)
    const explicit = hasExplicitFullClosureLanguage(blob)

    // Accidents / disabled / stall / abandonment — never unless text is unambiguous.
    if (isTrafficNoiseEvent(event) && !explicit) return false

    // Partial lane / shoulder impacts without full-closure wording.
    if (isPartialLaneImpact(event.lanes_affected) && !explicit) return false

    // WZDx / permit feeds: never trust `all-lanes-closed` alone.
    if (isWzdxLikeSource(event)) {
        return explicit
    }

    // DOT construction / restriction / incident — require explicit full-closure language.
    return explicit
}

/** Same language gate for legacy WZDX segments merged as a fallback. */
export function wzdxSegmentLooksLikeGenuineClosure(reason: string | undefined): boolean {
    if (!reason) return false
    return hasExplicitFullClosureLanguage(reason)
}
