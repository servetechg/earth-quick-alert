# Ready2Go — Compliance Matrix (8 Frameworks)

**Product:** Ready2Go / Earthquickalert emergency management platform  
**Purpose:** Map current project state against SOC 2, NIST CSF, NIST 800-53 Moderate, CJIS, HIPAA, StateRAMP/GovRAMP, ISO 27001, and FedRAMP Moderate.  
**Related:** [Ready2Go_Compliance_Checklist.md](./Ready2Go_Compliance_Checklist.md) (control-level detail)

---

## Status legend

Use only these three values:

| Status | Meaning |
|--------|---------|
| **In use** | Already working in the project in a way that supports compliance goals |
| **Partial** | Some pieces exist, but not enough to meet procurement or regulatory expectations |
| **Not in project** | Missing or not reliably implemented today |

### How to read the Notes column

- **Not in project** — What the project uses today (if anything) and what should be implemented in the future to satisfy all eight frameworks for that area.
- **Partial** — Current state of the project and what still needs to be implemented to fulfill the requirements.

---

## Compliance matrix

| Area | Status | Description (purpose) | Notes | Timeline required for implementation |
|------|--------|----------------------|-------|-----------------------------------|
| Identity & user login | Partial | Confirms who is signing in before they can use dashboards, maps, alerts, or admin tools. | **Current:** Email/password login, password hashing, account approval (pending/approved/rejected), mobile login with email verification OTP. **Still needed for all 8 frameworks:** Real multi-factor authentication for admins and sensitive roles; login attempt limits and account lockout; stronger password rules; ban commonly leaked passwords. Required by SOC 2, NIST 800-53, CJIS, HIPAA (draft rules), ISO 27001, StateRAMP, and FedRAMP. | 6–10 weeks |
| Access control & roles | Partial | Ensures each person only sees and does what their job allows (super-admin, sub-admin, responder, citizen, etc.). | **Current:** Role-based routing in middleware; role checks on many admin and map APIs; sub-admin jurisdiction (state/radius). **Still needed:** Same server-side permission checks on every API route—not only UI or middleware; documented least-privilege rules; periodic access reviews for admin accounts; automatic removal/disable when someone leaves. Required by SOC 2, NIST CSF/800-53, CJIS, HIPAA, ISO 27001, StateRAMP, FedRAMP. | 8–12 weeks |
| Session & automatic logoff | Partial | Limits how long someone stays signed in on shared or unattended devices. | **Current:** JWT sessions (~2 hours); session timeout preference in user settings; mobile refresh tokens with rotation. **Still needed:** Enforce idle timeout on every request; reliable logout and token invalidation; stricter timeouts for admin and law-enforcement/health roles. Required by SOC 2, NIST 800-53, CJIS, HIPAA, ISO 27001, StateRAMP, FedRAMP. | 4–6 weeks |
| Audit logging & accountability | Partial | Creates a trustworthy record of who did what, when—for investigations, audits, and trust with government buyers. | **Current:** Activity log for login, logout, password change, some admin actions; ActivityLog stored in MongoDB. **Still needed:** Log all sensitive actions (user changes, exports, map data access, file upload/delete, failed logins); standard fields (who, what, when, result); logs kept at least 1 year (CJIS); protection from tampering; regular review and alerts. Required by all 8 frameworks. | 10–14 weeks |
| Data encryption (in transit & at rest) | Partial | Protects data while it moves over the internet and while stored, so leaks are harder to exploit. | **Current:** HTTPS assumed in production; secure cookies; passwords hashed—not stored in plain text. **Still needed:** Document and verify encryption for MongoDB and file storage; US-only data regions where required; government-grade options (Atlas for Government) for CJIS/FedRAMP; no sensitive data sent without encryption. SOC 2, NIST, HIPAA, CJIS, ISO, StateRAMP, FedRAMP all expect this. | 4–8 weeks (config) + 3–6 months if gov cloud migration |
| API & application security | Partial | Stops abuse and unauthorized use of backend services that power web and mobile apps. | **Current:** Session checks on many routes; CORS on APIs; Zod validation on mobile v1 APIs; cron endpoints protected by secret. **Still needed:** Validation on all admin APIs; rate limiting on login and sensitive endpoints; CSRF protection for cookie-based web app; security headers (HSTS, CSP); no default secrets in code; safe error messages (no internal details). Required by SOC 2, NIST 800-53, ISO 27001, StateRAMP, FedRAMP. | 8–12 weeks |
| File uploads & document storage | Partial | Handles emergency plans, continuity documents, and attachments safely. | **Current:** Uploads to Cloudinary; emergency/continuity plan attachments; some delete paths. **Still needed:** Malware scanning on upload; file type and size limits; secure deletion when documents are removed; clarity on which vendors may hold regulated content. Cloudinary is a blocker for CJIS/FedRAMP and uncertain for HIPAA unless vendor signs agreements. SOC 2, ISO, NIST, HIPAA, CJIS, FedRAMP. | 6–10 weeks (scanning + policy) + vendor decision 2–4 months |
| Privacy, retention & secure deletion | Partial | Supports right to remove data and reduces long-term exposure of personal or sensitive information. | **Current:** User deletion with related responder data cleanup; document/avatar removal on mobile; some expiry fields on records. **Still needed:** Written retention rules; scheduled purge; full cascade delete (database + Cloudinary + any AI copies); data masking in logs and non-production environments. SOC 2, HIPAA, ISO 27001, NIST, CJIS (media protection), FedRAMP. | 8–12 weeks |
| Vulnerability & patch management | Not in project | Finds and fixes security weaknesses in code and dependencies before attackers do. | **Current:** package.json and lockfile only; no automated dependency scanning or monthly scan records in the repo. **Future (all 8 frameworks):** Dependabot or Snyk in CI; monthly vulnerability scans; patch SLA for critical issues; annual penetration test. NIST 800-53 (RA-5), FedRAMP, StateRAMP, SOC 2, ISO 27001 explicitly expect this. | 2–4 weeks to start CI; ongoing monthly |
| Security monitoring & anomaly detection | Partial | Detects unusual activity (failed logins, spikes, outages) so teams can respond quickly. | **Current:** Product risk/threat monitoring (NWS, USGS, etc.); source health checks; not the same as security SIEM. **Still needed:** Central monitoring (e.g. Sentry/Datadog); alerts on auth failures and admin actions; review process. NIST CSF DETECT, SOC 2 CC7, 800-53 SI-4, ISO A.8.16, StateRAMP/FedRAMP continuous monitoring. | 4–8 weeks |
| Incident response & breach handling | Not in project | Defines how the organization responds when something goes wrong—including legal notification timelines. | **Current:** No incident response plan, playbooks, or breach notification process in the project. **Future:** Documented IR plan; roles and contacts; CJIS 1-hour reporting to FBI/CSA; HIPAA breach notification rules; tabletop exercises annually. SOC 2 CC7.4/7.5, NIST RS/RC, CJIS, HIPAA, ISO, StateRAMP, FedRAMP. | 4–8 weeks (documentation) + annual drills |
| Backup, disaster recovery & business continuity | Not in project | Ensures the platform can be restored after failure so emergency operations can continue. | **Current:** Continuity planning content in docs; no tested backup/restore runbook or RTO/RPO in the repo. **Future:** Automated DB backups; tested restore at least annually; documented RTO/RPO; emergency mode operations plan (HIPAA). SOC 2 Availability, NIST RC, HIPAA §164.308(a)(7), ISO A.8.13, StateRAMP, FedRAMP. | 4–6 weeks setup + 1 annual test |
| Vendor & third-party risk (sub-processors) | Not in project | Ensures outside services (hosting, AI, files, database) meet the same trust bar as your product. | **Current:** MongoDB, Cloudinary, OpenAI, email/SMS, maps/OSM APIs used; no vendor inventory or signed BAAs in repo. **Future:** Vendor list; security reviews; HIPAA BAAs (MongoDB, OpenAI with zero retention); CJIS/FedRAMP require gov-approved vendors—OpenAI and Cloudinary are blockers for regulated data. All 8 frameworks (CC9.2, GV.SC, HIPAA §164.308(b), SR, FedRAMP boundary). | 6–12 weeks (inventory + contracts); 6–18 months if stack migration |
| Policy, governance & risk management | Not in project | Sets organizational rules, ownership, and risk decisions—not only technical controls. | **Current:** No formal security policy, risk assessment, POA&M, or ISMS in the repository. **Future:** Security policy; annual risk assessment; POA&M spreadsheet tied to checklist; roles (who owns security); management review. NIST CSF GOVERN, ISO 27001 Clauses 4–10, SOC 2, StateRAMP SSP/POA&M, FedRAMP. | 8–16 weeks (with compliance tool or consultant) |
| Mobile app security | Partial | Protects citizen/responder mobile access to alerts, profile, and emergency features. | **Current:** Mobile v1 API with bearer tokens, refresh rotation, OTP verification, Zod validation, push tokens. **Still needed:** Align with enforced MFA; device security expectations for CJIS mobile; remote wipe policy if mobile accesses sensitive data. SOC 2, NIST, CJIS §5.13, HIPAA, ISO, StateRAMP. | 6–10 weeks (with Phase 1 MFA) |
| AI & document intelligence | Partial | Uses AI for risk assessment, continuity audit summaries, and alert drafting. | **Current:** OpenAI integration; Python integrity service; Weaviate planned for continuity/tenancy. **Still needed:** No regulated data to OpenAI without BAA + zero retention; human review for high-impact decisions; bias/reliability testing (NIST AI RMF). CJIS and FedRAMP: current AI pipeline not suitable for criminal justice or federal data. HIPAA: only with proper agreements. | 8–16 weeks (governance + contracts); longer if AI architecture changes |
| Healthcare data (HIPAA) | Not in project | Protects patient-related information if hospitals integrate beyond public map locations. | **Current:** Hospital/pharmacy map layers and responder tools; HIPAA mentioned in AI prompts only—no ePHI controls, BAAs, or PHI-specific audit/access isolation. **Future (if handling ePHI):** Risk analysis; BAAs; encrypt ePHI; audit all PHI access; MFA for clinical users; breach notification process. Not required if you only show public facility locations with no patient records. HIPAA only (plus overlap with SOC 2, NIST, ISO). | 6–12 months if ePHI is in scope; N/A if public GIS only |
| Law enforcement data (CJIS) | Not in project | Protects FBI criminal justice information if police systems integrate with Ready2Go. | **Current:** Police map layers and responder verticals—no CJIS controls (MFA for all CJI, 365-day audit, FIPS crypto, background checks, gov hosting). **Future:** CJIS Security Addendum; personnel screening; Atlas for Government; remove OpenAI/Cloudinary from CJI path; 1-hour incident reporting. CJIS primary; also NIST 800-53, FedRAMP, StateRAMP. | 12–18 months if CJI is in scope; N/A if public GIS only |
| State government authorization (StateRAMP) | Not in project | Proves to state procurement that the product meets government security expectations. | **Current:** No System Security Plan, 3PAO assessment, authorization boundary diagram, or continuous monitoring package. **Future:** Close NIST 800-53 Moderate gaps; SSP + POA&M; independent assessment; government sponsor; monthly scans. Builds on SOC 2 and technical Phases 1–3. StateRAMP/GovRAMP (overlaps NIST, SOC 2, ISO). | 12–24 months after SOC 2 readiness |
| Federal authorization (FedRAMP Moderate) | Not in project | Allows US federal agencies to use the platform at moderate impact level. | **Current:** Commercial stack (Atlas, Cloudinary, OpenAI) not FedRAMP-authorized for regulated workloads; no FIPS-validated crypto program; no federal continuous monitoring. **Future:** Migrate to FedRAMP-authorized services; US-only residency; FIPS crypto; 323-control baseline; 3PAO; agency Authorizing Official. FedRAMP (extends NIST 800-53). | 18–36 months; after StateRAMP/SOC 2 |
| Enterprise credibility (ISO 27001) | Not in project | Demonstrates a formal information security management system for enterprise and international customers. | **Current:** Some technical controls overlap with SOC 2 but no ISMS, Statement of Applicability, internal audits, or certification. **Future:** ISMS scope; risk treatment; Annex A controls; internal audit; certification audit. Much overlaps SOC 2 + NIST; ISO 27001 adds management system discipline. | 12–18 months (often parallel with SOC 2) |
| SOC 2 Type II | Not in project | Independent proof over time that security, availability, and confidentiality controls work as advertised. | **Current:** Foundational pieces (login, roles, partial logging) but not enough evidence or policies for an auditor. **Future:** Policies; Vanta/Drata or similar; 6–12 month observation period; auditor report. Touches most areas above. SOC 2 (foundation for StateRAMP and enterprise sales). | 12–18 months total |

