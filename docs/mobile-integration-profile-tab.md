# Mobile integration plan — Profile tab

**Audience:** React Native app (`ProfileScreen`, `EditProfileScreen`, `AlertLocationsEditor`)  
**Backend:** `/api/v1/users/me`, `/api/v1/users/me/avatar`, `/api/v1/profile/*` (implemented)  
**Related:** [mobile-api-v1.md](./mobile-api-v1.md) (onboarding), [mobile-api-v1-dashboard.md](./mobile-api-v1-dashboard.md)

---

## 1. Goal

Profile tab today reads **auth.user + registration Redux** and saves **locally only**. Wire **read** from `GET /users/me` and **save** via `PATCH /users/me`, `POST/DELETE /users/me/avatar`, `PATCH /profile`, and `PUT /profile/alert-locations`.

**Do not** use `POST /profile/complete` from Profile tab — that remains **onboarding finish only** (step 8 lodging → submit).

**8-step onboarding:** `alertLocations` on complete — see [mobile-api-v1-profile-complete-onboarding.md](./mobile-api-v1-profile-complete-onboarding.md).

---

## 2. API summary

| Method | Path | Use on |
|--------|------|--------|
| GET | `/users/me` | Profile load, app cold start, after login |
| PATCH | `/users/me` | Edit Profile — name, email, phone |
| POST | `/users/me/avatar` | Upload / replace profile photo |
| DELETE | `/users/me/avatar` | Remove profile photo |
| PATCH | `/profile` | Edit Profile — address, household, ADA, medical, pets, transport, lodging |
| PUT | `/profile/alert-locations` | Alert locations editor (max 5) |
| POST | `/profile/complete` | **Onboarding only** (existing) |

---

## 3. `GET /users/me` — read path

### When to call

| Event | Action |
|-------|--------|
| App launch (has tokens) | Hydrate user + profile |
| After login / OTP | Hydrate |
| Profile tab focus | Refresh if stale |
| After any PATCH/PUT/POST/DELETE success | Replace local state from response |

### Response shape

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Smith",
    "phone": "+15551234567",
    "profilePic": "https://res.cloudinary.com/.../earthquick/profiles/abc.jpg",
    "emailVerified": true,
    "profileComplete": true
  },
  "profile": {
    "address": {
      "streetAddress": "123 Main St",
      "aptUnit": "",
      "city": "Springfield",
      "state": "IL",
      "zipCode": "62704",
      "useCurrentLocation": false
    },
    "householdSize": 4,
    "ada": { "hasRequirement": false, "selectedOptions": [], "otherDetails": "" },
    "medical": { "hasRequirement": true, "selectedOptions": ["Diabetes"], "otherDetails": "" },
    "pets": { "hasRequirement": false, "selectedOptions": [], "otherDetails": "" },
    "transport": { "hasRequirement": false, "selectedOptions": [], "otherDetails": "" },
    "lodging": { "selectedOptions": ["Pet Friendly"], "otherDetails": "" },
    "alertLocations": [
      {
        "id": "uuid",
        "label": "Parents",
        "city": "Chicago",
        "state": "IL",
        "zipCode": "60601"
      }
    ]
  }
}
```

| Field | Notes |
|-------|--------|
| `user.profilePic` | HTTPS Cloudinary URL; **omitted** when user has no photo |
| `profile` | `null` until onboarding completes |

### Redux hydration

```typescript
// registrationSlice or profileSlice
dispatch(hydrateProfileFromApi({ user, profile }));
```

Map `profile` fields 1:1 to onboarding `ProfilePayload` in `src/types/registration.ts`.

| `profile === null` | Navigate to onboarding, not Profile edits |
| `profileComplete === false` | Same |

---

## 4. `PATCH /users/me` — account fields

**Screen:** `EditProfileScreen` (account section only)

### Body (all optional, at least one required)

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "email": "user@example.com",
  "phone": "+15551234567"
}
```

### Rules

| Field | Validation |
|-------|------------|
| `phone` | **E.164 required** — e.g. `+15551234567`. Plain `5551234567` or `(555) 123-4567` returns `400`. Normalize on the client before send. Send `""` to clear. |
| `email` | Valid email; future: `403 EMAIL_CHANGE_PENDING` if re-verify added |

### Common 400 causes

| Request | Error |
|---------|--------|
| `{ "phoneNumber": "+1..." }` | Wrong key — use `phone`, not `phoneNumber` |
| `{ "phone": "5551234567" }` | Missing `+` and country code |
| `{}` | `At least one field is required` |

### Response

```json
{ "user": { /* ApiUser */ } }
```

### UI flow

1. User edits first/last name, email, phone  
2. Normalize phone to E.164 (e.g. US: prepend `+1` to 10-digit number)  
3. Save → `PATCH /users/me`  
4. On success → `dispatch(setUser(response.user))`  
5. Toast “Account updated”

**Do not** send emergency profile fields or profile photo on this endpoint.

---

## 5. Profile photo — `POST` / `DELETE /users/me/avatar`

Same Cloudinary flow as the web app (`/api/upload` → save `profilePic` on user). Mobile combines upload + DB save in one authenticated call.

