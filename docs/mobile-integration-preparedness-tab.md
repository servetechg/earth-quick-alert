# Mobile integration plan — Preparedness tab

**Audience:** React Native app (`PreparednessScreen`, `PreparednessCategoryScreen`, Home preparedness preview)  
**Backend:** `/api/v1/preparedness/*` (implemented — **jurisdiction-scoped**)  
**Related:** [mobile-api-v1-dashboard.md](./mobile-api-v1-dashboard.md), [Home tab](./mobile-integration-home-tab.md), [Profile tab](./mobile-integration-profile-tab.md)

---

## 1. Goal

Replace static `PREPAREDNESS_CATEGORIES` and `getPreparednessTasksForCategory()` from `constants/preparedness.ts` with **local sub-admin preparedness** from MongoDB (`PreparednessGuide` + `SubAdminTask`).

Citizens only see guides/tasks from the **sub-admin whose state matches their profile address and whose license radius contains their geocoded home location** — same jurisdiction concept as the admin situational map.

Read-only in v1 — no per-user task completion API.

---

## 2. Prerequisites

| Requirement | Why |
|-------------|-----|
| Bearer `accessToken` | Routes require mobile citizen auth |
| **`profileComplete` + home address** | Server geocodes `profile.address` to resolve sub-admin jurisdiction |
| Sub-admin has **`SubAdminTask`** rows | Empty list if matching sub-admin has not published tasks |
| Sub-admin **state + license radius** | Must cover the citizen’s address (see §3) |

Home preview uses the same scoped list via `GET /dashboard/home` → `preparednessCategories` (top 4).

---

## 3. Jurisdiction scoping (how the backend decides)

On every preparedness request, the server:

1. Loads the citizen’s **`UserProfile.address`** (street, city, state, ZIP).
2. **Geocodes** the address to lat/lng.
3. Normalizes profile **state** to USPS (e.g. `Arizona` → `AZ`).
4. Finds all **`role: sub-admin`** users whose **state matches** the citizen’s state.
5. For each candidate, loads their **license radius** (`License.radiusMile`, center from billing address or sub-admin city).
6. Keeps sub-admins where the citizen’s coordinates fall **inside the radius** (`coordinatesInJurisdiction`).
7. If **multiple** sub-admins match, picks the one **closest** to the license center.
8. Returns **`SubAdminTask`** rows for that sub-admin only (active, not deleted).

### Example

| Citizen | Sub-admin | Result |
|---------|-----------|--------|
| Grand Canyon National Park, **AZ** | Arizona sub-admin, radius covers Grand Canyon | ✅ That sub-admin’s categories + tasks |
| Austin, **TX** | Only Arizona sub-admin exists | ❌ Empty list (`items: []`) |
| AZ address but **outside** all AZ license radii | — | ❌ Empty list |

### Empty list UX

| Cause | App message |
|-------|-------------|
| Profile incomplete | Redirect to onboarding ([Profile tab](./mobile-integration-profile-tab.md)) |
| No sub-admin covers address | “No local preparedness guides available for your area yet.” |
| Sub-admin has no tasks | Same empty state |

**Not used for mobile v1:** global super-admin `Task` catalog, or `UserTask` send/assignment flow (web-only broadcast model).

---

## 4. APIs

| Method | Path | Screen |
|--------|------|--------|
| GET | `/preparedness/categories` | `PreparednessScreen` grid |
| GET | `/preparedness/categories/:categoryId` | Optional header / intro |
| GET | `/preparedness/categories/:categoryId/tasks` | `PreparednessCategoryScreen` task list |

All routes use the **authenticated citizen’s** profile for jurisdiction — no extra query params.

### `GET /preparedness/categories`

**Query:** `q` (optional) — search title/subtitle (client-side filter also fine on cached list)

**Response:**

```json
{
  "items": [
    {
      "id": "active-shooter",
      "title": "Active Shooter Preparedness",
      "subtitle": "Emergency guidance for active shooter events",
      "icon": "flame",
      "taskCount": 6,
      "sortOrder": 1
    }
  ]
}
```

| Field | Notes |
|-------|--------|
| `id` | Slug from guide `category` — use in navigation |
| `icon` | String key for app icon map (`flame`, `earth`, `water`, `storm`, `shield`) |
| `taskCount` | Active **sub-admin** tasks in that category |
| `sortOrder` | Display order from `PreparednessGuide.order` |

Categories with **zero** local tasks are omitted.

### `GET /preparedness/categories/:categoryId`

**Response:**

```json
{
  "id": "active-shooter",
  "title": "Active Shooter Preparedness",
  "subtitle": "...",
  "icon": "flame",
  "intro": "Review local preparedness tasks for Active Shooter in your area."
}
```

404 if unknown category **or** category not available in the citizen’s jurisdiction.

### `GET /preparedness/categories/:categoryId/tasks`

**Response:**

```json
{
  "categoryId": "active-shooter",
  "items": [
    {
      "id": "subAdminTaskMongoId",
      "categoryId": "active-shooter",
      "title": "Know your exits",
      "body": "Complete this step: Know your exits.",
      "sortOrder": 1
    }
  ]
}
```

| Field | UI |
|-------|-----|
| `id` | **`SubAdminTask`** id (not global super-admin `Task` id) |
| `title` | Task row title |
| `body` | Expanded content (templated in v1; rich CMS later) |
| `sortOrder` | List order |

---

## 5. UI mapping

### `PreparednessScreen`

