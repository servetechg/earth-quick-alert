# Ready2Go Mobile API v1 — Dashboard, Home, Profile, Alerts & Preparedness

**Implementation plan** for backend routes under `/api/v1`, aligned with the existing auth contract ([mobile-api-v1.md](./mobile-api-v1.md)) and the React Native app screens (`HomeScreen`, Alerts, Preparedness, Profile).

**Status:** Implemented — API reference: [mobile-api-v1-dashboard.md](./mobile-api-v1-dashboard.md). App integration: [Home](./mobile-integration-home-tab.md), [Alerts](./mobile-integration-alerts-tab.md), [Profile](./mobile-integration-profile-tab.md), [Preparedness](./mobile-integration-preparedness-tab.md).

---

## 1. Conventions (unchanged from Auth)

| Item | Rule |
|------|------|
| Base URL | `EXPO_PUBLIC_API_BASE_URL` → `https://earthquickalert.vercel.app/api/v1` |
| Auth | `Authorization: Bearer <accessToken>` on all endpoints below |
| Content-Type | `application/json` |
| Errors | `{ message, code?, errors?: [{ field, message }] }` via `apiError` / `validationError` |
| IDs | Mongo ObjectId strings (UUID-style in API responses) |
| Timestamps | ISO 8601 UTC; app formats “Issued 12 min ago” |
| Pagination | `?page=1&limit=20` → `{ items, page, limit, total, hasMore }` |

### Reuse (do not duplicate)

| Endpoint | Purpose |
|----------|---------|
| `GET /users/me` | User + full emergency profile |
| `POST /profile/complete` | First-time 7-step onboarding only |
| `POST /auth/change-password` | Password change |

### Existing backend patterns to mirror

| Pattern | Location |
|---------|----------|
| Bearer guard | `requireBearerUser()` in `lib/auth/mobile/session.ts` |
| JSON helpers | `apiJson`, `apiError`, `validationError` in `lib/api/json-response.ts` |
| Profile validation | `lib/validation/mobile/profile.ts` (Zod) |
| Route layout | `app/api/v1/<resource>/route.ts` |
| Mobile services | `lib/services/mobile/*.ts` |
| Mobile types | `lib/types/mobile/*.ts` |

---

## 2. Architecture principle

**One aggregate for Home** (`GET /dashboard/home`) — pull-to-refresh without N+1 calls.

**Resource endpoints per tab** — Alerts, Preparedness, Profile patches, Weather, Emergency — so new features (maps, 7-day forecast, incident log) do not require changing Home again.

```
Mobile App
├── Home tab      → GET /dashboard/home  (+ optional /emergency/*, /weather/current)
├── Alerts tab    → GET /alerts, PATCH /alerts/:id/read, POST /alerts/mark-all-read
├── Preparedness  → GET /preparedness/categories, GET .../:id/tasks
├── Profile tab   → GET /users/me, PATCH /users/me, PATCH /profile, PUT /profile/alert-locations
└── Tab badge     → badges.unreadAlerts on home OR GET /alerts/unread-count
```

---

## 3. What already exists vs gaps

### Reuse from web backend

| Capability | Existing code | Mobile use |
|------------|---------------|------------|
| NWS / weather alerts by lat/lon | `lib/services/weather-api.ts`, `alert-processor.ts` | Per-user zones |
| Stored weather alerts | `WeatherAlertRecord`, ingest cron | Faster list without live NWS every request |
| Zone matching | `doc/zone-matching.md`, `/api/alerts/users` logic | Same matching for mobile user + alert locations |
| Earthquakes near point | `alert-processor` + USGS | Optional in alerts feed |
| Community / admin alerts | `Alert` model, `/api/alerts/users` | Filter by user id + area |
| Preparedness CMS | `PreparednessGuide`, `Task`, `/api/preparedness-with-tasks` | Map to mobile category/task shape |
| Current weather snapshot | `lib/services/weather-api.ts` (Open-Meteo + NWS) | `/weather/current`, `/weather/forecast` |
| Geocoding | Photon / geocode helpers used in alerts routes | Profile address → lat/lon |