### Upload — `POST /users/me/avatar`

| Item | Value |
|------|--------|
| Content-Type | `multipart/form-data` |
| Field name | `file` |
| Allowed types | `image/jpeg`, `image/png`, `image/webp` |
| Max size | **2 MB** |
| Cloudinary folder | `earthquick/profiles` |

**Response `200`:**

```json
{
  "message": "Profile photo updated",
  "user": {
    "id": "...",
    "firstName": "John",
    "lastName": "Smith",
    "email": "user@example.com",
    "profilePic": "https://res.cloudinary.com/.../earthquick/profiles/xyz.jpg",
    "emailVerified": true,
    "profileComplete": true
  }
}
```

**Errors:**

| HTTP | Code | Cause |
|------|------|--------|
| 400 | `VALIDATION_ERROR` | Missing `file` field |
| 413 | `FILE_TOO_LARGE` | Over 2 MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Not JPEG/PNG/WebP |

Replacing a photo deletes the previous Cloudinary asset automatically.

### Remove — `DELETE /users/me/avatar`

No body. Clears `profilePic` and removes the Cloudinary asset.

**Response `200`:**

```json
{
  "message": "Profile photo removed",
  "user": { /* ApiUser without profilePic */ }
}
```

### React Native upload example

```typescript
import * as ImagePicker from 'expo-image-picker';

export async function uploadProfileAvatar(token: string, uri: string, mimeType: string) {
  const form = new FormData();
  form.append('file', {
    uri,
    name: 'avatar.jpg',
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(`${API_BASE}/users/me/avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // Do NOT set Content-Type — let fetch set multipart boundary
    },
    body: form,
  });

  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ message: string; user: ApiUser }>;
}
```

### UI flow (mirror web settings)

1. User taps avatar → `ImagePicker.launchImageLibraryAsync` (or camera)  
2. Validate type + size client-side (2 MB)  
3. `POST /users/me/avatar` with `FormData`  
4. On success → `dispatch(setUser(response.user))` — show `user.profilePic`  
5. Remove photo → `DELETE /users/me/avatar` → clear avatar in UI  

**Do not** use `PATCH /users/me` for photos.

---

## 6. `PATCH /profile` — emergency profile

**Screen:** `EditProfileScreen` (address, household, ADA, medical, pets, transport, lodging)

### Body

Partial `ProfilePayload` — only keys you changed:

```json
{
  "address": {
    "streetAddress": "123 Main St",
    "city": "Springfield",
    "state": "IL",
    "zipCode": "62704",
    "useCurrentLocation": false
  },
  "householdSize": 4
}
```

Validation rules: same option strings as `POST /profile/complete` (see [mobile-api-v1.md](./mobile-api-v1.md)).

### Response

```json
{
  "message": "Profile updated",
  "profile": { /* full ProfilePayload */ }
}
```

### Errors

| Code | HTTP | UX |
|------|------|-----|
| `PROFILE_INCOMPLETE` | 403 | Redirect to onboarding |
| `VALIDATION_ERROR` | 400 | Show field errors from `errors[]` |

### UI flow

1. User edits sections (same forms as onboarding)  
2. Save → `PATCH /profile` with changed sections only  
3. On success → `dispatch(hydrateProfileFromApi({ profile: response.profile }))`  
4. Optional: refresh [Home](./mobile-integration-home-tab.md) / [Alerts](./mobile-integration-alerts-tab.md) — address change affects alerts

### Split save button strategy

| Approach | Calls |
|----------|--------|
| Single Save | `PATCH /users/me` then `PATCH /profile` if both changed |
| Two sections | Account save → users/me; Emergency save → profile |
| Photo only | `POST /users/me/avatar` (no other save needed) |

---

## 7. `PUT /profile/alert-locations`

**Screen:** `AlertLocationsEditor` (Profile tab)

### Body

Replaces **entire** list (not merge):

```json
{
  "alertLocations": [
    {
      "id": "existing-uuid",
      "label": "Parents",
      "city": "Chicago",
      "state": "IL",
      "zipCode": "60601"
    },
    {
      "label": "Work",
      "city": "St Louis",
      "state": "MO",
      "zipCode": "63101"
    }
  ]
}
```

| Rule | Detail |
|------|--------|
| Max | 5 locations → `400 LOCATION_LIMIT_EXCEEDED` |
| New row | Omit `id` → server generates UUID |
| Delete | Omit row from array |

### Response

```json
{
  "alertLocations": [ /* normalized with ids */ ]
}
```

### UI flow

| Pattern | When to call API |
|---------|------------------|
| Explicit Save | User taps Save → `PUT` full list |
| Debounced (advanced) | 500ms after last edit (watch for race conditions) |

On success → update `registrationSlice.profile.alertLocations` → prompt user to refresh Alerts or auto `fetchAlerts`.

**Impact:** [Alerts tab](./mobile-integration-alerts-tab.md) uses these zones for NWS/community matching.

---

## 8. Onboarding vs Profile (critical)

| Flow | Endpoint |
|------|----------|
| Steps 1–6 | Local Redux only |
| Step 7 Finish | `POST /profile/complete` with **full** profile |
| Profile tab edits | `PATCH /profile` / `PATCH /users/me` / avatar endpoints |

Never POST complete from Profile — it re-validates all required sections.

---

## 9. TypeScript types (app)

```typescript
export type ApiUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profilePic?: string;
  emailVerified: boolean;
  profileComplete: boolean;
};

