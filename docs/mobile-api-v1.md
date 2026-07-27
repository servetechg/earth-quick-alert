# Ready2Go Mobile API v1 — Integration Guide

This document describes the REST API for the **React Native citizen app** (signup, OTP, onboarding, profile). It is separate from the web admin portal APIs (`/api/login`, `/api/signup`, etc.).

**Dashboard APIs (implemented):** [mobile-api-v1-dashboard.md](./mobile-api-v1-dashboard.md)

**App integration by tab:**

- [Home](./mobile-integration-home-tab.md)
- [Alerts](./mobile-integration-alerts-tab.md)
- [Profile](./mobile-integration-profile-tab.md)
- [Preparedness](./mobile-integration-preparedness-tab.md)

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://earthquickalert.vercel.app/api/v1` |
| Local dev | `http://localhost:3000/api/v1` |

All paths below are relative to `/api/v1`.

**Content-Type:** `application/json` for request bodies.

---

## Authentication

### Protected routes

Send the access token on every protected request:

```http
Authorization: Bearer <accessToken>
```

### Tokens

| Token | Lifetime (default) | Storage (app) |
|-------|-------------------|-------------|
| `accessToken` | 7 days (`MOBILE_ACCESS_TOKEN_TTL`) | Secure storage (e.g. Keychain / EncryptedStorage) |
| `refreshToken` | 90 days (`MOBILE_REFRESH_TOKEN_DAYS`) | Same secure storage |

When `accessToken` expires, call `POST /auth/refresh` with `refreshToken`. Refresh **rotates** the refresh token — save the new one from the response.

### Standard auth response

Returned by signup, login, and OTP verify (email verification):

```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "emailVerified": false,
    "profileComplete": false
  },
  "accessToken": "eyJhbG...",
  "refreshToken": "a1b2c3..."
}
```

### Error response

```json
{
  "message": "Human-readable message",
  "code": "OPTIONAL_CODE",
  "errors": [
    { "field": "zipCode", "message": "zipCode must be 12345 or 12345-6789" }
  ]
}
```

| HTTP | Typical `code` | When |
|------|----------------|------|
| 400 | `VALIDATION_ERROR` | Invalid body; see `errors[]` |
| 401 | `UNAUTHORIZED` / `INVALID_CREDENTIALS` / `INVALID_REFRESH_TOKEN` | Bad/missing token or login |
| 403 | `EMAIL_NOT_VERIFIED` | Login before OTP verify, or profile complete before OTP |
| 409 | `EMAIL_EXISTS` | Signup email taken |
| 429 | `OTP_LOCKED` / `OTP_RATE_LIMIT` | Too many OTP attempts/sends |

---

## App navigation logic

Use `GET /users/me` on cold start (if tokens exist), after signup, or after login:

```
if (!accessToken) → Login / Signup
else if (!user.emailVerified) → OTP screen
else if (!user.profileComplete) → Onboarding (steps 1–7 in Redux)
else → Main dashboard
```

**Login without OTP:** `POST /auth/login` returns `403` `EMAIL_NOT_VERIFIED` until OTP verify succeeds. Signup still returns tokens so the app can go straight to OTP; if the user skips OTP and tries login later, send them back to OTP using the error code above.

**Onboarding:** Steps 1–6 only update local Redux. Step 7 “Finish” calls `POST /profile/complete` once with the full profile object.

---

## Endpoints

### Health (optional)

**`GET /health`** — No auth.

```json
{ "status": "ok", "service": "ready2go-api-v1" }
```

---

### 1. Sign up

**`POST /auth/signup`** — No auth.

Creates a **citizen** account (`role: user`), sends a 6-digit OTP email, returns tokens.