| Before (constants) | After (API) |
|--------------------|-------------|
| `PREPAREDNESS_CATEGORIES.map` | `items` from `GET /categories` |
| Local search filter | `q` query param OR client filter on cached list |
| Icon from constant | `iconMap[item.icon]` → Ionicons / custom |

```typescript
const ICON_MAP: Record<string, string> = {
  flame: 'flame-outline',
  earth: 'globe-outline',
  water: 'water-outline',
  storm: 'thunderstorm-outline',
  shield: 'shield-outline',
};
```

Navigation:

```typescript
navigation.navigate('PreparednessCategory', { categoryId: item.id });
```

**Empty state:** if `items.length === 0`, check `user.profileComplete` → onboarding vs “no local guides”.

### `PreparednessCategoryScreen`

| Before | After |
|--------|-------|
| `getPreparednessTasksForCategory(id)` | `GET /categories/:categoryId/tasks` |
| Static task bodies | `item.body` from API |

Optional: fetch category meta first for header:

```typescript
const [meta, tasks] = await Promise.all([
  getCategory(token, categoryId),
  getTasks(token, categoryId),
]);
```

### Home preparedness preview

Use `home.preparednessCategories` from [Home tab](./mobile-integration-home-tab.md) — same jurisdiction-scoped cards; “See all” → Preparedness tab full list.

**After address change:** refresh Home + Preparedness (new sub-admin scope).

---

## 6. TypeScript types (app)

**File:** `src/types/preparedness.ts`

```typescript
export type PreparednessCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  taskCount: number;
  sortOrder: number;
};

export type PreparednessCategoryDetail = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  intro: string;
};

export type PreparednessTask = {
  id: string;
  categoryId: string;
  title: string;
  body: string;
  sortOrder: number;
};

export type CategoriesResponse = { items: PreparednessCategory[] };
export type TasksResponse = { categoryId: string; items: PreparednessTask[] };
```

---

## 7. Service layer

**File:** `src/services/preparedness.service.ts`

```typescript
export async function getCategories(token: string, q?: string) {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiV1<CategoriesResponse>(`/preparedness/categories${params}`, { token });
}

export async function getCategory(token: string, categoryId: string) {
  return apiV1<PreparednessCategoryDetail>(
    `/preparedness/categories/${encodeURIComponent(categoryId)}`,
    { token },
  );
}

export async function getTasks(token: string, categoryId: string) {
  return apiV1<TasksResponse>(
    `/preparedness/categories/${encodeURIComponent(categoryId)}/tasks`,
    { token },
  );
}
```

---

## 8. Redux / state

**Slice:** `preparednessSlice` (optional — can use local screen state)

| State | Description |
|-------|-------------|
| `categories` | Jurisdiction-scoped list |
| `tasksByCategoryId` | Cache `Record<string, PreparednessTask[]>` |
| `loading`, `error` | UI |

**Thunks:**

- `fetchCategories(q?)` — on Preparedness tab focus **and after profile address update**
- `fetchTasks(categoryId)` — on category screen mount

**Caching:** Keep `tasksByCategoryId[categoryId]` for back navigation; **invalidate on pull-to-refresh or profile address change**.

---

## 9. Search

| Approach | Implementation |
|----------|----------------|
| Server | `GET /preparedness/categories?q=shooter` |
| Client | Filter cached `categories` |

Search only applies within **already-scoped** local categories.

---

## 10. Error handling

| HTTP | UX |
|------|-----|
| 404 category | “Guide not found in your area” + go back |
| Empty `items` | See §3 empty list UX |
| 401 | Re-auth |

---

## 11. Admin content dependency

| Role | Creates |
|------|---------|
| Super-admin | Global `Task` templates → can push to sub-admins (web) |
| Sub-admin | **`SubAdminTask`** per category (web Preparedness Information) |

Mobile citizens see **`SubAdminTask`** for the sub-admin covering their address — not the raw super-admin catalog.

If mobile shows empty:

1. Confirm citizen **profile address + state** is complete.
2. Confirm a **sub-admin** exists for that state with license radius covering the address.
3. Confirm sub-admin has active **`SubAdminTask`** rows.

---

## 12. v1.1 (out of scope)

| Feature | Notes |
|---------|--------|
| Checklist progress | `GET /preparedness/progress`, `PATCH /tasks/:id` |
| Rich HTML intros | Extend category detail response |
| `UserTask` sent copies | Optional merge with jurisdiction catalog |

---

## 13. Testing checklist

- [ ] User in AZ inside sub-admin radius sees that sub-admin’s categories only
- [ ] User in different state sees empty list (or different sub-admin after move)
- [ ] User outside all radii (same state) sees empty list
- [ ] `profileComplete === false` → onboarding, not empty preparedness message
- [ ] Categories list matches sub-admin CMS task counts
- [ ] `categoryId` in URL matches list `id` (slug)
- [ ] Tasks load for each visible category
- [ ] `q` search returns filtered list within scope
- [ ] Home preview IDs navigate to same category screen
- [ ] PATCH profile address → refresh changes preparedness scope

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/v1/preparedness/categories
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/v1/preparedness/categories/active-shooter/tasks
```

---

## 14. Implementation order

1. Types + `preparedness.service.ts`
2. Ensure profile/onboarding saves address before Preparedness tab
3. `PreparednessScreen` ← `getCategories` + empty states
4. `PreparednessCategoryScreen` ← `getTasks` (+ optional `getCategory`)
5. Remove `constants/preparedness.ts` usage
6. Refresh preparedness after profile address change
7. Align Home preview cards with same `categoryId` navigation