---

## Summary by status

| Status | Area count | Meaning |
|--------|------------|---------|
| In use | 0 | No area fully meets all 8 frameworks yet |
| Partial | 12 | Building blocks exist; gaps remain |
| Not in project | 10 | Must be built or procured |

### Partial areas (12)

1. Identity & user login  
2. Access control & roles  
3. Session & automatic logoff  
4. Audit logging & accountability  
5. Data encryption (in transit & at rest)  
6. API & application security  
7. File uploads & document storage  
8. Privacy, retention & secure deletion  
9. Security monitoring & anomaly detection  
10. Mobile app security  
11. AI & document intelligence  

### Not in project areas (10)

1. Vulnerability & patch management  
2. Incident response & breach handling  
3. Backup, disaster recovery & business continuity  
4. Vendor & third-party risk  
5. Policy, governance & risk management  
6. Healthcare data (HIPAA) — if ePHI in scope  
7. Law enforcement data (CJIS) — if CJI in scope  
8. State government authorization (StateRAMP)  
9. Federal authorization (FedRAMP Moderate)  
10. Enterprise credibility (ISO 27001)  
11. SOC 2 Type II  

*(SOC 2 listed separately as the certification umbrella; counts as 10 “Not in project” capability areas plus SOC 2 as program.)*

