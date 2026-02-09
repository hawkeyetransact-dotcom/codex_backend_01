# AskHawk Local Knowledge Engine

AskHawk now supports deterministic, application-specific answers without calling external LLM APIs.

## What changed
- AskHawk chat/retrieve now use:
  - Local code knowledge index built from backend + frontend source files.
  - Tenant KB chunks from Mongo (`KbArticle`, `KbChunk`).
- External fallback for app questions has been removed from backend AskHawk flow.
- Responses now include:
  - Concrete citations (`backend/...` or `frontend/...` file references).
  - Related UI routes and backend endpoints when detected.

## Source coverage
The local index scans:
- Backend: `src/routes`, `src/controllers`, `src/services`, `src/models`, `src/modules`, `docs`, `README.md`
- Frontend: `app`, `components`, `lib`, `README.md`

Large/generated folders are skipped (`node_modules`, `.next`, `uploads`, `dist`, `out`, etc.).

## Runtime behavior
- In-memory index is cached with TTL (`ASKHAWK_INDEX_TTL_MS`, default 5 min).
- Retrieval uses lexical + phrase + path/tag boosts.
- AskHawk response generation is rule-based and deterministic.

## Admin endpoints
All endpoints require AskHawk auth context (`tenantId` + role in headers/body/query).

- `GET /api/askhawk/kb/stats`
  - Returns local index stats + tenant KB counts.
  - Roles: `TENANT_ADMIN`, `ADMIN`, `SUPERADMIN`.

- `POST /api/askhawk/kb/sync`
  - Regenerates tenant KB articles/chunks from local code index.
  - Roles: `TENANT_ADMIN`, `ADMIN`, `SUPERADMIN`.
  - Body:
    - `roles?: string[]`
    - `productArea?: string`
    - `maxArticles?: number`
    - `maxChunksPerArticle?: number`

## One-time / scheduled KB sync
Use script:

```bash
npm run seed:askhawk-kb-code
```

Optional args:

```bash
node scripts/seed_askhawk_kb_from_codebase.js --tenant <tenantId> --roles BUYER,AUDITOR,SUPPLIER
node scripts/seed_askhawk_kb_from_codebase.js --max-articles 300 --max-chunks 7
```

## Key env controls
- `ASKHAWK_INDEX_TTL_MS` (default 300000)
- `ASKHAWK_MAX_FILE_SIZE_BYTES` (default 350000)
- `ASKHAWK_MAX_FILES` (default 900)
- `ASKHAWK_WINDOWS_PER_FILE` (default 7)
- `ASKHAWK_WINDOW_LINES` (default 20)
- `ASKHAWK_WINDOW_STEP` (default 12)

