---
doc: questionnaire-autofill-test-plan
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: reference
status: current
---

# Questionnaire Autofill Test Plan

## Automated checks

1. Frontend static checks
- `npm run lint`
- `npx tsc --noEmit`

2. Backend static checks
- `npm run lint`

3. Backend autofill metadata test
- `node test/autofillEvidenceMapping.test.js`
- Verifies:
  - evidence references are produced with source document + page
  - status/confidence mapping behaves as expected
  - regulatory references include ICH/CFR citations

## Manual regression checks

1. Manual form behavior unchanged
- Open existing audit questionnaire.
- Manually edit text/radio/checkbox fields.
- Save draft, reopen, confirm values persist.

2. Autofill visibility
- Upload evidence files and run “Scan docs & fill questionnaire”.
- Confirm auto-filled questions show:
  - source highlight/badge
  - confidence
  - status
  - evidence doc + page + snippet
  - regulatory mapping chip/reference

3. Radio/checkbox render verification
- Confirm outcome panel shows:
  - returned, mapped
  - loaded in state
  - visibly rendered
  - enum mapped vs enum visible
- If mismatch occurs, UI should show warning (not success).

4. Fallback mode
- Trigger run with insufficient evidence.
- Confirm “No suggestions found” outcome appears and no fake success is shown.