---

## Frameworks covered

| # | Framework | Primary purpose for Ready2Go |
|---|-----------|------------------------------|
| 1 | SOC 2 Type II | State and enterprise procurement credibility |
| 2 | NIST Cybersecurity Framework | Emergency management risk alignment |
| 3 | NIST 800-53 Moderate | Government-grade security controls |
| 4 | CJIS | Law enforcement integrations |
| 5 | HIPAA | Healthcare integrations |
| 6 | StateRAMP / GovRAMP | State government procurement |
| 7 | ISO 27001 | Enterprise and international credibility |
| 8 | FedRAMP Moderate | Future federal expansion |

---

## Server-side vs client-side (where work happens)

| Layer | Role in compliance | Examples in Ready2Go |
|-------|-------------------|----------------------|
| **Server-side** | Required for almost all controls | `app/api/*`, `middleware.ts`, `lib/auth.ts`, `lib/activity-log.ts`, MongoDB |
| **Client-side** | UI support only; not sufficient alone | Dashboards, role-based navigation, security settings toggles |
| **Infrastructure** | Hosting, TLS, backups, WAF | Vercel/AWS, MongoDB Atlas, Cloudinary (cloud consoles) |
| **Policy & process** | Documents, contracts, audits | IR plan, BAAs, POA&M, 3PAO assessments |