**Request**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "password": "secret12"
}
```

| Field | Rules |
|-------|--------|
| firstName | Required, min 1 char |
| lastName | Required, min 1 char |
| email | Valid email |
| password | Min 6 characters |

**Response:** `201` — Auth response (`emailVerified: false`, `profileComplete: false`).

**Errors:** `409` `EMAIL_EXISTS`, `400` validation.

---

### 2. Log in

**`POST /auth/login`** — No auth.

**Request**

```json
{
  "email": "jane@example.com",
  "password": "secret12"
}
```

**Response:** `200` — Auth response with current `emailVerified` / `profileComplete` flags. Only returned when `emailVerified` is `true`.

**Errors:**

| Status | `code` | When |
|--------|--------|------|
| `401` | `INVALID_CREDENTIALS` | Wrong email or password |
| `403` | `EMAIL_NOT_VERIFIED` | Correct password but signup OTP not completed yet |

Example (`403`):

```json
{
  "message": "Please verify your account before signing in.",
  "code": "EMAIL_NOT_VERIFIED"
}
```

**React Native:** On `EMAIL_NOT_VERIFIED`, navigate to the OTP screen and call `POST /auth/otp/send` with `purpose: "EMAIL_VERIFICATION"`.

> Only accounts with role `user` (mobile signups) can log in via v1. Admin/responder accounts use the web portal.

---

### 3. Forgot password

**`POST /auth/forgot-password`** — No auth.

**Request**

```json
{ "email": "jane@example.com" }
```

**Response:** `200` (always, to avoid email enumeration)

```json
{
  "message": "If an account exists, we sent instructions to your email."
}
```

Sends OTP with purpose `PASSWORD_RESET` when a mobile account exists.

---

### 4. Resend OTP

**`POST /auth/otp/send`** — No auth (optional Bearer ignored).

**Request**

```json
{
  "email": "jane@example.com",
  "purpose": "EMAIL_VERIFICATION"
}
```

| `purpose` | Use |
|-----------|-----|
| `EMAIL_VERIFICATION` | After signup |
| `PASSWORD_RESET` | After forgot password |

**Response:** `200`

```json
{
  "message": "Code sent",
  "expiresInSeconds": 600
}
```

- 6-digit code, **10 minutes** expiry.
- Rate limit: **3 sends per email per 15 minutes**.
- **Errors:** `429` `OTP_LOCKED`, `OTP_RATE_LIMIT`.

In development without SMTP, the code is printed in the **server console** (not in the API response).

---

### 5. Verify OTP

**`POST /auth/otp/verify`** — No auth.

**Request**

```json
{
  "email": "jane@example.com",
  "code": "123456",
  "purpose": "EMAIL_VERIFICATION"
}
```

| `purpose` | Success response |
|-----------|------------------|
| `EMAIL_VERIFICATION` | Auth response; `user.emailVerified: true` |
| `PASSWORD_RESET` | `{ "resetToken": "...", "expiresInSeconds": 900 }` |

**Errors:** `400` `INVALID_OTP`, `429` `OTP_LOCKED`.

---

### 6. Reset password

**`POST /auth/reset-password`** — No auth.

Use after OTP verify with `PASSWORD_RESET`.

**Request**

```json
{
  "resetToken": "token-from-otp-verify",
  "password": "newpass6",
  "confirmPassword": "newpass6"
}
```

**Response:** `200`

```json
{ "message": "Password updated successfully" }
```

Revokes existing refresh tokens. User should log in again (or you call login).

---

### 7. Change password (logged in)

**`POST /auth/change-password`** — **Bearer required**

**Request**

```json
{
  "currentPassword": "secret12",
  "newPassword": "newpass6",
  "confirmPassword": "newpass6"
}
```

**Response:** `200` `{ "message": "Password updated" }`

**Errors:** `401` wrong current password. Revokes all refresh tokens.

---

### 8. Refresh access token

**`POST /auth/refresh`** — No Bearer (uses body).

**Request**

```json
{ "refreshToken": "..." }
```

**Response:** `200`

```json
{
  "accessToken": "new-jwt",
  "refreshToken": "new-refresh-token"
}
```

Always persist the **new** `refreshToken`. Old refresh token is invalidated.

**Errors:** `401` `INVALID_REFRESH_TOKEN`.

---

### 9. Log out

**`POST /auth/logout`** — **Bearer required**

**Request (optional)**

```json
{ "refreshToken": "..." }
```

If `refreshToken` is sent, only that session is revoked. If omitted, **all** refresh tokens for the user are revoked.

**Response:** `200` `{ "message": "Logged out" }`

Clear tokens locally after success.

---

### 10. Current user + profile

**`GET /users/me`** — **Bearer required**

**Response:** `200`

```json
{
  "user": {
    "id": "...",
    "email": "...",
    "firstName": "...",
    "lastName": "...",
    "phone": "+15551234567",
    "profilePic": "https://res.cloudinary.com/.../earthquick/profiles/abc.jpg",
    "emailVerified": true,
    "profileComplete": false
  },
  "profile": null
}
```

When onboarding was completed, `profile` matches the structure saved by `profile/complete` (see below). Otherwise `profile` is `null`.

`profilePic` and `phone` are omitted when not set.

---

### 10b. Profile photo

**`POST /users/me/avatar`** — **Bearer required**

| Item | Value |
|------|--------|
| Body | `multipart/form-data`, field `file` |
| Types | `image/jpeg`, `image/png`, `image/webp` |
| Max size | 2 MB |

**Response `200`:** `{ "message": "Profile photo updated", "user": { /* ApiUser with profilePic */ } }`

**`DELETE /users/me/avatar`** — **Bearer required**

**Response `200`:** `{ "message": "Profile photo removed", "user": { /* ApiUser */ } }`

See [mobile-integration-profile-tab.md](./mobile-integration-profile-tab.md) for React Native `FormData` example.

---

### 11. Complete profile (8-step onboarding — single submit)

**`POST /profile/complete`** — **Bearer required**

Requires `user.emailVerified === true`.

Onboarding is **8 steps** in the app (address → alert locations → household → … → lodging), but the backend still receives **one** payload on the last step. See [mobile-api-v1-profile-complete-onboarding.md](./mobile-api-v1-profile-complete-onboarding.md) for frontend integration details.

**Request**

```json
{
  "profile": {
    "address": {
      "streetAddress": "123 Main St",
      "aptUnit": "4B",
      "city": "Austin",
      "state": "TX",
      "zipCode": "78701",
      "useCurrentLocation": false
    },
    "alertLocations": [
      {
        "id": "loc-optional-client-id",
        "label": "Parents",
        "city": "Chicago",
        "state": "IL",
        "zipCode": "60601"
      }
    ],
    "householdSize": 3,
    "ada": {
      "hasRequirement": false,
      "selectedOptions": [],
      "otherDetails": ""
    },
    "medical": {
      "hasRequirement": true,
      "selectedOptions": ["Diabetes"],
      "otherDetails": ""
    },
    "pets": {
      "hasRequirement": true,
      "selectedOptions": ["Dog(s)"],
      "otherDetails": ""
    },
    "transport": {
      "hasRequirement": false,
      "selectedOptions": [],
      "otherDetails": ""
    },
    "lodging": {
      "selectedOptions": ["Pet Friendly", "Ground Floor"],
      "otherDetails": ""
    }
  }
}
```

**Do not send** client-only fields: `currentStep`, `isStarted`, `needsAccount`, `isComplete`.

#### Validation rules

| Section | Rules |
|---------|--------|
| **address** | `streetAddress`, `city`, `state` required; `zipCode` = `12345` or `12345-6789`; `useCurrentLocation` boolean (stored; no GPS coords yet) |
| **alertLocations** | Optional; max 5; `label`, `city`, `state` required; `zipCode` optional; no street address; server replaces `id` with UUID |
| **householdSize** | Integer 1–50 |
| **ada / medical / pets / transport** | `hasRequirement` required (boolean, not null). If `true`: `selectedOptions` min 1; if `"Other"` selected → `otherDetails` required |
| **lodging** | `selectedOptions` min 1; if `"Other"` → `otherDetails` required |

#### Allowed option strings (must match exactly)

**ADA:** `Mobility (Wheelchair, Walker)`, `Hearing Impairment`, `Vision Impairment`, `Other`

**Medical:** `Diabetes`, `Respiratory Condition`, `Heart Condition`, `Dialysis`, `Medication Dependent`, `Other`

**Pets:** `Dog(s)`, `Cat(s)`, `Bird(s)`, `Livestock`, `Other`

**Transport:** `No Vehicle`, `Limited Mobility`, `Need Accessible Vehicle`, `Other`

**Lodging:** `Accessible Room (ADA)`, `Pet Friendly`, `Ground Floor`, `Two Beds`, `Other`

**Response:** `200`

```json
{
  "message": "Profile completed",
  "user": { "...": "...", "profileComplete": true },
  "profile": { /* saved profile; alertLocations ids are server UUIDs */ }
}
```

**Errors:** `400` field errors, `400` `LOCATION_LIMIT_EXCEEDED`, `401`, `403` `EMAIL_NOT_VERIFIED`.

Idempotent: calling again **updates** the full profile for the same user.

`GET /users/me` returns `profile.alertLocations` (array, may be empty) when profile is complete.

---

## Screen → API map

| App screen / action | API |
|---------------------|-----|
| Sign up | `POST /auth/signup` |
| Log in | `POST /auth/login` |
| Forgot password | `POST /auth/forgot-password` |
| OTP resend | `POST /auth/otp/send` |
| OTP submit (signup) | `POST /auth/otp/verify` (`EMAIL_VERIFICATION`) |
| OTP submit (reset) | `POST /auth/otp/verify` (`PASSWORD_RESET`) → then reset screen |
| Reset password | `POST /auth/reset-password` |
| Settings → change password | `POST /auth/change-password` |
| App launch (has tokens) | `GET /users/me` |
| Onboarding step 7 Finish | `POST /profile/complete` |
| Token expired | `POST /auth/refresh` |
| Log out | `POST /auth/logout` + clear local storage |

---

## React Native example (fetch)

```typescript
const API_BASE = __DEV__
  ? 'http://localhost:3000/api/v1'
  : 'https://earthquickalert.vercel.app/api/v1';

