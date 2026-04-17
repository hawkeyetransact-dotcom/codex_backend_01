# Current System Gaps

> Generated: 2026-03-23 | Architectural analysis of the Hawkeye backend

## Severity Legend
- 🔴 **CRITICAL** — Security risk or data integrity issue; must fix before production scale-up
- 🟠 **HIGH** — Significant technical debt; impedes feature development or causes bugs
- 🟡 **MEDIUM** — Quality/performance issue; should be addressed in next 2 quarters
- 🟢 **LOW** — Improvement opportunity; backlog item

---

## GAP 1: Tenancy Model Inconsistency 🔴 CRITICAL

**Description:**
Three different tenant linkage patterns coexist across 128 models:
- `tenantOrgId: String` — 8+ models (V1 legacy, no FK ref)
- `tenantId: String` — 9+ models (mid-era, no FK ref)
- `tenantId: ObjectId → Tenant` — 20+ models (V2 correct)
- `tenant_id: ObjectId → Tenant` — user/profile models (different field name)

**Affected Models:**
| Pattern | Models |
|---------|--------|
| `tenantOrgId (String)` | AuditRequestMaster, Capa, AuditSchedule, AvailabilityBlock, QuestionnaireSectionAssignment, ScheduleSlot, AuditRfq |
| `tenantId (String)` | AuditTrail, AuditEvent, AuditPlan, AuditAgenda, AuditArtifact, AuditReport, StatusHistory, AssessmentType |
| `tenantId (ObjectId)` | Assessment, AssessmentCapa, AssessmentEvidence, AssessmentFinding, WorkflowInstance, WorkflowTask, AuditNote, AuditCycleTemplate |
| `tenant_id (ObjectId)` | User, SupplierProfile, BuyerProfile, AuditorProfile, SupplierSite |

**Risk:**
- Cross-tenant filtering relies on string comparison for V1 models — if tenant org IDs are not enforced as unique strings, data leakage is possible
- Impossible to `$lookup` join V1 models to Tenant collection
- Queries mixing V1 and V2 models require two different filter strategies
- Cannot use Mongoose's `.populate()` on V1 tenant fields

**Fix:** Migrate all models to `tenantId: ObjectId → Tenant`. Requires data migration with zero-downtime strategy.

---

## GAP 2: No Centralized Status Transition Engine 🟠 HIGH

**Description:**
Status mutations are scattered across 20+ controllers with approximately 131 direct `.status = value` assignments. No centralized engine validates:
- Whether the transition is allowed (e.g., can you go CLOSED → DRAFT?)
- Whether the actor has permission to make the transition
- Whether business rules are satisfied before transition
- Whether an audit trail entry should be created

**Evidence:**
```
src/controllers/auditPhaseController.js:197-219 — Direct phase.status mutation
src/controllers/capaController.js — Status filter but no transition validation
src/controllers/v2/assessmentCapaController.js — No pagination, no status rules
src/controllers/askHawkController.js:586 — Inline status assignment
```

**Risk:**
- Invalid state transitions possible (e.g., CLOSED → NEEDS_SUPPLIER)
- No automatic audit trail on state changes
- Adding a new transition requires changes in multiple controllers
- Notifications missed when status changes without going through notified path

**Fix:** Create `src/services/StatusTransitionEngine.js` with:
```javascript
transition(entityType, entityId, newStatus, actorId, actorRole, reason)
```
All controllers call this single service.

---

## GAP 3: Dual Model Pattern — V1/V2 Coexistence 🟠 HIGH

**Description:**
Two parallel model families exist for the same domain:

| V1 (Legacy) | V2 (Current) | Issue |
|-------------|-------------|-------|
| `AuditRequestMaster` | `Assessment` | Separate code paths for same business concept |
| `Capa` | `AssessmentCapa` | Duplicate CAPA management logic |
| `Evidence` | `AssessmentEvidence` | Separate evidence handling |
| `AuditQuestions` | (questionnaire approach) | Different question models |

Both are actively used. V2 models store `legacyRefs.auditRequestId` to bridge, but:
- New features must be built twice (V1 and V2)
- Reports need to query both to be complete
- Joins between V1 and V2 are manual (no $lookup possible for tenantOrgId)
- API clients need to know which version their audit belongs to

**Fix:** Complete migration to V2. Deprecate V1 with read-only mode; migrate all historical V1 audits to V2 format.

---

## GAP 4: No Soft Delete / Data Retention Policy 🟠 HIGH

**Description:**
Zero models implement soft delete (`deletedAt: Date` or `isDeleted: Boolean`). All deletes are hard deletes with no recovery path.

