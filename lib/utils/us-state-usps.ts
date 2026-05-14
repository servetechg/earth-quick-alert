/** Map full state names (uppercase) to USPS two-letter codes — for `User.state` free text. */
const STATE_NAME_TO_USPS: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  'DISTRICT OF COLUMBIA': 'DC',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
}

/** Normalize `User.state` (name or USPS) to a two-letter USPS code, or null if unknown. */
export function normalizeStateToUsps(raw?: string | null): string | null {
  const x = String(raw ?? '').trim()
  if (!x) return null
  const up = x.toUpperCase()
  if (up.length === 2 && /^[A-Z]{2}$/.test(up)) return up
  return STATE_NAME_TO_USPS[up] ?? null
}

/** Tokens for matching free text (USPS code + full ALL-CAPS name from profile map). */
export function tokensForStateMatch(uspsTwoLetter: string): string[] {
  const u = uspsTwoLetter.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(u)) return []
  const out = new Set<string>([u])
  for (const [name, code] of Object.entries(STATE_NAME_TO_USPS)) {
    if (code === u) out.add(name)
  }
  return [...out]
}

/** True if `text` plausibly references the given USPS state (code or full name). */
export function textMentionsUsState(text: string, uspsTwoLetter: string): boolean {
  const hay = text.toUpperCase()
  for (const tok of tokensForStateMatch(uspsTwoLetter)) {
    if (tok.length === 2) {
      const re = new RegExp(`(^|[^A-Z0-9])${tok}([^A-Z0-9]|$)`)
      if (re.test(hay)) return true
    } else if (hay.includes(tok)) return true
  }
  return false
}
