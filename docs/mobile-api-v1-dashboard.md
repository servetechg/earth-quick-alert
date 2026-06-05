# Ready2Go Mobile API v1 — Dashboard, Home, Alerts & Preparedness

**Status: Implemented** (backend routes under `/api/v1`).

Companion to [mobile-api-v1.md](./mobile-api-v1.md) (auth + onboarding).

---

## Base URL & auth

| Item | Value |
|------|--------|
| Base | `EXPO_PUBLIC_API_BASE_URL` → `https://earthquickalert.vercel.app/api/v1` |
| Auth | `Authorization: Bearer <accessToken>` on all endpoints below |
| Role | Citizen accounts only (`role: user`) — others get `403 FORBIDDEN` |

---

## How data is loaded (backend)

| Data | Source |
|------|--------|
| **Alerts** | `WeatherAlertRecord` (NWS ingest) + live USGS earthquakes + `CommunityAlert`, matched to user **profile address** + **alert locations** (same logic as web `/api/alerts/users`) |
| **Read/unread** | `MobileAlertRead` collection per user + alert id |
| **Weather** | Open-Meteo via `weather-api.ts`, geocoded from profile address |
| **Preparedness** | `PreparednessGuide` + **`SubAdminTask`** scoped by citizen profile address (state match + sub-admin license radius) |
| **Emergency news** | Derived from active alerts (community + NWS) |
| **Emergency map** | Geocoded home + alert markers (approximate positions for alerts) |
| **mode** (`blue_sky` / `cloudy`) | Server: `cloudy` if any **HIGH** or **EXTREME** alert in user zones |

User must complete onboarding (`POST /profile/complete`) so address exists — otherwise alerts/weather may be empty.

---

## Endpoint reference

### Home

#### `GET /dashboard/home`

**Query:** `include` (comma: `status,news,weather,alerts,preparedness`), `newsLimit`, `alertsLimit`

**Displays on app:** Home pull-to-refresh — banners, news feed, weather card, 2 recent alerts, preparedness preview, tab badge count.

```json
{
  "mode": "cloudy",
  "status": { "headline", "summary", "severity", "updatedAt" },
  "news": [{ "id", "title", "body", "timestamp", "source", "severity", "category", "location", "icon" }],
  "weather": { "temperatureF", "condition", "highF", "lowF", "humidity", "windMph", "locationLabel" },
  "recentAlerts": [ /* WeatherAlert[] */ ],
  "preparednessCategories": [ /* top 4 */ ],
  "badges": { "unreadAlerts": 2 }
}
```

#### `GET /dashboard/badges`

Lightweight: `{ "unreadAlerts": 2 }` for tab bar polling.

---

### Alerts

#### `GET /alerts`

**Query:** `sort=recent|severity`, `severity`, `read`, `q`, `page`, `limit`

**App:** Alerts tab list. Map `issuedAt` → “12 min ago” client-side.

```json
{
  "items": [{
    "id", "severity": "MODERATE", "title", "location", "source": "NWPS",
    "issuedAt", "expiresAt", "expiresLabel", "read", "description"
  }],
  "page", "limit", "total", "hasMore", "unreadCount"
}
```

#### `GET /alerts/:id` — detail / deep link

#### `PATCH /alerts/:id/read` — body `{ "read": true }` → `{ message, unreadCount }`

#### `POST /alerts/mark-all-read` → `{ message, unreadCount: 0 }`

#### `GET /alerts/unread-count` → `{ unreadCount }`

---

### Profile

#### `GET /users/me` (existing)

Now includes `profile.alertLocations[]` when complete.

#### `PATCH /users/me`

Body (partial): `{ firstName?, lastName?, email?, phone? }` (phone E.164)

**App:** Edit Profile account fields.

`GET /users/me` and auth responses include optional `user.profilePic` (Cloudinary HTTPS URL).

#### `POST /users/me/avatar`

`multipart/form-data` field `file` — JPEG/PNG/WebP, max 2 MB. Uploads to Cloudinary (`earthquick/profiles`), saves on user, replaces previous photo.

**Response:** `{ message, user }`

#### `DELETE /users/me/avatar`

Removes profile photo from user and Cloudinary.

