---
doc: eqms-action-plan
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: roadmap
status: current
---

# eQMS Action Plan

> Generated: 2026-03-23 | Prioritized roadmap from current gaps to full eQMS

## Guiding Philosophy

Fix foundations before building features. The current system has critical structural debt (tenancy inconsistency, scattered status logic, no data retention) that will compound with every new feature. The plan front-loads structural fixes while delivering business value in parallel.

**Time horizon:** 18 months across 4 phases

---

## Phase A: Structural Foundations (Months 1–3)

**Goal:** Eliminate critical security and data integrity gaps. No user-visible features — engineering investment only.

### A1 — Unify Tenancy Fields 🔴
**Priority:** CRITICAL | **Effort:** 3 weeks | **Risk:** Medium (data migration)

**Steps:**
1. Audit all 128 models for `tenantOrgId`, `tenantId (String)`, `tenant_id`, `tenantId (ObjectId)` usage
2. Create migration script: for each legacy model, look up Tenant by string key → store ObjectId
3. Run migration in dev → staging → production with zero-downtime approach (dual-write then cut-over)
4. Update all queries that filter by `tenantOrgId` to use `tenantId`
5. Add Mongoose middleware that validates `tenantId` is present and a valid ObjectId on all writes

**Files to update:**
- `src/models/auditRequestsMasterModel.js` — change `tenantOrgId: String` to `tenantId: ObjectId → Tenant`
- `src/models/capaModel.js` — same
- `src/models/auditScheduleModel.js` — same
- `src/models/availabilityBlockModel.js` — same
- `src/models/questionnaireSectionAssignmentModel.js` — same
- `src/models/scheduleSlotModel.js` — same
- ~9 models with `tenantId: String` → change to `tenantId: ObjectId`

**Success Criteria:** `grep -r "tenantOrgId" src/models/` returns 0 results.

---

### A2 — Soft Delete + Retention 🟠
**Priority:** HIGH | **Effort:** 2 weeks

**Steps:**
1. Create Mongoose plugin `src/plugins/softDeletePlugin.js`:
   - Adds `deletedAt: Date` and `retentionUntil: Date` fields
   - Overrides `findOne`, `find`, `count` to exclude `{ deletedAt: { $ne: null } }`
   - Provides `Model.softDelete(id, userId)` method that sets `deletedAt`
2. Apply plugin to all transactional models (Assessment, Capa, Finding, Evidence, etc.)
3. Retain master data (User, Tenant, SupplierSite) indefinitely — no soft delete
4. Create `retentionUntil` calculation service: `expiryDate + 10 years` for audit records
5. Add archival background job: move records past `retentionUntil` to cold storage collection

**Files to create:**
- `src/plugins/softDeletePlugin.js`
- `src/services/archivalService.js`
- `src/jobs/archivalJob.js`

---

### A3 — Status Enum Registry 🟡
**Priority:** MEDIUM | **Effort:** 1 week

**Steps:**
1. Create `src/constants/statusEnums.js` with all canonical status values (UPPERCASE)
2. Update all model files to import and use constants instead of inline string arrays
3. Update controllers to use the same constants for comparisons
4. Add enum validation middleware that rejects unknown status values

**Files to create:**
- `src/constants/statusEnums.js`

---

### A4 — Add Missing Indexes 🟡
**Priority:** MEDIUM | **Effort:** 1 week

**Steps:**
1. Run MongoDB Atlas Performance Advisor for 30 days to capture actual slow queries
2. Add compound indexes identified in `docs/current-system-gaps.md` (Gap 7 & 8):
   - `AssessmentCapa: { tenantId: 1, assessmentId: 1, status: 1 }`
   - `AssessmentFinding: { tenantId: 1, assessmentId: 1, severity: 1 }`
   - `Capa: { tenantOrgId: 1, status: 1 }` (then migrate to tenantId after A1)
   - `Evidence: { auditRequestId: 1, status: 1 }`
3. Add individual indexes: `AssessmentCapa.ownerId`, `AssessmentFinding.createdBy`, `AssessmentEvidence.uploaderId`

---

## Phase B: Status Engine & V1→V2 Migration (Months 2–5)

**Goal:** Centralize state management and eliminate the dual-model technical debt.

### B1 — Centralized StatusTransitionEngine 🟠
**Priority:** HIGH | **Effort:** 3 weeks

**Steps:**
1. Create `src/services/StatusTransitionEngine.js`:
   ```javascript
   class StatusTransitionEngine {
     async transition({
       entityType, entityId, newStatus,
       actorId, actorRole, reason, force
     }) {
       // 1. Load entity from DB
       // 2. Validate transition is allowed (from allowedTransitions matrix)
       // 3. Validate actor role is authorized for this transition
       // 4. Apply the status change
       // 5. Write StatusHistory record
       // 6. Write AuditTrailEntry
       // 7. Emit domain event for notifications
       // 8. Return updated entity
     }
   }
   ```
