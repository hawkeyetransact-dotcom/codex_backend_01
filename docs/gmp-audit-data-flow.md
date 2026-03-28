# GMP Audit Data Flow

> Generated: 2026-03-23 | End-to-end trace from audit creation to surveillance

## Overview

A GMP audit on Hawkeye passes through 8 phases. Each phase has a designated owner role, prerequisite milestones, data artifacts, and model state changes.

```
INITIATED → PREP → PLANNING (SCOPE_AGENDA) → SCHEDULING → EXECUTION → REPORTING (FINDINGS) → CAPA (FOLLOWUP_CAPA) → CLOSURE → SURVEILLANCE
```

The platform supports two parallel model lineages:
- **V1** (legacy): `AuditRequestMaster` + `Capa` + `Evidence`
- **V2** (current): `Assessment` + `AssessmentFinding` + `AssessmentCapa` + `AssessmentEvidence`

V2 stores a `legacyRefs.auditRequestId` to bridge both.

---

## Phase 1: INITIATED

**Owner:** Buyer | **Goal:** Create audit request, assign parties

### API Endpoints
```
POST /api/audits/buyer                           Create audit request
GET  /api/audits/buyer                           List buyer's audits
GET  /api/audits/auditor                         List auditor's assigned audits
GET  /api/audits/supplier                        List supplier's audits
POST /api/audits/:auditId/assign-auditors        Assign lead/co/reviewer auditors
```

### Controller: `auditRequestController.js`
- `getAuditRequestsByBuyer()` — paged list, filter by status/supplier/auditor
- `getAuditRequestsByAuditor()` — auditor's assigned audits
- `assignAuditors()` — sets `auditor_id`, updates `auditorDecision: PENDING`

### Models Written
| Model | Field Changes |
|-------|--------------|
| **AuditRequestMaster** | Created with supplier_id, auditor_id, site_id, assessmentTypeId; trackStatus="Request Received"; questionnaireStatus="request_received"; auditorDecision=PENDING; supplierDecision=PENDING |
| **PhaseTracker** | Created for assessment type; currentPhaseKey=INITIATED |
| **WorkflowMilestoneInstance** | INTIMATION_LETTER_SENT milestone created with status=NOT_STARTED |
| **AuditTrail** | Action: "AUDIT_CREATED" |

### Artifacts Created
- `INTIMATION_LETTER` — Formal letter to supplier announcing audit

### Status After Phase
```
AuditRequestMaster.questionnaireStatus = "request_received"
AuditRequestMaster.trackStatus = "Request Received"
AuditRequestMaster.phaseState.INITIATED.status = "IN_PROGRESS"
```

---

## Phase 2: PREP (Preparation)

**Owner:** Supplier | **Goal:** Supplier completes pre-audit questionnaire and DRL

### API Endpoints
```
POST /api/audits/:auditId/prep/start             Start PREP phase
POST /api/audits/:auditId/prep/complete          Complete PREP phase
GET  /api/audits/:auditId/phases                 Get all phase data
GET  /api/audits/:auditId/artifacts              List artifacts
POST /api/audits/:auditId/artifacts              Create artifact
POST /api/audits/:auditId/artifacts/:id/send     Send artifact to supplier
POST /api/audits/:auditId/artifacts/:id/submit   Supplier submits artifact
GET  /api/questionnaires?auditId=:id             Get questionnaire
POST /api/questionnaires/:id/submit              Submit questionnaire
```

### Controllers
- `auditPhaseController.js` — phase transitions, artifact management
- `questionaireController.js` — legacy questionnaire CRUD
- `preAuditController.js` — V2 pre-audit questionnaire

### Models Written
| Model | Field Changes |
|-------|--------------|
| **AuditRequestMaster** | questionnaireStatus updated through: request_received → in_progress → sent_to_supplier → supplier_submitted; phaseState.PREP.status = IN_PROGRESS |
| **AuditArtifact** | Created: artifactType=PRE_AUDIT_QUESTIONNAIRE, status=draft→sent→in_progress→complete |
| **AuditArtifact** | Created: artifactType=DRL (Document Requirements List) |
| **PreAuditQuestionnaire** | Created with templateId, responses[]; status: DRAFT→SENT→IN_PROGRESS→SUBMITTED |
| **AuditQuestions** (V1) | Questionnaire questions created, responses filled by supplier |
| **AuditTrail** | Actions: QUESTIONNAIRE_SENT, QUESTIONNAIRE_SUBMITTED |

### Prerequisite to Move Forward
`phaseRules.js`: Pre-audit questionnaire must be `SENT | WAIVED | SUBMITTED | REVIEWED | CLOSED` before advancing to SCOPE_AGENDA

