# AskHawk KB Sync Runbook (Using Functional Docs as Vector Source)

## Objective
Make AskHawk answers precise by indexing code-grounded workflow docs (including this folder) into tenant KB.

## How indexing already works
The code sync service (`src/services/askHawkKnowledgeService.js`) scans:
- Backend:
  - `src/routes`, `src/controllers`, `src/services`, `src/models`, `src/modules`, `docs`, `README.md`
- Frontend:
  - `app`, `components`, `lib`, `README.md`

Any new markdown in `backend/docs/**` is included in the local code index and can be synced into tenant KB.

## Recommended process after workflow/menu changes
1. Update docs:
- `docs/askhawk/ROLE_FUNCTIONAL_SPEC.md`
- `docs/askhawk/MENU_CLICK_ACTION_INDEX.md`
- `docs/askhawk/ROLE_FAQ_SEED.md`

2. Sync KB for tenant:
- UI path (recommended): `/admin/askhawk` -> `Sync KB From Code`
- API equivalent: `POST /api/askhawk/kb/sync`

3. Validate:
- Check `/admin/askhawk` stats:
  - indexed files
  - indexed chunks
  - tenant synced article count
- Ask role-based questions in AskHawk and confirm citations reference current docs/routes.

4. Quality gate:
- Run eval suite from `/admin/askhawk` (`Run Eval Suite`) or call `POST /api/askhawk/evals/run`.

## Local CLI options
- Seed/sync from backend script:
```bash
npm run seed:askhawk-kb-code
```
- Integration smoke:
```bash
npm run test:askhawk-ingest
```

## Operational guidance
- Keep one canonical answer style in `ROLE_FAQ_SEED.md` for high-frequency user questions.
- Keep route/API mappings updated in `MENU_CLICK_ACTION_INDEX.md`.
- Keep role capabilities and restrictions updated in `ROLE_FUNCTIONAL_SPEC.md`.
- Re-sync KB after each release branch merge that changes workflow behavior.
