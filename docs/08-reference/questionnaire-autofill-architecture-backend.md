---
doc: questionnaire-autofill-architecture-backend
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: reference
status: current
---

# Questionnaire Autofill Architecture (Current State)

Date: 2026-03-07  
Scope: Existing audit questionnaire flow (no UI redesign)

## 1) End-to-End Flow

1. Supplier opens questionnaire page: `frontend/app/(console)/audits/[id]/report/page.tsx`.
2. Questions are loaded from:
   - `getAuditQuestionsByRequestId(...)` (frontend action)
   - backend `AuditQuestions` documents (`auditRequestId` scoped).
3. Supplier clicks **Scan docs & fill questionnaire**:
   - frontend `handleAutoFill()` posts to `/api/next/auditor/auto-fill/:auditRequestId`
   - backend `autoFillAuditQuestions` (`src/controllers/autoFillController.js`) extracts evidence from:
     - question-linked `docUrls`
     - audit request attachments (`Document`, context `audit_request_attachment`)
     - DigiLocker docs (`DigiLockerService`)
     - supplier profile fallback
4. Backend returns recommended answers + evidence source stats; frontend maps them into existing `formResponses` state and keeps current form controls.
5. Save path remains unchanged:
   - frontend `saveFormResponses(...)` -> `updateAuditQuestionsData(...)`
   - backend `updateAuditResponses` (`src/controllers/auditorController.js`) persists into existing fields (`YesNoAnswers`, `textResponse`, `docUrls`, `responseDetails`, etc.).

## 2) Existing State & Schema Mapping

Frontend state (per question id):
- `formResponses[questionId]` contains editable fields:
  - `YesNoAnswers` / `textResponse` / `docUrls` / `responseDetails`
  - auditor fields and flags
  - `autoFillMeta` (display metadata)

Rendered question model:
- `enhancedQuestions = questionsData + formResponses overlay`.
- This preserves existing UI layout while allowing autofill overlays.

Backend model:
- `AuditQuestions` (`src/models/auditQuestionsModels.js`) is the source of truth for persisted questionnaire answers.
- Existing save/update/export/report flows depend on the same model and were preserved.

## 3) Control Rendering Paths

- Doc-layout questions: `components/audits/QuestionnaireDocQuestion.tsx`
  - dynamic blocks (`yesno`, `checkboxes`, `text`, `upload`) from `responseSchema.layout.blocks`.
- Legacy/manual questions: `components/audits/SmartQuestion` and inline supplier controls in `components/audits/questionnaire.tsx`.

## 4) Root Cause of Radio/Checkbox Mismatch (Observed Risk)

Mismatch occurred because “mapped” count was computed at payload/patch stage only.  
It did **not** verify all 4 stages:
1. recommendation output,
2. mapped payload value,
3. value loaded into exact form state key used by rendered control,
4. rendered control visibly selected.

Additional mismatch contributors:
- option normalization differences (label vs expected option value),
- async render timing after state patch,
- mixed control paths (doc-layout vs non-doc layout) with slightly different value wiring.

## 5) Required Non-Breaking Fix Strategy

- Keep current questionnaire UI/layout and save flow unchanged.
- Strengthen autofill adapter to:
  - normalize option mapping per question type,
  - track per-question autofill metadata (status, confidence, evidence refs, regulatory refs),
  - verify render-level selection for enum controls before claiming success.
- Show visible per-question autofill evidence/regulatory tags in existing question row/card areas.

## 6) Compatibility Guarantees

- No replacement of questionnaire UI.
- No change to section/subsection/question visible structure.
- Manual editing remains primary and always allowed where currently allowed.
- Draft save/submit/approval/export API contracts remain intact.