### Status After Phase
```
AuditRequestMaster.questionnaireStatus = "supplier_submitted" (or "review_completed")
AuditArtifact[PRE_AUDIT_QUESTIONNAIRE].status = "complete"
AuditRequestMaster.phaseState.PREP.status = "COMPLETED"
```

---

## Phase 3: PLANNING (SCOPE_AGENDA)

**Owner:** Auditor | **Goal:** Define audit scope, objectives, and finalize agenda

### API Endpoints
```
POST /api/audits/:auditId/phases/transition      Transition to SCOPE_AGENDA
GET  /api/audits/:auditId/plan                   Get audit plan
POST /api/audits/:auditId/plan                   Create/update plan
POST /api/audits/:auditId/plan/submit            Submit plan for approval
GET  /api/audits/:auditId/agenda                 Get agenda
POST /api/audits/:auditId/agenda                 Create/update agenda
POST /api/audits/:auditId/agenda/confirm         Confirm agenda
```

### Controller: `auditPhaseController.js`
- `transitionAuditPhase()` — transitions to SCOPE_AGENDA if prerequisites met
- `createAuditArtifact()` — creates SCOPE artifact

### Models Written
| Model | Field Changes |
|-------|--------------|
| **AuditPlan** | Created: scope, objectives, riskSummary, participants[]; status=DRAFT |
| **AuditAgenda** | Created: blocks[] (time slots), attendees[]; status=DRAFT→PROPOSED→CONFIRMED |
| **AuditArtifact** | Created: artifactType=SCOPE |
| **WorkflowMilestoneInstance** | AGENDA_FINALIZED milestone updated to DONE when agenda confirmed |
| **AuditTrail** | Actions: PLAN_CREATED, AGENDA_CONFIRMED |

### Prerequisite to Move Forward
Milestone `SCOPE_AGENDA:AGENDA_FINALIZED` must be `DONE`

### Status After Phase
```
AuditPlan.status = "APPROVED"
AuditAgenda.status = "CONFIRMED"
WorkflowMilestoneInstance[AGENDA_FINALIZED].status = "DONE"
AuditRequestMaster.phaseState.SCOPE_AGENDA.status = "COMPLETED"
```

---

## Phase 4: SCHEDULING

**Owner:** Auditor | **Goal:** Confirm audit dates and logistics

### API Endpoints
```
POST /api/audits/:auditId/phases/transition      Transition to SCHEDULING
GET  /api/scheduling/:auditId                    Get schedule
POST /api/scheduling/:auditId                    Create schedule
POST /api/scheduling/:auditId/confirm-dates      Confirm audit dates
GET  /api/audits/:auditId/availability           Check auditor availability
```

### Controller: `schedulingController.js`, `auditPhaseController.js`

### Models Written
| Model | Field Changes |
|-------|--------------|
| **AuditSchedule** | Created: auditId, scheduledDate, confirmedAt |
| **ScheduleSlot** | Time slots for auditor availability |
| **AvailabilityBlock** | Block auditor calendar |
| **WorkflowMilestoneInstance** | DATES_CONFIRMED milestone updated to DONE |
| **AuditTrail** | Actions: DATES_CONFIRMED |

### Prerequisite to Move Forward
Milestone `SCHEDULING:DATES_CONFIRMED` must be `DONE`

---

## Phase 5: EXECUTION

**Owner:** Auditor | **Goal:** Conduct audit, collect evidence, assess observations

### API Endpoints
```
POST /api/audits/:auditId/phases/transition      Transition to EXECUTION
GET  /api/audits/:auditId/questions              Get audit checklist
POST /api/audits/:auditId/questions/:qId/response  Submit auditor response
POST /api/audits/:auditId/questions/:qId/flag   Flag question for follow-up
POST /api/evidence                               Upload evidence
GET  /api/evidence?auditId=:id                   List evidence
PATCH /api/evidence/:id/links                    Link evidence to questions
POST /api/v2/evidence                            Upload evidence (V2)
```

### Controllers
- `auditPhaseController.js` — phase management
- `evidenceController.js` — V1 evidence
- `v2/assessmentEvidenceController.js` — V2 evidence

### Models Written
| Model | Field Changes |
|-------|--------------|
| **AuditRequestMaster** | questionnaireStatus updated: supplier_submitted → followup_requested → followup_submitted → review_completed; trackStatus="Execution In Progress" |
| **AuditQuestions** | Auditor fills responses; flagStatus can be set; auditorAttachments[] added |
| **Evidence** (V1) | Created per upload: uploaderId, fileName, s3Key, mimeType, status=processing→ready |
| **AssessmentEvidence** (V2) | Created per upload: assessmentId, tenantId, s3Key, status |
| **AuditEvent** | Detailed change log per question response |
| **AuditTrail** | Actions: QUESTION_RESPONDED, EVIDENCE_UPLOADED, QUESTION_FLAGGED |
| **WorkflowMilestoneInstance** | CLOSING_MEETING milestone tracked |

