import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import type { RiskExposureSnapshot } from '@/lib/types/risk-assessment';
import { CITY_TO_COUNTY_HINT, type CountyPopulationHint } from '@/lib/services/risk-exposure-service';
import {
    coordinatesInJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normState(s?: string | null): string {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '');
}

/** Map 2-letter USPS and full state names to USPS (for User.state free text). */
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
};

function userStateToUsps(raw?: string | null): string | null {
  const x = String(raw ?? '').trim();
  if (!x) return null;
  const up = x.toUpperCase();
  if (up.length === 2 && /^[A-Z]{2}$/.test(up)) return up;
  return STATE_NAME_TO_USPS[up] ?? null;
}

function textHasCountyStem(haystack: string, stem: string): boolean {
  const h = haystack.toLowerCase();
  const s = stem.toLowerCase().replace(/-/g, ' ');
  return h.includes(s) || h.includes(s.replace(/\s+/g, ''));
}

function userMatchesCountyHint(u: { state?: string | null; city?: string | null; location?: string | null }, hints: CountyPopulationHint[]): boolean {
  const usps = userStateToUsps(u.state);
  if (!usps) return false;
  const city = String(u.city ?? '').toLowerCase().trim();
  const loc = String(u.location ?? '').toLowerCase();
  const hay = `${city} ${loc}`;
  for (const h of hints) {
    if (h.stateAbbr !== usps) continue;
    if (textHasCountyStem(hay, h.countyStem)) return true;
    const cityHint = CITY_TO_COUNTY_HINT[city];
    if (cityHint && cityHint.stateAbbr === usps && cityHint.countyStem === h.countyStem) return true;
  }
  return false;
}

function userInAnyBuffer(
  lat: number | null | undefined,
  lng: number | null | undefined,
  exposure: RiskExposureSnapshot,
): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return exposure.centroids.some((c) => haversineKm(lat, lng, c.lat, c.lon) <= c.radiusKm);
}

/**
 * Approved `role: user` accounts that plausibly overlap hazard counties (string match) or NWPS / epicenter buffers.
 */
export async function countReady2GoReachableUsers(
    exposure: RiskExposureSnapshot | null | undefined,
    jurisdiction?: SubAdminJurisdiction | null,
): Promise<number> {
  if (!exposure) return 0;
  const countyHints: CountyPopulationHint[] = exposure.countyMatchHints.map((c) => ({
    stateAbbr: c.stateAbbr,
    countyStem: c.countyStem,
    sourceLabel: 'ingest',
  }));

  await connectDB();
  const users = await User.find({
    role: 'user',
    accountStatus: 'approved',
  })
    .select('state city location lat lng')
    .lean();

  let n = 0;
  for (const u of users) {
    const lat = u.lat != null ? Number(u.lat) : null;
    const lng = u.lng != null ? Number(u.lng) : null;

    if (jurisdiction) {
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }
      if (!coordinatesInJurisdiction(lat, lng, jurisdiction)) {
        continue;
      }
    }

    if (userInAnyBuffer(lat, lng, exposure)) {
      n++;
      continue;
    }
    if (countyHints.length && userMatchesCountyHint(u, countyHints)) n++;
  }
  return n;
}