### New work required

| Gap | Action |
|-----|--------|
| `alertLocations` not on `UserProfile` | Extend `UserProfile` schema + `UserProfilePayload` type |
| `phone` on mobile user | Extend `User` / `ApiUser` + `PATCH /users/me` |
| Alert read state (per user) | New model e.g. `MobileAlertRead` (`userId`, `alertKey`, `readAt`) |
| Stable mobile alert `id` | Define key: NWS `alertId` or hash of source+externalId |
| `mode` (blue_sky / cloudy) | Server-derived from active alerts for user zones |
| Emergency news / incidents / map | New content service or DB collections (P4); can stub from unified events later |
| Weather preferences per user | New model or embed on `UserProfile` |
| v1 route files | `app/api/v1/dashboard`, `alerts`, `preparedness`, `weather`, `emergency`, `profile` |

---

## 4. Proposed folder layout (backend)

```
app/api/v1/
├── auth/...                    # ✅ exists
├── users/me/route.ts           # ✅ exists — extend response (phone, alertLocations)
├── profile/
│   ├── complete/route.ts       # ✅ exists
│   ├── route.ts                # PATCH /profile
│   └── alert-locations/route.ts # PUT /profile/alert-locations
├── dashboard/
│   ├── home/route.ts           # GET /dashboard/home
│   └── badges/route.ts         # optional GET /dashboard/badges
├── alerts/
│   ├── route.ts                # GET /alerts
│   ├── unread-count/route.ts   # GET /alerts/unread-count
│   ├── mark-all-read/route.ts  # POST /alerts/mark-all-read
│   └── [id]/
│       ├── route.ts            # GET /alerts/:id
│       └── read/route.ts       # PATCH /alerts/:id/read
├── preparedness/
│   └── categories/
│       ├── route.ts            # GET /preparedness/categories
│       └── [categoryId]/
│           ├── route.ts        # GET category meta
│           └── tasks/route.ts  # GET tasks
├── weather/
│   ├── current/route.ts
│   ├── forecast/route.ts
│   └── preferences/route.ts    # GET + PUT
└── emergency/
    ├── status/route.ts
    ├── news/route.ts
    ├── incidents/route.ts
    └── map/route.ts

lib/
├── types/mobile/
│   ├── auth.ts                 # ✅ extend ApiUser, UserProfilePayload
│   ├── dashboard.ts            # HomePayload, EmergencyStatus, badges
│   ├── alerts.ts               # WeatherAlert list item
│   ├── preparedness.ts
│   ├── weather.ts
│   └── emergency.ts
├── validation/mobile/
│   ├── profile.ts              # ✅ extend partial PATCH schemas
│   ├── users.ts                # PATCH /users/me
│   └── alert-locations.ts
└── services/mobile/
    ├── auth-service.ts         # ✅ extend load/save profile
    ├── profile-service.ts      # PATCH profile, PUT alert locations
    ├── dashboard-service.ts    # buildHomePayload()
    ├── alerts-service.ts       # list, read, unread count
    ├── preparedness-service.ts # map PreparednessGuide → mobile DTO
    ├── weather-service.ts      # current, forecast, preferences
    └── emergency-service.ts    # status, news, map (P4)

models/
├── UserProfile.ts              # extend: alertLocations[]
├── MobileAlertRead.ts          # new
└── MobileWeatherPreference.ts  # new (or subdoc on UserProfile)
```

---

## 5. Data model additions

### 5.1 `UserProfile.alertLocations` (max 5)

```typescript
alertLocations: [{
  id: string;       // UUID, server-generated on create
  label: string;
  city: string;
  state: string;    // 2-letter USPS
  zipCode: string;
}]
```

- `PUT /profile/alert-locations` replaces full array.
- `GET /users/me` includes `profile.alertLocations`.
- Validation: max 5, zip format same as address.

### 5.2 `MobileAlertRead`

