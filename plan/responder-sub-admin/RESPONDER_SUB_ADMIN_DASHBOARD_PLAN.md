# Responder sub-admin dashboards — detailed plan

This document describes how to add **Responder** accounts that behave like **vertical-specific sub-admins**: each responder sees **only their own sidebar and pages** (e.g. hospital vs police vs hotel), can **update operational data** allowed for that vertical, and uses **mock APIs now** with a clear path to **real state/agency integrations** later.

It aligns with your four roles: **Super Admin**, **Sub-Admin**, **Responder**, **User**, and with the stakeholder matrix from your requirements screenshot.

---

## 1. Goals

1. **One `responder` role in the database**, not a separate Mongo role per industry — discrimination via **`responderVertical`** (and optional **`responderFunction`** / org name for display).
2. **Dedicated responder layout**: sidebar and home route differ by vertical; responders do **not** see the full admin sidebar.
3. **Write access only where the vertical allows** (e.g. hospital updates bed counts; police updates patrol/staging; hotel updates shelter availability).
4. **Mock data layer** behind small **JSON-shaped API routes** so swapping implementations later does not rewrite the UI.
5. **Middleware** continues to restrict responders to an allowlist; new vertical-specific routes are added to that list as you build them.

---

## 2. Terminology

| Term | Meaning |
|------|---------|
| **Responder** | User with `role: 'responder'`. |
| **Responder “sub-admin”** (product language) | Same technical role; implies **elevated operational authority within one vertical**, not membership in `sub-admin` role. |
| **Vertical** | Value of `user.responderVertical` (e.g. `hospital`, `police`, `hotel`). |
| **User (public)** | `role: 'user'` — citizen-facing flows; no responder sidebar. |

---

## 3. Mapping: screenshot / stakeholders → verticals

Your matrix is mapped into **implementable verticals** (extend as needed).

| Stakeholder / function (from spec) | Suggested `responderVertical` key | Primary “what they update” | Notes for UI |
|-----------------------------------|-----------------------------------|----------------------------|--------------|
| Dept of Public Health / Hospitals | `hospital` | Hospital capacity, bed availability (ICU, med/surg, etc.) | Daily bed counts; later **state hospital API** |
| Police / law enforcement | `police` | Resource deployment, staging, units | Roster, beats, staging locations |
| Hotels / lodging | `hotel` | Shelter capacity, rooms, guest intake summary | Optional link to Virtual EOC lodging |
| Pharmacies | `pharmacy` | Pop-up / fixed sites, supply pushes | **GIS map** updates for sites |
| Pharmacy / medical logistics | `medical-logistics` | Resource deployment, convoy staging | Same family as pharmacy; heavier logistics UI |
| Public transportation | `transit` | Vehicles deployed, route status | Fleet count, detours |
| Energy / Gas / Electric utilities | `utility-energy`, `utility-gas`, `utility-electric` (or single `utility` + subtype field) | Outage summary, crews, vehicles, outage map | Shared **outage map** pattern; filter by commodity |
| Water company | `utility-water` | Crews, deployment, maybe boil-water flags | |
| Food / supply logistics (private) | `food-logistics` | Volunteers, **response network** dashboard | “Response network” widget |
| Broadband / cell | `telecom` | Cell / broadband outage, deployment | Optional **Dashboard B** right-column module later |
| National Guard | `national-guard` | Staging, task forces | Similar to police deployment |
| Federal government | `federal` | Staging locations | Read-heavy + limited writes |
| State emergency management | *(usually `sub-admin` or `admin`, not responder)* | Admin access | Keep as org admin unless you explicitly want a responder-class login |
| Non-profits | `nonprofit` | Disaster response network | Third-slide appendix flows → simplified “network” dashboard |
| Public officials | *no responder login by default* | View-only | **Future**: read-only role or shared dashboards |

**Demo scope (phase 1):** implement fully **hospital**, **police**, **hotel** — three clear UX patterns (clinical stats, field ops, shelter inventory).

---

## 4. Current codebase touchpoints (as of this plan)

