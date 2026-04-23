---
doc: ROLE_FAQ_SEED
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: askhawk
status: current
---

# AskHawk Role FAQ Seed (Crisp User Answers)

Use these QA pairs as direct answer targets for AskHawk retrieval.

## Buyer

### Q: How do I create an audit request?
A: You can create an audit request only as a buyer (or admin with buyer workflow access).  
1. Go to `Procurement -> Request New Audit` (`/request-audit`).  
2. Select supplier, product, and site.  
3. Select ETA/compliance date and templates.  
4. Click submit.  
You can also start from `Discovery -> Supplier Marketplace` and use supplier action flow.  
If the site is already in a live audit, request creation can be blocked.

### Q: Can I create an audit from Supplier Marketplace?
A: Yes.  
1. Open `Supplier Marketplace`.  
2. Search and open supplier card.  
3. Use `Invite to Hawkeye` if needed.  
4. Continue into request creation flow from the supplier context.

### Q: Where do I track request progress?
A: Open `Operations -> Audit Summary` (`/audits`), then open the audit row to review milestones, tracking, artifacts, and logs.

## Supplier / Supplier User

### Q: Can I auto-fill signup/profile from documents?
A: Yes.  
On signup, click `Import from document`, upload files, and review auto-filled fields before submitting.

### Q: Can profile import use DigiLocker documents too?
A: Yes (post-login profile flows).  
You can upload new files, pick specific DigiLocker files, or scan all DigiLocker files, then run profile auto-fill.

### Q: Where do I upload evidence for audits?
A: Use `Assets -> DigiLocker`.  
You can upload and tag evidence there, then attach it to questionnaire questions.

## Auditor

### Q: How do I test execution questionnaire autofill with multiple evidence files?
A:  
1. Open `Operations -> Test Artifacts` (`/test-artifacts`).  
2. Select `Execution Questionnaire`, template, buyer, supplier, site, product.  
3. Click `Select Evidence` and choose multiple files.  
4. Click `Run Test Preview`.  
This runs evidence mapping, questionnaire autofill, compliance check, and report preview payload.

### Q: How do I see all supplier attachments by supplier user?
A: Open audit detail and use supplier attachment view/actions.  
The system groups files by supplier user and shows downloadable links.

### Q: How do I run first compliance check before final report?
A: Use compliance suggestion action from audit detail.  
It runs a question-level compliance check and returns suggested gaps/follow-ups.

### Q: Does final report generation include my comments and follow-ups?
A: Yes.  
Draft report generation includes auditor comments, follow-up text, questionnaire responses, linked supplier evidence, and auditor attachments (audio/photo/file).

### Q: How do I generate CAPAs from observations?
A: Use `Generate CAPAs` from report actions in the audit workflow.  
CAPAs are created from follow-up signals and observation severity/classification.

### Q: Where is the audit log tab?
A: Open audit detail and go to `Audit Log` (`/audits/:id/audit-log`) for user/date/timestamp traceability.

## Admin / Superadmin

### Q: Where do I configure RAG vectors for standards?
A: Use `Admin -> RAG Vector Setup` (`/admin/rag-vectors`).  
Select standard/version, upload guideline files, then run upload/index or reindex.

### Q: How do I sync AskHawk KB after docs/workflow updates?
A: Open `/admin/askhawk` and click `Sync KB From Code`.  
This indexes backend/frontend code knowledge, including docs under `backend/docs`.

### Q: Can I run AskHawk quality checks?
A: Yes.  
Open `/admin/askhawk` and use `Run Eval Suite` to execute quality checks.
