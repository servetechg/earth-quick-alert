Frontend (pages & UI)
Admin routes (app/(admin)/)
File	Purpose
app/(admin)/responder-dashboard/page.tsx
Main responder operational dashboard
app/(admin)/responder-settings/page.tsx
Responder settings
app/(admin)/responders-agencies/page.tsx
Responders & agencies management
app/(admin)/responder-field-status/page.tsx
Field status
app/(admin)/responder-lodging-status/page.tsx
Lodging status
Auth / signup (responder role & vertical)
File
app/signup/page.tsx
app/login/page.tsx
Vertical dashboard sections (components/responder/)
File	Vertical
hospital-capacity-section.tsx
Hospital
police-deployment-section.tsx
Police
hotel-availability-section.tsx
Hotel
pharmacy-resource-deployment-section.tsx
Pharmacy
transit-resource-deployment-section.tsx
Transit
energy-resource-deployment-section.tsx
Energy
gas-resource-deployment-section.tsx
Gas
electric-resource-deployment-section.tsx
Electric
water-resource-deployment-section.tsx
Water
food-logistics-resource-deployment-section.tsx
Food logistics
national-guard-resource-deployment-section.tsx
National Guard
federal-resource-deployment-section.tsx
Federal
nonprofit-resource-deployment-section.tsx
Nonprofit
public-official-dashboard-section.tsx
Public official
general-responder-section.tsx
General
responder-info-bar.tsx
Shared info bar
responder-panel-styles.ts
Shared styles
Shared / shell UI
File
components/responder-sidebar.tsx
components/responder-table.tsx
components/modals/manage-responders-modal.tsx
components/first-responder-tools.tsx
components/sidebar.tsx (nav includes responder routes)
components/gis-map.tsx (map on dashboards; used with responder views)
Backend models (models/)
Model file	Collection role
Responder.ts
Legacy/demo responder units (GIS /api/responders)
ResponderInvite.ts
Admin invite tokens for new responders
ResponderHospitalCapacity.ts
Hospital capacity per user
ResponderPoliceDeployment.ts
Police deployment per user
ResponderPharmacyDeployment.ts
Pharmacy sites per user
ResponderTransitDeployment.ts
Transit deployment per user
ResponderEnergyDeployment.ts
Energy utility per user
ResponderGasDeployment.ts
Gas utility per user
ResponderElectricDeployment.ts
Electric utility per user
ResponderWaterDeployment.ts
Water utility per user
ResponderFoodLogisticsDeployment.ts
Food logistics per user
ResponderNationalGuardDeployment.ts
National Guard per user
ResponderFederalDeployment.ts
Federal staging per user
ResponderNonprofitDeployment.ts
Nonprofit deployment per user
User (in models/User.ts) also stores role: 'responder', responderVertical, responderFunction — not a separate Responder user model.

API routes
Responder operational (app/api/responder/)
Route file	Endpoint (approx.)
dashboard/route.ts
GET /api/responder/dashboard
hospital/capacity/route.ts
GET/PUT /api/responder/hospital/capacity
police/deployment/route.ts
GET/PUT /api/responder/police/deployment
hotel/availability/route.ts
GET/PUT /api/responder/hotel/availability
pharmacy/resource-deployment/route.ts
GET/PUT /api/responder/pharmacy/resource-deployment
transit/resource-deployment/route.ts
GET/PUT /api/responder/transit/resource-deployment
energy/resource-deployment/route.ts
GET/PUT /api/responder/energy/resource-deployment
gas/resource-deployment/route.ts
GET/PUT /api/responder/gas/resource-deployment
electric/resource-deployment/route.ts
GET/PUT /api/responder/electric/resource-deployment
water/resource-deployment/route.ts
GET/PUT /api/responder/water/resource-deployment
food-logistics/resource-deployment/route.ts
GET/PUT /api/responder/food-logistics/resource-deployment
national-guard/resource-deployment/route.ts
GET/PUT /api/responder/national-guard/resource-deployment
federal/resource-deployment/route.ts
GET/POST/PUT /api/responder/federal/resource-deployment
nonprofit/resource-deployment/route.ts
GET/PUT /api/responder/nonprofit/resource-deployment
public-official/route.ts
GET /api/responder/public-official
Invites & admin
Route file	Endpoint (approx.)
app/api/responder-invite/preview/route.ts
GET /api/responder-invite/preview
app/api/admin/responder-invites/route.ts
Admin invite CRUD/send
app/api/responders/route.ts
GET /api/responders (legacy Responder model for map)
Related (auth / users, not under /api/responder/ but responder-specific logic)
Route file	Notes
app/api/signup/route.ts
Responder signup + invite
app/api/login/route.ts
Responder / public_official login
app/api/admin/users/route.ts
User CRUD; deletes responder operational data
Supporting backend (not models/APIs, but used by responders)
lib/

lib/responder-verticals.ts
lib/responder-api-gate.ts
lib/responder-invite-options.ts
lib/email/responder-invite-send.ts
lib/services/responder/ — index.ts, types.ts, store.ts, *-db.ts, delete-responder-operational-data.ts, etc.