- **`middleware.ts`**: `userRole === 'responder'` with **`responderAllowedRoutes`** and redirect away from broad admin routes. Any new responder page **must** be covered here (exact path or `startsWith` prefix).
- **`models/User.ts`**: `responderVertical`, `responderFunction`; enum should be driven by a single module e.g. **`lib/responder-verticals.ts`** (`RESPONDER_VERTICALS`, labels, `isResponderVertical`).
- **`components/sidebar.tsx`**: if role is responder, render **`ResponderSidebar`** (dedicated nav — only for responders).
- **`app/login/page.tsx`**: already branches responder to **`/responder-dashboard`** and can persist **`responderVertical`** in `localStorage` for quick client-side menu selection (server/session remains source of truth for security).

**Integrity checks to schedule during implementation:**

- Ensure **`lib/responder-verticals.ts`** exists and matches Mongoose enum (imports already reference it).
- Ensure **`components/responder-sidebar.tsx`** exists and lists **only** vertical-appropriate links.
- Align **`add-user-modal`** / **`app/api/admin/users`** so Super Admin or Sub-Admin can assign **`responderVertical`** when creating or approving responders.

---

## 5. Architecture

### 5.1 Vertical discrimination

- **Single role** `responder` + **`responderVertical`**.
- Optional **`responderFunction`** for free-text (“County Hospital”, “State Police Troop A”).
- Optional future: **`responderSubtype`** (e.g. `utility` + `electric`) if you want one route tree with tabs instead of many vertical keys.

### 5.2 Layout & navigation

- **Route group**: keep responder pages under e.g. **`app/(admin)/responder/...`** or existing **`app/(admin)/responder-*`** for clarity.
- **`ResponderSidebar`**:
  - Always: **Dashboard**, **Alerts** (if allowed), **Settings** / **Help**, **Logout**.
  - **Per vertical**: conditional items (see §7).
- **Default landing**: `/responder-dashboard` shows a **vertical-specific overview** (or redirects to `/responder/hospital`, etc., if you prefer separate home pages).

### 5.3 Data flow (mock → API)

- **`lib/services/responder/`** (or similar):
  - **`types.ts`** — shared DTOs.
  - **`mock-hospital.ts`**, **`mock-police.ts`**, **`mock-hotel.ts`** — static or randomly perturbed data.
  - **`index.ts`** — `getDashboardData(vertical)`, `updateHospitalBeds(...)`, etc.
- **API routes** (examples):
  - `GET/PUT /api/responder/hospital/capacity`
  - `GET/PUT /api/responder/hotel/availability`
  - `GET/PUT /api/responder/police/deployments`
- **Authorization**: session user must be `role === 'responder'` and `responderVertical` must match the segment (return **403** otherwise).

---

## 6. Hospital vertical (deep spec — your main example)

### 6.1 Dashboard widgets

- **Facility header**: name, address, county, last updated timestamp, data source badge (**Mock** / **State API**).
- **Capacity summary cards**: total beds, occupied, available, **ICU** breakdown (optional).
- **Trend strip** (mock): last 7 days occupied % (sparkline or simple table).
- **Bed board table**: unit or bed type × capacity × occupied × available; status (open / diversion / full).
- **Actions**: “Update counts” → inline edit or modal; **Save** calls `PUT` mock API.

### 6.2 Sidebar (hospital responder)

- Dashboard (home)
- **Bed & capacity** (can be same as dashboard anchor)
- **Incidents affecting my facility** (read-only feed from existing alerts APIs if permitted)
- **GIS / facility** (optional map pin if you reuse `gis-mapping` for allowed responders)
- **Reports / export** (CSV mock)
- **Settings** (profile, notification prefs)

### 6.3 Mock API shape (illustrative)

```json
GET /api/responder/hospital/capacity
{
  "facilityId": "mock-fac-001",
  "facilityName": "Demo Medical Center",
  "updatedAt": "2026-05-13T12:00:00.000Z",
  "source": "mock",
  "summary": {
    "totalBeds": 320,
    "occupied": 271,
    "available": 49,
    "icuTotal": 24,
    "icuOccupied": 22,
    "icuAvailable": 2
  },
  "units": [
    { "name": "Med/Surg", "capacity": 180, "occupied": 155 },
    { "name": "ICU", "capacity": 24, "occupied": 22 },
    { "name": "Pediatric", "capacity": 36, "occupied": 28 }
  ]
}
```