async function api<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw { status: res.status, ...data };
  }
  return data as T;
}

// Sign up
const signup = await api<AuthResponse>('/auth/signup', {
  method: 'POST',
  body: JSON.stringify({
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    password: 'secret12',
  }),
});
// Save signup.accessToken, signup.refreshToken securely

// Authenticated request
const me = await api<{ user: ApiUser; profile: unknown | null }>('/users/me', {
  token: signup.accessToken,
});
```

### Axios interceptor pattern (refresh)

```typescript
// On 401 from a protected route, try refresh once:
const refreshed = await api<{ accessToken: string; refreshToken: string }>(
  '/auth/refresh',
  { method: 'POST', body: JSON.stringify({ refreshToken: storedRefresh }) },
);
// Save refreshed.accessToken + refreshed.refreshToken, retry original request
```

---

## Environment (server)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs access tokens (required in production) |
| `MONGODB_URI` | Database |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | OTP emails |
| `RESPONDER_INVITE_SMTP_URL` | Alternative single SMTP URL |
| `MOBILE_ACCESS_TOKEN_TTL` | Optional, default `1h` |
| `MOBILE_REFRESH_TOKEN_DAYS` | Optional, default `30` |
| `NEXT_PUBLIC_APP_URL` | Dev origin hint for emails |

---

## TypeScript types (copy to app)

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

export type AuthResponse = {
  user: ApiUser;
  accessToken: string;
  refreshToken?: string;
};

export type ApiError = {
  message: string;
  code?: string;
  errors?: { field: string; message: string }[];
};

export type OtpPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
```