export type AlertLocation = {
  id: string;
  label: string;
  city: string;
  state: string;
  zipCode: string;
};

export type ProfilePayload = {
  address: { /* ... */ };
  householdSize: number;
  ada: RequirementSection;
  medical: RequirementSection;
  pets: RequirementSection;
  transport: RequirementSection;
  lodging: LodgingSection;
  alertLocations?: AlertLocation[];
};

export type UsersMeResponse = {
  user: ApiUser;
  profile: ProfilePayload | null;
};
```

### Phone normalization helper (client)

```typescript
/** US-focused; extend for international as needed */
export function toE164Phone(input: string, defaultCountry = 'US'): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (defaultCountry === 'US') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  }
  if (input.startsWith('+') && /^\+[1-9]\d{6,14}$/.test(input.replace(/\s/g, ''))) {
    return input.replace(/\s/g, '');
  }
  return null;
}
```

---

## 10. Service layer

**File:** `src/services/profile.service.ts`

```typescript
export async function getMe(token: string) {
  return apiV1<UsersMeResponse>('/users/me', { token });
}

export async function patchUser(
  token: string,
  body: Partial<Pick<ApiUser, 'firstName' | 'lastName' | 'email' | 'phone'>>,
) {
  return apiV1<{ user: ApiUser }>('/users/me', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function uploadAvatar(token: string, formData: FormData) {
  return apiV1<{ message: string; user: ApiUser }>('/users/me/avatar', {
    method: 'POST',
    token,
    body: formData,
    json: false,
  });
}

export async function removeAvatar(token: string) {
  return apiV1<{ message: string; user: ApiUser }>('/users/me/avatar', {
    method: 'DELETE',
    token,
  });
}

export async function patchProfile(token: string, body: Partial<ProfilePayload>) {
  return apiV1<{ message: string; profile: ProfilePayload }>('/profile', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function putAlertLocations(
  token: string,
  alertLocations: AlertLocation[],
) {
  return apiV1<{ alertLocations: AlertLocation[] }>('/profile/alert-locations', {
    method: 'PUT',
    token,
    body: JSON.stringify({ alertLocations }),
  });
}
```

---

## 11. Screen → API matrix

| Screen / component | Read | Write |
|--------------------|------|-------|
| `ProfileScreen` | `GET /users/me` | — |
| Avatar display | `user.profilePic` | — |
| Display name, email, phone | `user` | — |
| Display address summary | `profile.address` | — |
| Alert locations list | `profile.alertLocations` | — |
| `EditProfileScreen` | Pre-fill from Redux | `PATCH /users/me` + `PATCH /profile` |
| Avatar picker | `user.profilePic` | `POST /users/me/avatar`, `DELETE /users/me/avatar` |
| `AlertLocationsEditor` | `profile.alertLocations` | `PUT /profile/alert-locations` |
| Onboarding step 7 | — | `POST /profile/complete` only |

---

## 12. Error handling

| Situation | UX |
|-----------|-----|
| `PROFILE_INCOMPLETE` on PATCH | Block edit → onboarding |
| `LOCATION_LIMIT_EXCEEDED` | “Maximum 5 locations” |
| `VALIDATION_ERROR` on phone | “Use international format, e.g. +15551234567” |
| `FILE_TOO_LARGE` | “Photo must be 2 MB or smaller” |
| `UNSUPPORTED_MEDIA_TYPE` | “Use PNG, JPG, or WebP” |
| `VALIDATION_ERROR` (other) | Inline field messages from `errors[]` |
| Network fail | Retry on Save |

---

## 13. Testing checklist

- [ ] `GET /users/me` after complete onboarding returns full `profile` + `alertLocations`
- [ ] `user.profilePic` present when photo uploaded; omitted when removed
- [ ] `POST /users/me/avatar` with JPEG under 2 MB returns updated `user.profilePic`
- [ ] `DELETE /users/me/avatar` clears photo from subsequent `GET /users/me`
- [ ] PATCH phone with E.164 (`+15551234567`) persists; bare digits return 400
- [ ] PATCH name persists after restart
- [ ] PATCH address changes Home weather / alerts after refresh
- [ ] PUT 6 locations returns 400
- [ ] New location without `id` returns server `id`
- [ ] Profile tab blocked when `profile` is null

---

## 14. Implementation order

1. `getMe` on Profile focus + hydrate Redux  
2. Avatar: picker → `POST /users/me/avatar` / `DELETE /users/me/avatar`  
3. `EditProfileScreen` → `patchUser` (E.164 phone) + `patchProfile`  
4. `AlertLocationsEditor` → `putAlertLocations`  
5. Refresh alerts/home after address or locations change  