| Field | Type |
|-------|------|
| userId | ObjectId |
| alertId | string (stable external key) |
| read | boolean |
| readAt | Date |

Unique index: `(userId, alertId)`.

### 5.3 `ApiUser` extension

Add optional `phone?: string` (E.164). `PATCH /users/me` updates `User` document only.

### 5.4 Alert identity for mobile

When building `items[]` for `GET /alerts`:

| Source | `id` | `source` label |
|--------|------|----------------|
| NWS / stored weather | `WeatherAlertRecord.alertId` | `NWPS` or `NWS` |
| Earthquake | USGS feature id | `USGS` |
| Community alert | Mongo `_id` | `COMMUNITY` |

Merge logic: port from `/api/alerts/users` (geocode profile address + each `alertLocations` entry, dedupe by id).

---

## 6. Endpoint specifications (by phase)

### Phase P0 — Home + Alerts (unblocks main tabs)

| Method | Path | Service | Notes |
|--------|------|---------|-------|
| GET | `/dashboard/home` | `dashboard-service` | Query: `include`, `newsLimit`, `alertsLimit` |
| GET | `/alerts` | `alerts-service` | Query: `sort`, `severity`, `read`, `q`, `page`, `limit` |
| GET | `/alerts/:id` | `alerts-service` | 404 `ALERT_NOT_FOUND` |
| PATCH | `/alerts/:id/read` | `alerts-service` | Body `{ read: true }` |
| POST | `/alerts/mark-all-read` | `alerts-service` | |
| GET | `/alerts/unread-count` | `alerts-service` | Optional if home.badges enough |

#### `GET /dashboard/home` composition

| Section | Source |
|---------|--------|
| `mode` | `cloudy` if any HIGH/EXTREME active alert in user zones; else `blue_sky` |
| `status` | Headline/summary from highest-severity active alert |
| `news` | P0: empty `[]` or 1–2 items from community alerts; P4: `/emergency/news` |
| `weather` | `weather-service.getCurrent(primaryAddress)` |
| `recentAlerts` | `alerts-service.list({ limit: alertsLimit })` |
| `preparednessCategories` | P0: optional top 4 from preparedness-service; P2: full |
| `badges.unreadAlerts` | Count where `read === false` |

Response shape: match mobile spec in user message (see section 1.1 of RN plan).

#### Error codes (dashboard domain)

| Code | HTTP | When |
|------|------|------|
| `PROFILE_INCOMPLETE` | 403 | PATCH `/profile` before `profileComplete` |
| `ALERT_NOT_FOUND` | 404 | Invalid alert id |
| `LOCATION_LIMIT_EXCEEDED` | 400 | > 5 alert locations |
| `WEATHER_UNAVAILABLE` | 503 | Upstream weather down (weather sections only) |

---

### Phase P1 — Profile save (Edit Profile tab)

| Method | Path | Notes |
|--------|------|-------|
| PATCH | `/users/me` | `firstName`, `lastName`, `email`, `phone` — partial |
| PATCH | `/profile` | Partial `UserProfilePayload` fields |
| PUT | `/profile/alert-locations` | Full list replace |

Rules:

- `POST /profile/complete` remains **onboarding only** (all steps required).
- `PATCH /profile` requires `profileComplete === true` else `403 PROFILE_INCOMPLETE`.
- Email change: optional `403 EMAIL_CHANGE_PENDING` if re-verify flow added later.

Extend `GET /users/me` response:

```json
{
  "user": { "id", "email", "firstName", "lastName", "phone", "emailVerified", "profileComplete" },
  "profile": { "address", "householdSize", "ada", "medical", "pets", "transport", "lodging", "alertLocations": [] }
}
```

---

### Phase P2 — Preparedness tab

| Method | Path | Backend source |
|--------|------|----------------|
| GET | `/preparedness/categories` | `PreparednessGuide` → map `category` to `id`, `title`, `subtitle`, `icon`, `taskCount` |
| GET | `/preparedness/categories/:categoryId` | Guide meta + optional intro |
| GET | `/preparedness/categories/:categoryId/tasks` | `Task` rows for guide, sorted `sortOrder` |