### Remote Audit Variant
```
POST /api/remote-audit/session          Create remote session
GET  /api/remote-audit/:sessionId       Get session details
```
`RemoteSession` model created with videoLink, participants[]

### Prerequisite to Move Forward
Milestone `EXECUTION:CLOSING_MEETING` must be `DONE`

### Status After Phase
```
AuditRequestMaster.questionnaireStatus = "review_completed"
AuditRequestMaster.trackStatus = "Audit Completed"
AuditRequestMaster.phaseState.EXECUTION.status = "COMPLETED"
```

---

## Phase 6: REPORTING (FINDINGS)

**Owner:** Auditor | **Goal:** Document findings, generate draft report

### API Endpoints
```
POST /api/v2/findings                            Create finding (V2)
GET  /api/v2/findings?assessmentId=:id           List findings (V2)
PATCH /api/v2/findings/:id                       Update finding
POST /api/audits/:auditId/report                 Generate report (V1)
GET  /api/audits/:auditId/report                 Get report
GET  /api/report-instances/:id                   Get report instance
POST /api/report-instances                       Create report instance
```

### Controllers
- `v2/findingController.js` — V2 findings
- `reportController.js` — Report generation
- `reportInstanceController.js` — Report instances

### Models Written
| Model | Field Changes |
|-------|--------------|
| **AssessmentFinding** (V2) | Created per finding: severity, domain, description, linkedEvidenceIds, status=OPEN |
| **AuditReport** (V1) | Created: observations[] (questionId, severity, classification), html, signatures[] |
| **ReportInstance** | Created: templateId, sections[], status=draft |
| **EvidenceFinding** | Bridge links between evidence and findings |
| **WorkflowMilestoneInstance** | FINAL_REPORT milestone tracked |
| **AuditTrail** | Actions: FINDING_CREATED, REPORT_GENERATED |

### Report Generation
`auditRagController.js` + Gemini AI generate narrative report from:
- Audit questions and responses
- Identified findings
- Evidence metadata
- ICH Q7 / WHO-GMP standards

### Prerequisite to Move Forward (to CAPA phase)
Milestone `REPORTING:FINAL_REPORT` must be `DONE`

---

## Phase 7: CAPA (FOLLOWUP_CAPA)

**Owner:** Supplier | **Goal:** Address findings with corrective/preventive actions

### API Endpoints
```
GET  /api/capas/                                 List all CAPAs
GET  /api/capas/:id                              Get CAPA detail
POST /api/capas/                                 Create CAPA (V1)
PATCH /api/capas/:id/status                      Update CAPA status
PATCH /api/capas/:id/links                       Link CAPA to findings/evidence
POST /api/capas/:id/actions                      Add comment/response

GET  /api/v2/capas?assessmentId=:id              List CAPAs (V2)
POST /api/v2/capas                               Create CAPA (V2)
PATCH /api/v2/capas/:id/status                   Update CAPA status (V2)
```

### Controllers
- `capaController.js` — V1 CAPA management
- `v2/assessmentCapaController.js` — V2 CAPA management

### CAPA Status Machine
```
DRAFT
  └─→ NEEDS_SUPPLIER       (assigned to supplier for action)
        └─→ IN_REVIEW       (supplier submitted, auditor reviewing)
              ├─→ REWORK_REQUESTED  (auditor requests changes)
              │     └─→ IN_REVIEW   (re-submitted)
              └─→ APPROVED          (auditor accepts)
                    └─→ CLOSED      (verified complete)
              └─→ OVERDUE           (target date passed, auto-flag)
```

### Models Written
| Model | Field Changes |
|-------|--------------|
| **Capa** (V1) | Created: title, severity, status=DRAFT→NEEDS_SUPPLIER; linkedQuestionIds, linkedEvidenceIds |
| **AssessmentCapa** (V2) | Created: assessmentId, findingId, title; status flow same as V1 |
| **AuditArtifact** | artifactType=CAPA_PLAN — supplier uploads action plan document |
| **Notification** | Sent when status = NEEDS_SUPPLIER or REWORK_REQUESTED |
| **AuditTrail** | Actions: CAPA_CREATED, CAPA_STATUS_CHANGED, CAPA_COMMENT_ADDED |

### Prerequisite to Move Forward
All linked CAPAs must reach `APPROVED` or `CLOSED` status before closure

---

## Phase 8: CLOSURE

**Owner:** Buyer | **Goal:** Final review, sign-off, audit closure