2. Define `src/constants/transitionMatrix.js`:
   ```javascript
   {
     Assessment: {
       DRAFT: { ACTIVE: ["buyer", "admin"] },
       ACTIVE: { COMPLETED: ["auditor", "buyer"], ARCHIVED: ["admin"] },
       ...
     },
     AssessmentCapa: {
       DRAFT: { NEEDS_ACTION: ["auditor"] },
       NEEDS_ACTION: { IN_REVIEW: ["supplier"] },
       IN_REVIEW: { REWORK_REQUESTED: ["auditor"], APPROVED: ["auditor"] },
       ...
     }
   }
   ```
3. Refactor all controllers to use `StatusTransitionEngine.transition()` instead of direct `.status =`
4. Remove all 131 scattered `.status =` assignments

**Files to create:**
- `src/services/StatusTransitionEngine.js`
- `src/constants/transitionMatrix.js`

**Files to update:**
- `src/controllers/capaController.js` — remove direct status mutation
- `src/controllers/auditPhaseController.js` — use engine
- `src/controllers/v2/assessmentCapaController.js` — use engine
- All 20+ controllers with status assignments

---

### B2 — Add Role-Based Transition Authorization 🟠
**Priority:** HIGH | **Effort:** 1 week (part of B1)

Implemented as part of `StatusTransitionEngine` — transition matrix includes `allowedRoles[]` per transition. The engine checks `actorRole` against `allowedRoles` and rejects unauthorized transitions with `403 Forbidden`.

---

### B3 — V1 Assessment → V2 Migration 🟠
**Priority:** HIGH | **Effort:** 4 weeks

**Steps:**
1. Build `scripts/migrateV1ToV2.js`:
   - For each `AuditRequestMaster`, create equivalent `Assessment` record
   - Map `questionnaireStatus` → `currentPhaseKey` using mapping table
   - Migrate embedded `phaseState` to `Assessment.phases[]`
   - Set `Assessment.legacyRefs.auditRequestId = AuditRequestMaster._id`
   - Migrate evidence, CAPA, and finding records
2. Run in dry-run mode first: log what would change without writing
3. Run in production with dual-write: new requests write to both V1 and V2
4. After 4 weeks of dual-write, cut-over new requests to V2-only
5. Mark V1 routes as deprecated (X-Deprecated header)
6. Set V1 models to read-only (before migration: V1 routes accept GETs only)

**Migration Mapping:**
```
AuditRequestMaster.questionnaireStatus → Assessment.currentPhaseKey
  request_received  → INITIATED
  in_progress       → PREP
  sent_to_supplier  → PREP
  supplier_submitted → SCOPE_AGENDA
  review_completed  → EXECUTION
  auditor_submitted → REPORTING

Capa → AssessmentCapa (1:1 field mapping, tenantOrgId → tenantId via A1)
Evidence → AssessmentEvidence (1:1, add assessmentId lookup via legacyRefs)
```

---

### B4 — V1 Route Deprecation 🟠
**Priority:** HIGH | **Effort:** 2 weeks (after B3)

**Steps:**
1. Add `X-API-Deprecated: true` response header to all V1 routes
2. Keep V1 GET routes working for 6 months for frontend migration
3. Block V1 POST/PATCH/DELETE routes (return 410 Gone)
4. Update frontend to use V2 API exclusively
5. Remove V1 route files after frontend migration complete

---

## Phase C: eQMS Feature Expansion (Months 5–12)

**Goal:** Add new quality management modules on the solid foundation from Phases A & B.

### C1 — 21 CFR Part 11 Electronic Signatures 🟠
**Priority:** HIGH (required for regulated use) | **Effort:** 3 weeks

**Steps:**
1. Create `ElectronicSignature` model (see `eqms-db-evolution-proposal.md`)
2. Create `src/services/eSignatureService.js`:
   - Validates re-authentication (password + optional MFA)
   - Creates `ElectronicSignature` record with SHA-256 hash
   - Links signature to entity (`Assessment`, `AuditReport`, `Capa`, etc.)
3. Add `POST /api/signatures` endpoint
4. Require e-signature for: Report finalization, CAPA closure, Audit closure
5. Add signature audit trail to PDF report generation

---

### C2 — Deviation Management Module 🟡
**Priority:** MEDIUM | **Effort:** 4 weeks

1. Create `Deviation` and `DeviationInvestigation` models
2. Create `src/routes/v2/deviations.js` + controller
3. Integrate with `StatusTransitionEngine` (C2 uses engine from B1)
4. Link deviations to assessments, CAPAs, and batch records
5. Add dashboard widget for open deviations

---