Compliance cannot be achieved through the user interface alone. Controls must be enforced on the server and in infrastructure.

---

## Suggested implementation phases

| Phase | Focus | Timeline |
|-------|--------|----------|
| **Phase 1** | Login hardening, MFA, audit logs, API guards, secrets, security headers | 3 months |
| **Phase 2** | Infra encryption, backups, monitoring, vulnerability CI | 2 months |
| **Phase 3** | Policies, vendor BAAs, incident response plan, POA&M | 3 months |
| **Phase 4** | SOC 2 Type II observation and report | 12–18 months |
| **Phase 5** | StateRAMP / GovRAMP authorization | +12 months |
| **Phase 6** | HIPAA / CJIS / FedRAMP | Only if product scope requires regulated data |

---

## Key codebase references (current building blocks)

| Capability | Location |
|------------|----------|
| Login & sessions | `app/api/login/route.ts`, `lib/auth.ts` |
| Role routing | `middleware.ts` |
| Activity logging | `lib/activity-log.ts`, `models/ActivityLog.ts` |
| Mobile auth | `app/api/v1/auth/*`, `lib/auth/mobile/*` |
| User security settings | `app/api/user/security/route.ts` |
| Sub-admin scope | `lib/sub-admin/jurisdiction.ts` |
| File storage | `lib/cloudinary.ts`, continuity/emergency plan APIs |
| AI services | `lib/services/openai-service.ts` |

---

## How to use this document

1. Review each **Partial** row in sprint planning; assign owners and dates.  
2. Track **Not in project** items in a single POA&M spreadsheet (Control ID, Framework, Finding, Owner, ETA, Status).  
3. Re-run this matrix at each major release and at least quarterly.  
4. When scoping HIPAA or CJIS, confirm whether you handle regulated data or only public GIS—many rows become N/A if no ePHI/CJI.  
5. For control-level detail, use the companion checklist and cite framework + control ID in PRs and security reviews.

---

*Last updated: June 2026 — aligned to Ready2Go codebase review and Ready2Go_Compliance_Checklist.md.*