`PUT` accepts the same numeric fields; server validates non-negative and `occupied + available <= capacity` (or derives available server-side for production).

### 6.4 Future: state API

- Replace **`getHospitalCapacity`** implementation with HTTP client + env **`STATE_HOSPITAL_API_URL`**, keep DTO stable.
- Add **sync job** or **webhook** if the state pushes updates.

---

## 7. Other verticals (concise)

### 7.1 Police

- **Updates**: staging areas, patrol/unit count, special events, mutual aid.
- **Widgets**: deployment map list, roster summary, incident queue (read-only).
- **Mock**: `mock-police.ts` with vehicles on duty, beats, HQ staging.

### 7.2 Hotel / shelter

- **Updates**: rooms total / occupied / held for EM; ADA rooms; check-in cutoff notes.
- **Widgets**: availability timeline, contact for EOC liaison.
- **Mock**: `mock-hotel.ts` aligned with Virtual EOC lodging if you want consistency.

### 7.3 Utilities (energy / gas / electric / water)

- **Updates**: customers out, crews deployed, ETR buckets, critical facilities.
- **Widgets**: outage summary table + map placeholder; crew rows.
- **Note:** screenshot groups gas/electric/energy similarly — use one template with **commodity** filter.

### 7.4 Pharmacy / logistics / National Guard / Federal

- **Updates**: resource deployment rows (what, qty, where, ETA).
- **Widgets**: table + map coordinates; staging validation optional.

### 7.5 Food logistics / Nonprofits

- **Updates**: volunteer shifts, **response network** nodes (orgs online, capacity).
- **Widgets**: network graph or card list; donation / route status (mock).

### 7.6 Telecom

- **Updates**: tower / county outage annotations; restoration crews.
- **Widgets:** “cell outage” panel (placeholder for **Dashboard B** integration later).

---

## 8. Security & permissions

1. **Route guards**: middleware allowlist + API route checks on **`responderVertical`**.
2. **No cross-vertical writes**: hospital user cannot `PUT` police endpoints.
3. **Sub-admin / Super Admin** retain global user management; they **assign** verticals when onboarding responders.
4. **Audit** (later): log each `PUT` with user id, vertical, payload hash.

---

## 9. Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **P0 — Foundations** | Restore/define **`responder-verticals.ts`**; implement **`ResponderSidebar`** with vertical-aware items; ensure login + cookies expose vertical; fix any broken imports. |
| **P1 — Hospital demo** | Hospital dashboard UI + mock GET/PUT capacity; bed board; “last updated” + source badge. |
| **P2 — Police & hotel** | Two more dashboards reusing card/table patterns; mocks; sidebar links. |
| **P3 — Admin UX** | In **Add user** / **Approve user**, require **responder vertical** when role is responder; show vertical in user tables. |
| **P4 — Utilities & logistics** | Outage-style template + deployment template (most verticals). |
| **P5 — Real integrations** | Swap mock services for state hospital API, utility feeds, etc., without changing page components (only service layer). |

---

## 10. Open decisions (short)

1. **URL strategy**: single `/responder-dashboard` with tabs vs **`/responder/[vertical]`** — recommend **`/responder-dashboard`** for demo simplicity, segment internally by vertical.
2. **Shared vs split utility roles**: one **`utility`** vertical with **subtype** vs four enums — prefer **subtype** if many screens are identical.
3. **Public officials “view only”**: new role vs read-only responder with no `PUT` routes — decide when that persona is in scope.

---

## 11. Success criteria (demo)

- Logging in as a **responder** with `responderVertical: hospital` shows **only** responder navigation and a hospital dashboard with **editable** bed/capacity and mock persistence (e.g. in-memory or a small JSON file in dev only — production should use DB or external API).
- **Police** and **hotel** responders see **different** sidebars and metrics.
- **Super Admin** can assign vertical at user creation; responder cannot change their own vertical.

---

*Document version: 1.0 — 2026-05-13*