### API Endpoints
```
POST /api/audits/:auditId/phases/transition      Transition to CLOSURE
POST /api/audits/:auditId/report/sign            Sign report
POST /api/audits/:auditId/close                  Close audit
GET  /api/report-templates/:id                   Get report template
```

### Models Written
| Model | Field Changes |
|-------|--------------|
| **AuditRequestMaster** | trackStatus="Audit Closed"; high_status=5; complianceStatus=complient/non-complient; phaseState: all phases COMPLETED |
| **AuditReport** | signatures[] added; status=PENDING_SIGNATURES→COMPLETED |
| **AuditArtifact** | artifactType=FINAL_REPORT, status=complete |
| **StatusHistory** | Final status change record |
| **AuditTrail** | Actions: AUDIT_SIGNED, AUDIT_CLOSED |

### Compliance Classification
At closure, auditor assigns final classification to each observation:
- **NAI** — No Action Indicated
- **VAI** — Voluntary Action Indicated
- **OAI** — Official Action Indicated

---

## Phase 9: SURVEILLANCE (Optional)

**Owner:** Auditor | **Goal:** Follow-up audit to verify CAPA effectiveness

A new `AuditRequestMaster` or `Assessment` is created linked to the original, with:
- Previous audit's findings as baseline
- Targeted scope on CAPA items
- Shorter questionnaire focused on verification

---

## Cross-Cutting: Questionnaire Auto-fill (AI)

```
POST /api/questionnaires/upload         Upload questionnaire file (Word/PDF)
POST /api/ai-prefill/:auditId           Trigger Gemini AI pre-fill
GET  /api/questionnaires/preview/:id    Preview pre-filled answers
POST /api/questionnaires/apply/:id      Apply AI suggestions
```

**Flow:**
1. `questionnaireUploadController.js` receives Word/PDF
2. `questionnaireExtractionService.js` parses text with pdf-parse / mammoth
3. `questionnaireGeminiService.js` sends to Gemini API with ICH Q7 context
4. AI returns suggested answers mapped to question IDs
5. `PreAuditQuestionnaire.responses[]` populated
6. Supplier reviews and submits

---

## Cross-Cutting: AuditRAG (AI Report Generation)

```
POST /api/audit-rag/:auditId/query      Query audit knowledge
POST /api/audit-rag/:auditId/ingest     Ingest artifact for RAG
```

**Flow:**
1. `auditRagController.js` receives query
2. `askHawkKnowledgeService.js` retrieves relevant KB chunks
3. Combines with audit evidence metadata
4. LLM generates narrative (ICH Q7 / WHO-GMP framing)
5. Result fed into `AuditReport.renderedBlocks[]`

---

## Feature Flag Dependencies

| Flag | Affects |
|------|---------|
| `ENABLE_PREP_PHASE` | Whether PREP phase is enforced |
| `ENFORCE_AUDIT_PARTICIPANTS` | Validates participant roles at each phase |
| `ALLOW_EARLY_ARTIFACT_SEND` | Bypass phase prerequisites for artifact sending |
| `ENABLE_AUDIT_EVENT_LOG` | Creates AuditEvent records in addition to AuditTrail |
| `ENABLE_NEW_REQUEST_IDS` | Uses hawkeyeRequestId format |

---

## Role Permissions by Phase

| Phase | Owner | Can Write | Can Read |
|-------|-------|-----------|---------|
| INITIATED | buyer | buyer | buyer, auditor, supplier |
| PREP | supplier | supplier | supplier, auditor, buyer |
| PLANNING | auditor | auditor | auditor, buyer, supplier |
| SCHEDULING | auditor | auditor | auditor, buyer, supplier |
| EXECUTION | auditor | auditor | auditor, supplier (read-only) |
| REPORTING | auditor | auditor | auditor, buyer |
| CAPA | supplier | supplier | supplier, auditor, buyer |
| CLOSURE | buyer | buyer | buyer, auditor |

---

## Notification Events Fired

| Event | Trigger | Recipients |
|-------|---------|-----------|
| `AUDIT_REQUEST_CREATED` | Audit created | Supplier, Auditor |
| `QUESTIONNAIRE_RELEASED` | Artifact sent to supplier | Supplier |
| `QUESTIONNAIRE_OVERDUE` | Past due date | Supplier, Buyer |
| `EVIDENCE_REJECTED` | Evidence status=failed | Uploader |
| `CERT_EXPIRING` | Certification near expiry | Auditor |
| `CAPA_ASSIGNED` | CAPA status=NEEDS_SUPPLIER | Supplier |
| `CAPA_REWORK` | CAPA status=REWORK_REQUESTED | Supplier |
| `REPORT_READY` | Final report generated | Buyer |
