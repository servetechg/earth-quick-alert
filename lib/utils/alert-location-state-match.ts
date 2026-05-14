import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes'
import { normalizeStateToUsps, textMentionsUsState } from '@/lib/utils/us-state-usps'

/** True when sub-admin state is non-empty and we should filter the alerts feed. */
export function shouldFilterAlertsByState(stateRaw: string | null | undefined): boolean {
  return Boolean(String(stateRaw ?? '').trim())
}

/**
 * Whether free-text location fields (NWS areaDesc, summaries) plausibly reference `stateRaw`
 * (full state name or USPS code from the user profile).
 */
export function locationStringsMatchState(parts: string[], stateRaw: string): boolean {
  const raw = String(stateRaw ?? '').trim()
  if (!raw) return true
  const usps = normalizeStateToUsps(raw)
  const hay = parts.filter(Boolean).join(' \n ').toUpperCase()
  const long = raw.toUpperCase()
  if (long.length >= 3 && hay.includes(long)) return true
  if (usps && usps.length === 2) {
    const re = new RegExp(`(^|[^A-Z])${usps}([^A-Z]|$)`)
    if (re.test(hay)) return true
  }
  return false
}

export function alertRowMatchesUserState(
  row: { location?: string; locations?: string[] },
  stateRaw: string,
): boolean {
  if (!shouldFilterAlertsByState(stateRaw)) return true
  const locs = Array.isArray(row.locations) ? row.locations : []
  const parts = [typeof row.location === 'string' ? row.location : '', ...locs.map((x) => String(x))]
  return locationStringsMatchState(parts, stateRaw)
}

function joinAlertTextParts(row: {
  location?: string
  locations?: string[]
  description?: string
  name?: string
  instructions?: string[]
}): string {
  const locs = Array.isArray(row.locations) ? row.locations : []
  return [
    typeof row.location === 'string' ? row.location : '',
    ...locs.map((x) => String(x)),
    typeof row.description === 'string' ? row.description : '',
    typeof row.name === 'string' ? row.name : '',
    ...(Array.isArray(row.instructions) ? row.instructions : []).map(String),
  ]
    .filter(Boolean)
    .join('\n')
}

/** Parse "Hotspot near lat, lon" or trailing "lat, lon" (USGS earthquake cards) — values are decimal degrees. */
function parseLatLonPairFromLocation(loc: string): { lat: number; lon: number } | null {
  const s = loc.trim()
  let m = s.match(/Hotspot near\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/i)
  if (m) {
    const lat = Number(m[1])
    const lon = Number(m[2])
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
  }
  m = s.match(/·\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/i)
  if (m) {
    const lat = Number(m[1])
    const lon = Number(m[2])
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
  }
  return null
}

/**
 * Sub-admin feed visibility aligned with AI Risk **state-scoped** ingest:
 * NWS / USGS / NWPS use geography text; FIRMS uses state bbox on hotspot coordinates; wildfire feeds + FEMA use state tokens in text.
 * Super-admins do not use this filter (`resolveSubAdminStateFilterRaw` is null).
 */
export function alertRowMatchesAiAlignedStateScope(
  row: {
    source?: string
    location?: string
    locations?: string[]
    description?: string
    name?: string
    instructions?: string[]
  },
  stateRaw: string,
): boolean {
  if (!shouldFilterAlertsByState(stateRaw)) return true
  const usps = normalizeStateToUsps(stateRaw)
  if (!usps) {
    return alertRowMatchesUserState(
      { location: row.location, locations: row.locations },
      stateRaw,
    )
  }

  const src = String(row.source ?? 'nws').toLowerCase()
  const textBlob = joinAlertTextParts(row)

  if (src === 'firms') {
    const loc = typeof row.location === 'string' ? row.location : ''
    const coords = parseLatLonPairFromLocation(loc)
    if (coords && pointInUsStateBBox(coords.lon, coords.lat, usps)) return true
    return textMentionsUsState(textBlob, usps)
  }

  if (src === 'inciweb' || src === 'wfigs' || src === 'fema') {
    return textMentionsUsState(textBlob, usps)
  }

  if (src === 'earthquake') {
    if (textMentionsUsState(textBlob, usps)) return true
    const loc = typeof row.location === 'string' ? row.location : ''
    const coords = parseLatLonPairFromLocation(loc)
    if (coords && pointInUsStateBBox(coords.lon, coords.lat, usps)) return true
    return false
  }

  if (src === 'nws' || src === 'usgs' || src === 'nwps') {
    return (
      alertRowMatchesUserState({ location: row.location, locations: row.locations }, stateRaw) ||
      textMentionsUsState(textBlob, usps)
    )
  }

  return (
    alertRowMatchesUserState({ location: row.location, locations: row.locations }, stateRaw) ||
    textMentionsUsState(textBlob, usps)
  )
}