---

## Related code (backend)

### Folder layout (`lib/` — no `api-v1` package)

| Was (old) | Now |
|-----------|-----|
| `types.ts` | `lib/types/mobile-api.ts` |
| `response.ts` | `lib/api/json-response.ts` |
| `tokens.ts` | `lib/auth/mobile/tokens.ts` |
| `session.ts` | `lib/auth/mobile/session.ts` |
| `user-mapper.ts` | `lib/auth/mobile/user-mapper.ts` |
| `auth-service.ts` | `lib/services/mobile/auth-service.ts` |
| `otp-service.ts` | `lib/services/mobile/otp-service.ts` |
| `email.ts` | `lib/email/auth-otp-send.ts` |
| `validation/auth.ts` | `lib/validation/mobile/auth.ts` |
| `validation/profile.ts` | `lib/validation/mobile/profile.ts` |

| Area | Path |
|------|------|
| HTTP routes | `app/api/v1/**/route.ts` |
| Mongoose models | `models/User.ts`, `UserProfile.ts`, `AuthOtp.ts`, `AuthRefreshToken.ts`, `AuthPasswordReset.ts` |

---

## Notes

1. **Web vs mobile:** Do not call `/api/login` or `/api/signup` from the React Native app; use `/api/v1/auth/*` only.
2. **CORS:** `/api/*` allows all origins (`Access-Control-Allow-Origin: *`). Restart the Next.js dev server after pulling CORS changes. For Expo, use your machine LAN IP (not `localhost`) on a physical device.
3. **Physical device + localhost:** Use your machine’s LAN IP instead of `localhost` (e.g. `http://192.168.1.10:3000/api/v1`).
4. **OTP in dev:** Without SMTP, check the terminal running `npm run dev` for the 6-digit code.
