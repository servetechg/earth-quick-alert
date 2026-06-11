# Profile incomplete reminder (email + push)

Sends a **one-time** reminder when a Ready2Go mobile user **signed up** but **`profileComplete` is still false** after a configurable delay (default **30 minutes**).

| Channel | Where it runs |
|---------|----------------|
| **Email** | Backend cron (`earthquickalert`) |
| **Remote push** | Backend cron → Expo Push API (requires device token) |
| **Local push** | React Native app (`ready2go-app`) — scheduled on device |

---

## Environment variables

### Backend (`earthquickalert/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PROFILE_INCOMPLETE_REMINDER_MINUTES` | `30` | Production delay from `User.createdAt` |
| `PROFILE_INCOMPLETE_REMINDER_SECONDS` | — | **Overrides minutes** when set (use `60` for testing) |
| `CRON_SECRET` | — | Required in production to call the cron route |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | — | Email delivery (or `RESPONDER_INVITE_SMTP_URL`) |

### Mobile (`ready2go-app/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXPO_PUBLIC_PROFILE_REMINDER_SECONDS` | `1800` | Local notification delay from signup (`60` for testing) |

---

## API

| Method | Path | Auth |
|--------|------|------|
| `GET` / `POST` | `/api/v1/cron/profile-incomplete-reminders` | `CRON_SECRET` (Bearer, `x-cron-secret`, or `?secret=`) |
| `PUT` | `/api/v1/users/me/push-token` | Bearer — body `{ "expoPushToken": "ExponentPushToken[...]" }` |
| `DELETE` | `/api/v1/users/me/push-token` | Bearer — clears token on logout |

**Cron response example:**

```json
{
  "message": "Profile incomplete reminders processed",
  "delay": "60 seconds",
  "scanned": 1,
  "emailed": 1,
  "pushed": 1,
  "skipped": 0,
  "errors": 0
}
```

---

## Testing steps

### 1. Fast timing (recommended for dev)

**Backend** — add to `earthquickalert/.env`:

```env
PROFILE_INCOMPLETE_REMINDER_SECONDS=60
CRON_SECRET=local-dev-secret
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@yourdomain.com
```

**Mobile** — add to `ready2go-app/.env`:

```env
EXPO_PUBLIC_PROFILE_REMINDER_SECONDS=60
```

Restart both servers (`npm run dev` / `npx expo start -c`).

### 2. Email + server push test

1. Start MongoDB and `earthquickalert` (`npm run dev`).
2. Sign up a **new** user in the mobile app (or API) and verify OTP.
3. **Do not** finish onboarding (stop at step 1).
4. Open the app on a **development build** (not Expo Go) so push token registration works.
5. Wait **60 seconds** (or your configured delay).
6. Trigger the cron manually:

```bash
curl -H "Authorization: Bearer local-dev-secret" \
  http://localhost:3000/api/v1/cron/profile-incomplete-reminders
```

7. Verify:
   - Terminal shows `[mobile-email]` or SMTP send for the user email.
   - Response has `"emailed": 1` (and `"pushed": 1` if token was registered).
   - MongoDB: `profileIncompleteReminderSentAt` is set on the user.
8. Run cron again — same user should **not** be emailed twice (`scanned: 0` or `skipped`).

### 3. Local push test (mobile)

1. Use a **development build** with notification permissions granted.
2. Sign up → verify OTP → leave onboarding incomplete.
3. Wait `EXPO_PUBLIC_PROFILE_REMINDER_SECONDS` from signup.
4. You should receive: **“Complete your Ready2Go profile 🚨”**
5. Complete onboarding — reminder is cancelled and should not fire again.

### 4. Negative test (profile completed in time)

1. Sign up and complete all onboarding steps within the delay window.
2. Run cron after the delay.
3. User must **not** receive email/push (`profileComplete: true`).

### 5. Production (Vercel)

Vercel **Hobby** only allows cron jobs **once per day**, so this project does **not** use `vercel.json` crons. Use an external scheduler instead (every 5 minutes is fine).

**Vercel environment variables:**

```env
PROFILE_INCOMPLETE_REMINDER_MINUTES=30
CRON_SECRET=your-long-random-secret
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@yourdomain.com
```

**External scheduler (e.g. [cron-job.org](https://cron-job.org)):**

1. Create a free account and add a cron job.
2. **URL:** `https://earthquickalert.vercel.app/api/v1/cron/profile-incomplete-reminders`
3. **Schedule:** every 5 minutes (`*/5 * * * *` or the UI equivalent).
4. **Request:** `GET` with header `Authorization: Bearer YOUR_CRON_SECRET`  
   (or `x-cron-secret: YOUR_CRON_SECRET`).
5. Save and run once manually; expect JSON with `"message": "Profile incomplete reminders processed"`.

**Alternatives:** GitHub Actions `schedule`, Upstash QStash, or any uptime/cron service that can send an authenticated HTTP GET.

**Vercel Pro:** you may re-add a `crons` entry in `vercel.json` with `*/5 * * * *` if you prefer built-in scheduling.

---

## Notes

- Reminder is sent **once per user** (`profileIncompleteReminderSentAt`).
- Timing is based on **`User.createdAt`** (signup), not last onboarding step.
- **Expo Go** does not support push; use `eas build --profile development` for push testing.
- Without SMTP, dev logs print the email body to the server console.