### C3 — Document Management (SOPs & Protocols) 🟡
**Priority:** MEDIUM | **Effort:** 4 weeks

1. Create `ControlledDocument` and `DocumentVersion` models
2. CRUD API with version control (`/api/v2/documents`)
3. Approval workflow using existing WorkflowOS engine
4. Training notification trigger: when SOP published → create `TrainingRecord` for affected roles
5. Link SOPs to audit findings and CAPAs
6. Link SOPs to change requests

---

### C4 — Change Control Module 🟡
**Priority:** MEDIUM | **Effort:** 3 weeks

1. Create `ChangeRequest` and `ChangeApproval` models
2. CRUD API with configurable approval matrix
3. Impact assessment form
4. E-signature on approval (from C1)
5. Automatically link to affected SOPs and products

---

### C5 — Enhanced Pagination & API Hardening 🟡
**Priority:** MEDIUM | **Effort:** 1 week

1. Create `src/middlewares/paginationMiddleware.js`:
   - Extracts `page`, `limit` from query
   - Enforces max limit (100 records)
   - Returns `{ data, total, page, pageSize, totalPages }` shape
2. Apply to all list endpoints
3. Add `cursor-based pagination` for high-volume endpoints (AuditTrailEntry)

---

## Phase D: Advanced Compliance & Analytics (Months 12–18)

### D1 — OOS/OOT Investigation Module 🟢
**Priority:** LOW (niche use case initially) | **Effort:** 3 weeks

Create `OOSInvestigation` module with Phase 1 (lab error) and Phase 2 (full investigation) workflows.

---

### D2 — Batch Record & Product Release 🟢
**Priority:** LOW | **Effort:** 4 weeks

Create `BatchRecord` model linking product, site, batch number, and all quality events (deviations, OOS, CAPAs). Product release workflow with e-signature.

---

### D3 — Training Management 🟢
**Priority:** LOW | **Effort:** 3 weeks

Create `TrainingRecord` system. Auto-assign training when controlled documents are published. Track completions with e-signatures. Dashboard for overdue training.

---

### D4 — ICH Q9 Risk Assessment Module 🟢
**Priority:** LOW | **Effort:** 4 weeks

Create `RiskAssessment` with FMEA methodology. RPN (Risk Priority Number) calculation. Link to processes, products, sites. Periodic review scheduling.

---

### D5 — Compliance Analytics Dashboard 🟡
**Priority:** MEDIUM | **Effort:** 3 weeks

1. Aggregate `ComplianceRun` results into time-series analytics
2. CAPA closure rate by severity and department
3. Audit finding trends by standard clause
4. Risk heat maps by site/product
5. Training compliance rates
6. Export to PDF/CSV for management review

---

## Quick Wins (Can Be Done Anytime)

These take < 3 days and provide immediate value:

| Item | File | Effort |
|------|------|--------|
| Add X-API-Deprecated header to V1 routes | `src/routes/v1/*.js` | 2h |
| Enforce max 100 records in Capa list | `src/controllers/capaController.js` | 1h |
| Add `findingId` index to `AssessmentCapa` | `src/models/assessmentCapaModel.js` | 30m |
| Add pagination to `v2/assessmentCapaController.listAssessmentCapas` | `src/controllers/v2/assessmentCapaController.js` | 2h |
| Add `auditId` index to `AssessmentEvidence` | `src/models/assessmentEvidenceModel.js` | 30m |
| Add `AuditReport.observations` classification validation | `src/controllers/reportController.js` | 2h |
| Replace pdf-parse with dynamic import | `src/services/questionnaireExtractionService.js` | 1h |

---

## Summary Roadmap

```
Month 1-2:  A1 (Tenancy) + A3 (Enum Registry) + A4 (Indexes) + Quick Wins
Month 2-3:  A2 (Soft Delete) + B1 (Status Engine)
Month 3-5:  B3 (V1→V2 Migration) + B4 (Deprecation) + B2 (Role Auth)
Month 5-6:  C1 (E-Signatures) + C5 (Pagination)
Month 6-9:  C2 (Deviations) + C3 (Document Mgmt)
Month 9-12: C4 (Change Control) + C5 (Analytics)
Month 12-18: D1–D5 (Advanced modules)
```

---

## Success Metrics

| Metric | Current | Target (Phase A) | Target (Phase D) |
|--------|---------|-----------------|-----------------|
| Models with unified tenantId (ObjectId) | ~20 | 128 | 128 |
| Status transitions with centralized engine | 0% | 0% | 100% |
| Models with soft delete | 0 | ~30 | ~60 |
| V2 API traffic share | ~40% | ~60% | 100% |
| List endpoints with pagination | ~60% | ~80% | 100% |
| E-signature coverage on closures | 0% | 0% | 100% |
| eQMS modules available | 1 (Audit) | 1 | 5+ |