**Response:** `{ message, user }`

**App:** Profile tab avatar picker (same flow as web settings photo upload).

#### `PATCH /profile`

Partial emergency profile after `profileComplete`. Errors: `403 PROFILE_INCOMPLETE`.

**App:** Address, household, ADA, medical, etc.

#### `PUT /profile/alert-locations`

Body: `{ alertLocations: [{ id?, label, city, state, zipCode }] }` — max 5.

**App:** AlertLocationsEditor — replace full list.

#### `POST /profile/complete` (existing)

Onboarding only — do not use for Profile tab edits.

---

### Preparedness

Jurisdiction-scoped: citizen `profile.address` is geocoded; matching sub-admin (same state + inside license radius) supplies `SubAdminTask` rows. See [mobile-integration-preparedness-tab.md](./mobile-integration-preparedness-tab.md).

#### `GET /preparedness/categories?q=`

**App:** Preparedness tab grid (local sub-admin content only).

#### `GET /preparedness/categories/:categoryId`

Category meta + intro (404 if not in citizen’s jurisdiction).

#### `GET /preparedness/categories/:categoryId/tasks`

Task list from matching sub-admin’s `SubAdminTask` collection.

---

### Weather

#### `GET /weather/current` — Home weather card / WeatherScreen

#### `GET /weather/forecast?days=7`

#### `GET /weather/preferences` / `PUT /weather/preferences`

Body: `{ preferences: [{ id, enabled }] }`

**App:** WeatherAlertSettingsScreen

---

### Emergency (cloudy mode)

#### `GET /emergency/status` — `mode` + `status` only

#### `GET /emergency/news?page&limit&category`

Paginated news items.

#### `GET /emergency/incidents` — `{ items: IncidentLogEntry[] }`

#### `GET /emergency/map` — `{ mapRegion, markers }`

---

## React Native integration (per tab)

Use these dedicated plans for app wiring — each includes API mapping, types, services, Redux, flows, and checklists:

| Tab | Integration plan |
|-----|------------------|
| **Home** | [mobile-integration-home-tab.md](./mobile-integration-home-tab.md) |
| **Alerts** | [mobile-integration-alerts-tab.md](./mobile-integration-alerts-tab.md) |
| **Profile** | [mobile-integration-profile-tab.md](./mobile-integration-profile-tab.md) |
| **Preparedness** | [mobile-integration-preparedness-tab.md](./mobile-integration-preparedness-tab.md) |

**Also on Home / separate screens:** Weather (`GET /weather/*`) and Emergency (`GET /emergency/*`) are documented in the [Home tab plan](./mobile-integration-home-tab.md) (cloudy mode, optional routes). Endpoint details remain in sections above.

**Suggested app rollout:** Home + Alerts (P0) → Profile (P1) → Preparedness (P2) → Weather + Emergency (P3–P4).

Shared setup (all tabs): `EXPO_PUBLIC_API_BASE_URL`, Bearer token on requests, copy types from `lib/types/mobile/`, shared `apiV1()` client per [mobile-api-v1.md](./mobile-api-v1.md).

---

## Backend file index

| Routes | Service |
|--------|---------|
| `app/api/v1/dashboard/*` | `lib/services/mobile/dashboard-service.ts` |
| `app/api/v1/alerts/*` | `lib/services/mobile/alerts-service.ts` |
| `app/api/v1/profile/*` | `lib/services/mobile/profile-service.ts` |
| `app/api/v1/preparedness/*` | `lib/services/mobile/preparedness-service.ts` |
| `app/api/v1/weather/*` | `lib/services/mobile/weather-service.ts` |
| `app/api/v1/emergency/*` | `lib/services/mobile/emergency-service.ts` |

Models: `MobileAlertRead`, `UserProfile.alertLocations`, `UserProfile.weatherPreferences`.

---

## Testing locally

1. `npm run dev`
2. Sign up / login via v1 auth → complete profile with real US address.
3. `GET /api/v1/dashboard/home` with Bearer token.
4. Ensure weather ingest cron or `/api/alerts/ingest-weather` has run so `WeatherAlertRecord` has data.

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/v1/dashboard/home
```
