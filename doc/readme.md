# Risk AI Assessment: Issues & Implementation Fixes

## Overview
Following the successful integration of live historical API data into the AI Risk Assessment pipeline, we have identified several logical gaps, UI mismatches, and severe performance issues (socket timeouts). This document outlines the problems and the architectural fixes required.

---

## 1. Role-Based Data Scoping (Admin vs. Sub-Admin)
**Problem:** 
We must strictly enforce that an overarching system `admin` generates analysis across the entire USA, whereas a `sub-admin` only uses and interacts with data locked to their specific assigned state.

---

## 2. Data Mismatch: Live Incidents vs. Narrative Summary
**Problem:**
The Bar Chart UI correctly shows live incidents (e.g., a count of 13 for "Storm"), but the generated "Current Procedures" block for Storms outputs: *"No active severe storm or wind warnings currently reported nationwide."*

---

## 3. Conditional Generation of Historical Context
**Problem:**
The system should only generate a "Historical Context & Mitigation Strategy" tab for a specific hazard category if there is an active live incident taking place. Example: If Tornado count is 0, do not generate a Tornado historical tab.

---

## 4. Missing "Past Procedures" Despite Having "Past Damages"
**Problem:**
In the UI, "Past Damages & Losses" successfully lists events, but "Past Procedures" says *"Data unavailable"*. If an event was severe enough to cause damage, emergency procedures were undoubtedly taken.

---

## 5. Extensive Load Times & Socket Timeout Errors
**Problem:**
The server logs show `[Error [SocketError]: other side closed] { code: 'UND_ERR_SOCKET' }` and request resolution times of **171,000ms to 190,000ms (nearly 3 minutes)**.

## 6. Overly Generic "Strategic Recommendations" & "Future Measures"
**Problem:**
The generated strategies (e.g., "Coordinate with local health and emergency services") are too basic. The audience consists of domain-expert admins and sub-admins who require highly technical, specific, and actionable intelligence, not general platitudes.

---

## 7. Lack of Statistics & Explicit Data in Procedures/Damages
**Problem:**
"Current Procedures" and "Past Procedures" lack exact numbers, statistics, and explicit operational metrics. "Past Damages" has some data (e.g. disaster declaration numbers) but requires deeper enhancements with real metrics.

---

## 8. Poor Formatting & Lack of Visual Emphasis
**Problem:**
Critical information blends into standard text. Parts requiring immediate attention are not highlighted, decreasing readability for fast-paced administrative review.