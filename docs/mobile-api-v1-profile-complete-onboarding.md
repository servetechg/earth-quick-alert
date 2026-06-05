# Backend update — 8-step onboarding & `POST /profile/complete`

**For:** React Native frontend team  
**Date:** Aligns with 8-step onboarding (address → alert locations → household … → lodging)  
**Related:** [mobile-api-v1.md](./mobile-api-v1.md), [Profile tab integration](./mobile-integration-profile-tab.md)

---

## Summary

| Topic | Status |
|-------|--------|
| Address fields on `profile.address` | **Unchanged** (6 fields) |
| New `profile.alertLocations` on complete | **Supported** |
| `GET /users/me` returns `alertLocations` | **Yes** (`[]` if none) |
| Client ids `loc-{timestamp}-…` | **Ignored** — server assigns UUIDs |
| `useCurrentLocation` | **Stored** on address; no lat/lng yet |
| AI / static demo data | **Not used** on these routes |

Onboarding is still **one shot** at the end: `POST /profile/complete` with the full `profile` object. Step count (8) is app-only; the backend does not receive per-step calls.

---

## What changed on the backend

### 1. `POST /profile/complete` — request body

**Optional** top-level field inside `profile`:

```json
{
  "profile": {
    "address": {
      "streetAddress": "123 Main St",
      "aptUnit": "",
      "city": "Springfield",
      "state": "IL",
      "zipCode": "62704",
      "useCurrentLocation": false
    },
    "alertLocations": [
      {
        "id": "loc-1730000000000-abc",
        "label": "Parents",
        "city": "Chicago",
        "state": "IL",
        "zipCode": "60601"
      },
      {
        "label": "Work",
        "city": "St Louis",
        "state": "MO"
      }
    ],
    "householdSize": 4,
    "ada": { "hasRequirement": false, "selectedOptions": [], "otherDetails": "" },
    "medical": { "hasRequirement": false, "selectedOptions": [], "otherDetails": "" },
    "pets": { "hasRequirement": false, "selectedOptions": [], "otherDetails": "" },
    "transport": { "hasRequirement": false, "selectedOptions": [], "otherDetails": "" },
    "lodging": { "selectedOptions": ["Pet Friendly"], "otherDetails": "" }
  }
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `profile.address` | Yes | Same as before |
| `profile.alertLocations` | No | Omit, `[]`, or 1–5 items |
| Other sections | Yes | Same validation as 7-step flow |

### 2. Alert location validation (different from home address)

| Field | Required | Rules |
|-------|----------|--------|
| `label` | Yes | Non-empty string |
| `city` | Yes | Non-empty |
| `state` | Yes | Min 2 chars (2-letter USPS or full name) |
| `zipCode` | **No** | If present: `12345` or `12345-6789`; empty/missing → stored as `""` |
| `id` | No | Client id **discarded**; response uses server UUID |

**Not allowed on alert locations:** `streetAddress`, `aptUnit`, `useCurrentLocation`.

**Max:** 5 locations → `400` `LOCATION_LIMIT_EXCEEDED`.

### 3. Server behavior on save

- Primary **home** address → `UserProfile.address` (unchanged).
- **Alert locations** → `UserProfile.alertLocations[]` (separate array, not merged into address).
- Each saved location gets a new **`id` (UUID)** from the server.
- Skip step 2 → send `alertLocations: []` or omit (treated as `[]` on complete).

### 4. `GET /users/me` — response

When `profileComplete === true`:

```json
{
  "user": { "id", "email", "firstName", "lastName", "phone", "emailVerified", "profileComplete" },
  "profile": {
    "address": { "streetAddress", "aptUnit", "city", "state", "zipCode", "useCurrentLocation" },
    "householdSize": 4,
    "ada": { ... },
    "medical": { ... },
    "pets": { ... },
    "transport": { ... },
    "lodging": { ... },
    "alertLocations": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "label": "Parents",
        "city": "Chicago",
        "state": "IL",
        "zipCode": "60601"
      }
    ]
  }
}
```

**Important for hydration:** Replace Redux `alertLocations` with the **response** from complete or `GET /users/me` — do not keep client `loc-*` ids after save.

### 5. `POST /profile/complete` — response

Same shape as before, but `profile.alertLocations` reflects **server UUIDs**:

```json
{
  "message": "Profile completed",
  "user": { "profileComplete": true, ... },
  "profile": { /* full profile including alertLocations */ }
}
```

---

## Frontend integration checklist

### Onboarding (`toProfilePayload`)

- [ ] Keep sending `address` with all 6 fields (including `useCurrentLocation`).
- [ ] Include `alertLocations` when user added any; otherwise `[]` or omit.
- [ ] Do **not** send `currentStep`, `isStarted`, `isComplete` in API body.
- [ ] After successful complete, `hydrateProfileFromApi({ user, profile })` using **response.profile** (new ids).

### Alert locations step (step 2)

- [ ] Client ids like `loc-{timestamp}-…` are fine for local UI only.
- [ ] `zipCode` optional per row.
- [ ] Skip → `alertLocations: []`.

### Profile tab (after onboarding)

- [ ] Load: `GET /users/me` → `profile.alertLocations`.
- [ ] Edit list later: `PUT /profile/alert-locations` (not `POST /profile/complete`).

### Alerts / Home geography

- [ ] Alerts use **home address + all `alertLocations`** for NWS matching after complete.
- [ ] Changing locations in Profile → `PUT /profile/alert-locations` → refresh alerts/home.

---

## Errors

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Invalid address, alert location, or lodging options |
| `LOCATION_LIMIT_EXCEEDED` | 400 | More than 5 `alertLocations` |
| `EMAIL_NOT_VERIFIED` | 403 | Complete before OTP |
| `PROFILE_INCOMPLETE` | 403 | N/A on complete; used on `PATCH /profile` only |

---

## Example `toProfilePayload` (app)

No change to address mapping; only ensure alert locations are included:

```typescript
export function toProfilePayload(state: RegistrationState): ProfilePayload {
  return {
    address: pickAddressData(state.address),
    householdSize: coerceHouseholdSize(state.householdSize),
    ada: state.ada,
    medical: state.medical,
    pets: state.pets,
    transport: state.transport,
    lodging: { ... },
    alertLocations:
      state.alertLocations.length > 0 ? state.alertLocations : [],
  };
}
```

After `POST /profile/complete`:

```typescript
const res = await completeProfile(token, { profile: toProfilePayload(state) });
dispatch(hydrateProfileFromApi({ user: res.user, profile: res.profile }));
// res.profile.alertLocations[].id are server UUIDs — use these everywhere
```

---

## Backend files touched

| File | Change |
|------|--------|
| `lib/validation/mobile/profile.ts` | Optional `alertLocations` on complete schema |
| `lib/validation/mobile/alert-locations.ts` | Optional ZIP for alert-only rows |
| `lib/services/mobile/normalize-alert-locations.ts` | UUID assignment, max 5 |
| `lib/services/mobile/auth-service.ts` | Persist `alertLocations` on complete |
| `app/api/v1/profile/complete/route.ts` | Default `[]`, handle limit error |
| `models/UserProfile.ts` | `alertLocations[].zipCode` optional (default `""`) |

---

## Unchanged

- Address field names: `streetAddress`, `aptUnit`, `city`, `state`, `zipCode`, `useCurrentLocation`
- Lodging / ADA / medical option strings
- Single endpoint for onboarding finish (`POST /profile/complete` only)
- `PATCH /profile` / `PUT /profile/alert-locations` for Profile tab edits after onboarding