**Regulatory Risk:**
Under **ICH Q7** (Good Manufacturing Practice for Active Pharmaceutical Ingredients) and **21 CFR Part 11** (Electronic Records):
- Audit records, findings, and CAPAs must be retained for a period that covers the product lifetime + an extension period (typically 10+ years)
- Hard deletes of audit records violate GMP data integrity requirements
- No recovery path for accidental deletions

**Affected High-Risk Models:**
- `AuditRequestMaster` / `Assessment` — Core audit records
- `Capa` / `AssessmentCapa` — CAPA records
- `AuditReport` — Signed audit reports
- `Evidence` / `AssessmentEvidence` — Supporting documentation
- `AuditTrail` — Immutable log (should be non-deletable)

**Fix:** Add `deletedAt: Date` to all transactional models. Implement mongoose middleware that converts `Model.deleteOne()` to a soft-delete update. Create archival jobs for old records.

---

## GAP 5: No Role-Based Status Transition Authorization 🟠 HIGH

**Description:**
Phase transitions and status updates do not validate the actor's role before applying. The `phaseState.ownerRole` field exists but is not checked at the API layer.

**Examples:**
- Supplier can call `PATCH /api/capas/:id/status` and change to APPROVED (auditor-only action)
- Auditor can close an audit without buyer sign-off
- Phase advancement checks prerequisites but not actor role

**Files without role checks:**
```
src/controllers/capaController.js — updateCapaStatus has no role validation
src/controllers/v2/assessmentCapaController.js — same gap
src/controllers/auditPhaseController.js — transition allowed if rules pass, ignores actor role
```

**Fix:** Add role-based transition matrix. Each status transition should define `allowedRoles[]`. Check against `req.user.role` before applying.

---

## GAP 6: Missing Pagination on Critical List Endpoints 🟡 MEDIUM

**Description:**
Several high-traffic list endpoints return unbounded result sets:

| Endpoint | Controller | Issue |
|----------|-----------|-------|
| `GET /api/v2/capas` | `v2/assessmentCapaController.listAssessmentCapas` | No skip/limit |
| `GET /api/audits/supplier` | `auditRequestController` | page/limit but no max enforcement |
| `GET /api/v2/findings` | `v2/findingController` | No explicit pagination |

For large tenants with 1000+ audits, these queries will timeout or OOM.

**Fix:** Enforce max page size (e.g., 100 records). Add `page`/`limit` parameters with defaults. Return `{ data, total, page, pageSize }` consistently.

---

## GAP 7: Missing Compound Indexes on Frequent Query Patterns 🟡 MEDIUM

**Description:**
Common filter patterns lack compound indexes:

| Model | Missing Compound Index | Query Pattern |
|-------|----------------------|---------------|
| `Capa` | `(tenantOrgId, status)` | List open CAPAs for tenant |
| `AssessmentCapa` | `(tenantId, assessmentId, status)` | CAPAs per audit |
| `AssessmentFinding` | `(tenantId, assessmentId, severity)` | Filter findings by severity |
| `Evidence` | `(auditRequestId, status)` | Evidence status check |
| `AuditRequestMaster` | `(tenantOrgId, auditor_id, questionnaireStatus)` | Auditor's pending work |

**Fix:** Add compound indexes matching the most common `find` query patterns. Use MongoDB Atlas Performance Advisor to identify slow queries.

---

## GAP 8: Unindexed Foreign Key Fields 🟡 MEDIUM

**Description:**
Several frequently-queried reference fields lack indexes:

| Model | Unindexed Field | Used for |
|-------|----------------|---------|
| `AssessmentCapa` | `ownerId` | Filter CAPAs by owner |
| `AssessmentFinding` | `createdBy`, `updatedBy` | Activity tracking |
| `AssessmentEvidence` | `uploaderId` | Evidence by uploader |
| `AuditNote` | `authorId` | Notes by author |

---

## GAP 9: No Status Change Notifications for Most Entities 🟡 MEDIUM

**Description:**
Only CAPA status changes trigger notifications reliably (`NEEDS_SUPPLIER`, `REWORK_REQUESTED`). Status changes on:
- `Assessment` — silent
- `WorkflowInstance` / `WorkflowTask` — silent
- `AssessmentFinding` — silent
- `AuditPlan` / `AuditAgenda` — silent

**Impact:** Stakeholders are not informed of state changes relevant to them. Manual refresh required.

**Fix:** Implement an event-driven notification trigger in the `StatusTransitionEngine` (see Gap 2). On any status change, evaluate `notificationRules.js` and dispatch if rules match.

