# AI Risk Assessment & Alerts Validation - Fixes & Enhancements

This document outlines the required fixes and enhancements to align data consistency, improve UI presentation, and accurately source specialized AI summaries across the AI Risk Assessment and Alerts & Communication pages.

## 1. Data Consistency & Alert Counts
**Goal:** Ensure a single source of truth so that the "Alerts & Communication" page and the "AI Risk Assessment" page show the exact same "Active Incidents" counts under all circumstances.

* **Role-Based Scope Matching:**
  * **Admins:** Must see active incidents from all over the USA consistently across both pages.
  * **Sub-Admins:** Must see active incidents strictly scoped to the state configured in their profile consistently across both pages.
* **Alerts Count UI Addition:** 
  * Add a visible "Total Active Alerts" counter to the "Alerts & Communication" page. This provides an immediate visual verification that both pages are operating on the exact same dataset.
* **Strict Single Source of Truth:** 
  * Ensure neither page fetches overlapping or disparate feeds directly. All data must flow through the scoped `UnifiedEvent` (where `dataStatus: 'current'`).
  * In alert data fetches through realtime api and shows current events and safe to the separate model. Now, we need to change that because both shows realtime incidents so savving in separate modelss in db is not a good option. In order to match the all results we are using same model `UnifiedEvent` for both. Now realtime api call and afe the redlt in it.
  * For context i am attaching small piece of data from `UnifiedEvent` table. file name is 
  * Using same table helps showcasing same number of incidentts on both page. Its you job to decide when the API is call and how it updates the field in db and how it override tthe same incidents obatain currently its done via upsert command using external ID in teh `UnifiedEvent` table. youu need to verify it by on you own.
  
## 2. Severity Levels Section
**Goal:** Improve layout responsiveness and readability of AI-generated summaries.

* **Dynamic Column Styling:**
  * Fix the CSS layout (e.g., using flexbox or CSS grid) so that severity columns display in a single row sequence based on data presence.
  * *Example:* If there are 3 active severity levels, they should render as 3 evenly distributed columns in a single row. If there are 2, they should render as 2 columns spanning the row. Prevent the issue where columns arbitrarily wrap to a second row (e.g., 2 on top, 1 below).
* **Bullet-Point Summaries (Prompt Engineering & UI):**
  * Convert the lengthy text paragraphs under each category into concise, easy-to-read bullet points.
  * **Strict Data Retention:** The AI prompt must be instructed to never omit numbers, statistics, event names, dates, and times. 
  * **Property Extraction:** Explicitly pass and highlight data residing in the `properties` field of the `UnifiedEvent` model (e.g., magnitude, depth, acres burned, flood gauge stages). 
  * *Result:* Each category will have a condensed list of highly specific, data-rich bullet points highlighting the current impacts.

## 3. Historical Context & Mitigation Strategy
**Goal:** Enhance the precision of historical data and source actionable "Current Procedures" directly from active responder tables.

* **Matched Event Enrichment:**
  * The "Matched Event" heading currently lacks depth. Update the data pass-through to ensure it clearly highlights the event name, date, time, and specific granular statistics from the `properties` field of the historical matched `UnifiedEvent`.
* **Current Procedures (Responder Data Integration):**
  * **Source Update:** "Current Procedures" must not be generically inferred. The data passed to the AI to generate this summary must be sourced directly from the active **Responder models/database** (e.g., Hospital Capacity, Police Deployment, Logistics — as defined in `responders info.md`).
  * **Dynamic Mapping:** Only fetch responder actions relevant to the current active incidents displayed in the "Incident Distribution" and "Severity Levels" sections.
* **Separation of Past Damages vs. Past Procedures:**
  * **Past Damages & Losses:** Must be strictly limited to physical destruction, casualties, property/crop damage, and raw financial loss statistics.
  * **Past Procedures:** Move all information regarding aid, funding distributions, operational strategies, and past recovery efforts into this section. Do not mix procedure/aid concepts into the damages section.
* **Category-Specific Strategic Recommendations:**
  * "Strategic Recommendations" must cease being a generic, page-wide output.
  * It must be dynamically scoped to the currently active **Category Tab**. Whenever a user switches tabs (e.g., from Flood to Wildfire), the strategic recommendations must update to reflect that specific category.
  * Ensure these recommendations are heavily influenced by the "Future Preventative Measures" generated for that specific hazard category.