Auth: **Bearer required** (recommended for consistency).

Mapping note: mobile uses slug ids like `active-shooter`; store mapping table or use Mongo `_id` as `id` and document in mobile types.

Query `q`: server-side filter on title/subtitle (optional P2.1).

---

### Phase P3 — Weather screens

| Method | Path | Implementation |
|--------|------|----------------|
| GET | `/weather/current` | Geocode primary profile address → `weather-api.fetchWeatherData` → `WeatherSnapshot` |
| GET | `/weather/forecast` | `?days=7` → daily array |
| GET | `/weather/preferences` | Per-user toggles |
| PUT | `/weather/preferences` | Replace `{ preferences: [{ id, enabled }] }` |

Seed default preferences from NWS alert types or static list matching `WeatherAlertSettingsScreen`.

---

### Phase P4 — Full cloudy mode

| Method | Path | Implementation options |
|--------|------|------------------------|
| GET | `/emergency/status` | Subset of home `status` + `mode` |
| GET | `/emergency/news` | Paginated; community alerts + optional CMS |
| GET | `/emergency/incidents` | `IncidentReport` near user zones or stub |
| GET | `/emergency/map` | `mapRegion` from user centroid + markers from incidents/alerts |

`mode` must be **server-derived** (no client `disruptionModeOverride` in production).

---

## 7. Service layer responsibilities

### `alerts-service.ts` (critical path)

```text
listAlerts(userId, filters) → paginated WeatherAlert[]
markRead(userId, alertId, read)
markAllRead(userId)
getUnreadCount(userId)
getAlertById(userId, alertId)
```

Internal:

1. Load `UserProfile` + `User` for primary address and `alertLocations`.
2. Build zone list: `[formatAddress(profile.address), ...alertLocations]`.
3. Geocode each zone (cache in memory/redis later).
4. Fetch active alerts: `WeatherAlertRecord` + live NWS point query (same as web).
5. Merge community alerts targeted to user or overlapping zones.
6. Join `MobileAlertRead` for `read` flag.
7. Sort/filter per query params.

### `dashboard-service.ts`

```text
buildHomePayload(userId, options) → HomeResponse
```

Calls `alerts-service`, `weather-service`, `preparedness-service` (preview), computes `mode` + `status`.

### `profile-service.ts`

```text
patchProfile(userId, partial) → full profile
replaceAlertLocations(userId, locations) → alertLocations
patchUserAccount(userId, partial) → ApiUser
```

---

## 8. Implementation phases (recommended order)

| Phase | Endpoints | Est. effort | Unblocks |
|-------|-----------|-------------|----------|
| **P0** | `GET /dashboard/home`, `GET /alerts`, `GET /alerts/:id`, `PATCH .../read`, `POST mark-all-read`, `GET unread-count` | 3–5 days | Home + Alerts tabs |
| **P1** | `PATCH /users/me`, `PATCH /profile`, `PUT /profile/alert-locations`, extend `GET /users/me` | 2–3 days | Profile tab save |
| **P2** | Preparedness categories + tasks | 1–2 days | Preparedness tab |
| **P3** | Weather current/forecast/preferences | 2–3 days | Weather screens |
| **P4** | Emergency status/news/incidents/map | 3–5 days | Full cloudy mode + news screen |

### P0 task checklist

- [ ] Add `lib/types/mobile/dashboard.ts`, `alerts.ts`
- [ ] Add `models/MobileAlertRead.ts`
- [ ] Implement `lib/services/mobile/alerts-service.ts`
- [ ] Implement `lib/services/mobile/dashboard-service.ts`
- [ ] Add routes under `app/api/v1/dashboard/home`, `app/api/v1/alerts/**`
- [ ] Unit-test zone matching with one address + one alert location
- [ ] Update `docs/mobile-api-v1.md` with P0 sections (or link to this doc)

