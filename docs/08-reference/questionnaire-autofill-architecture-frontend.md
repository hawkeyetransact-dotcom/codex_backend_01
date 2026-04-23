---
doc: questionnaire-autofill-architecture-frontend
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: reference
status: current
---

# Questionnaire Autofill Integration Note

Date: 2026-03-07

This page keeps the existing questionnaire webform intact and layers autofill around it:

1. `app/(console)/audits/[id]/report/page.tsx`
- Loads existing audit questions and renders existing questionnaire UI.
- Calls backend autofill API and maps results into existing `formResponses` state.
- Preserves current save/submit flows (`updateAuditQuestionsData`).
- Adds autofill verification counters:
  - returned recommendations
  - mapped to response patch
  - loaded into form state
  - visibly rendered in enum controls (radio/checkbox)

2. `components/audits/questionnaire.tsx` and `components/audits/QuestionnaireDocQuestion.tsx`
- Existing controls remain unchanged as primary edit path.
- Adds visible autofill indicators (status/confidence/evidence/regulatory context).
- Adds stable `data-*` attributes on enum control inputs for render-level verification.

3. Compatibility
- No redesign of section/subsection/question layout.
- Manual entry/edit remains available.
- Existing draft/save/final submit paths remain unchanged.