---

## GAP 10: Status Enum Case Inconsistency 🟡 MEDIUM

**Description:**
21+ different status enum definitions use inconsistent casing:

```javascript
// UPPERCASE
Assessment.status: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]
Capa.status: ["DRAFT", "NEEDS_SUPPLIER", "IN_REVIEW", ...]

// lowercase
AuditArtifact.status: ["draft", "sent", "in_progress", "complete"]
Evidence.status: ["processing", "ready", "failed"]

// Mixed/Pascal
IntegrationRunLog.status: ["Success", "Partial", "Failed"]
```

**Risk:** String comparison bugs if code mixes `"DRAFT"` vs `"draft"`. Frontend display inconsistencies.

**Fix:** Create `src/constants/statusEnums.js` with canonical enum values. All models import from this registry. Migrate data if casing changes.

---

## GAP 11: PDF Parse Reads Test File at Module Load 🟡 MEDIUM

**Description:**
The `pdf-parse` npm package reads `./test/data/05-versions-space.pdf` when imported. In Vercel's serverless environment (`/var/task/` is read-only), this fails unless the test data directory is included in the deployment.

**Current workaround:** `.vercelignore` uses `test/*.js` (not `test/`) to keep `test/data/`.

**Fix:** Replace `pdf-parse` with `pdf2json` or use dynamic import pattern with the test file path environment variable.

---

## GAP 12: Top-Level mkdirSync in Services 🟡 MEDIUM

**Description:**
Three services call `fs.mkdirSync()` at module load time (not inside a request handler):

```javascript
// src/services/evidenceService.js
const uploadDir = path.join(process.cwd(), "uploads", "evidence");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }); // CRASHES in Vercel

// src/services/assessmentEvidenceService.js — same pattern
// src/services/auditNoteService.js — same pattern
```

This crashes Vercel serverless functions because `/var/task/` is read-only.

**Current workaround:** All three wrapped in `try-catch` (applied in dev branch worktree).

**Fix:** Defer directory creation to inside the actual file-writing function, where it only runs in environments that support local file storage (non-serverless).

---

## GAP 13: Missing Audit Cycle / Surveillance Linkage 🟢 LOW

**Description:**
Follow-up (surveillance) audits are not formally linked to the original audit at the data model level. `AuditCycleTemplate` exists but is not consistently used to track audit cycles.

**Fix:** Add `parentAuditId` to `Assessment` and `AuditRequestMaster`. Create `AuditCycle` model that groups related audits (initial + surveillance).

---

## GAP 14: Compliance Classification Not Enforced at API 🟢 LOW

**Description:**
The `AuditReport.observations[].classification` field accepts `NAI | VAI | OAI | None` but there is no API validation that every finding has a classification before the report can be finalized.

**Risk:** Reports can be signed off without all findings classified, violating GMP closure requirements.

**Fix:** Add validation in `reportController.js` that checks all observations have non-null classification before allowing `PENDING_SIGNATURES → COMPLETED` transition.

---

## Gap Summary Table

| # | Gap | Severity | Effort | Impact |
|---|-----|----------|--------|--------|
| 1 | Tenancy Model Inconsistency | 🔴 CRITICAL | High | Security, query correctness |
| 2 | No Centralized Status Engine | 🟠 HIGH | High | Maintainability, correctness |
| 3 | V1/V2 Dual Model Coexistence | 🟠 HIGH | Very High | Tech debt, feature velocity |
| 4 | No Soft Delete / Retention Policy | 🟠 HIGH | Medium | GMP compliance, data integrity |
| 5 | No Role-Based Transition Auth | 🟠 HIGH | Medium | Security, authorization |
| 6 | Missing Pagination | 🟡 MEDIUM | Low | Scalability |
| 7 | Missing Compound Indexes | 🟡 MEDIUM | Low | Performance |
| 8 | Unindexed FK Fields | 🟡 MEDIUM | Low | Performance |
| 9 | Silent Status Changes (no notifications) | 🟡 MEDIUM | Medium | UX, stakeholder communication |
| 10 | Status Enum Case Inconsistency | 🟡 MEDIUM | Low | Bug risk |
| 11 | pdf-parse Module Load Issue | 🟡 MEDIUM | Low | Serverless stability |
| 12 | Top-Level mkdirSync | 🟡 MEDIUM | Low | Serverless stability |
| 13 | Missing Audit Cycle Linkage | 🟢 LOW | Low | Data traceability |
| 14 | Compliance Classification Not Enforced | 🟢 LOW | Low | GMP compliance |