### P1 task checklist

- [ ] Extend `UserProfile` + migration-safe defaults for existing profiles
- [ ] Extend `lib/validation/mobile/profile.ts` (partial schema)
- [ ] Add `lib/validation/mobile/users.ts`
- [ ] Implement `profile-service.ts`
- [ ] Add `PATCH` routes; extend `users/me` GET

---

## 9. Mobile app integration (when implementing RN)

Mirror auth pattern:

```
src/services/
  dashboard.service.ts   → getHome(params?)
  alerts.service.ts      → listAlerts, getAlert, markRead, markAllRead, getUnreadCount
  preparedness.service.ts
  weather.service.ts
  emergency.service.ts
  profile.service.ts     → patchUser, patchProfile, putAlertLocations
```

Redux:

- `dashboardSlice` — thunk `fetchHome` on pull-to-refresh
- `alertsSlice` — replace `MOCK_ALERTS`; sync `unreadCount` with API
- `registrationSlice` — hydrate from `GET /users/me`; update after PATCH

Screen → API mapping: see section 9 of RN spec (unchanged).

---

## 10. Security & performance

| Topic | Rule |
|-------|------|
| Role | All v1 dashboard routes: `User.role === 'user'` only (same as auth) |
| Rate limit | Consider per-user limit on `GET /dashboard/home` (e.g. 60/min) |
| Caching | Short TTL cache for geocode + NWS point (30–60s) per zone |
| Privacy | Alerts list only for authenticated user’s zones — never accept arbitrary lat/lon from client in P0 |
| CORS | Already `*` on `/api/*` for Expo |

---

## 11. Testing strategy

| Layer | Tests |
|-------|-------|
| Validation | Zod schemas for PATCH bodies, alert-locations max 5 |
| alerts-service | Mock geocode + fixture `WeatherAlertRecord` → expect dedupe + read flags |
| dashboard-service | `mode` flips to `cloudy` when fixture severe alert present |
| Routes | Integration: Bearer token → `GET /dashboard/home` 200 shape |
| Manual | Expo app against `http://<LAN>:3000/api/v1` per existing auth doc |

---

## 12. Documentation deliverables after implementation

1. Extend [mobile-api-v1.md](./mobile-api-v1.md) with sections 12–20 (dashboard endpoints) or split into `mobile-api-v1-dashboard.md` (this file becomes spec + checklist).
2. Add TypeScript exports in `lib/types/mobile/*` for RN to copy.
3. Postman/Insomnia collection optional.

---

## 13. Out of scope for v1 (noted for v1.1)

- `GET /preparedness/progress`, `PATCH /preparedness/tasks/:id`
- `POST /users/me/avatar`
- `GET /profile/export`
- Push notification device registration
- Real-time WebSocket alert stream

---

## 14. Quick reference — screen → API

| Screen / component | Target API |
|--------------------|------------|
| HomeScreen banners | `GET /dashboard/home` → `mode`, `status` |
| BlueSkyNewsFeed | `home.news` or `GET /emergency/news` (P4) |
| WeatherSummaryCard | `home.weather` or `GET /weather/current` |
| Home Active Alerts | `home.recentAlerts` |
| Preparedness grid on Home | `home.preparednessCategories` |
| AlertsScreen | `GET /alerts` |
| PreparednessScreen | `GET /preparedness/categories` |
| PreparednessCategoryScreen | `GET /preparedness/categories/:id/tasks` |
| ProfileScreen | `GET /users/me` |
| EditProfileScreen | `PATCH /users/me` + `PATCH /profile` |
| AlertLocationsEditor | `PUT /profile/alert-locations` |
| WeatherAlertSettingsScreen | `GET/PUT /weather/preferences` |
| DashboardTabBar badge | `home.badges.unreadAlerts` or `GET /alerts/unread-count` |

---

*Next step: implement **P0** (models + `alerts-service` + `dashboard-service` + routes), then **P1** profile extensions.*
