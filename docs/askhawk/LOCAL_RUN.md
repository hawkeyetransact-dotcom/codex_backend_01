# AskHawk Local Run

## Prerequisites
1. Node 18+
2. MongoDB available via `MONGO_URI` (or use memory fallback for tests)
3. Backend and frontend running

## Backend Setup
1. In `backend/.env` ensure:
```env
MONGO_URI=<your_mongo_uri>
JWT_SECRET=<your_secret>
ASKHAWK_ENABLED=true
OPENAI_API_KEY=<optional>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```
2. Install and run:
```bash
npm ci
npm run dev
```

## Frontend Setup
1. In `frontend/.env.local` ensure:
```env
NEXT_PUBLIC_ASKHAWK_ENABLED=true
```
2. Install and run:
```bash
npm ci
npm run dev
```

## Manual Test (Vertical Slice)
1. Login with a tenant-bound user.
2. Open AskHawk drawer in app layout.
3. Ingest a file (`.pdf`, `.docx`, `.txt`) through AskHawk ingestion UI.
4. Ask a question whose answer exists in uploaded file.
5. Confirm response includes citations.

## API Smoke Test
1. Ingest:
```bash
curl -X POST http://localhost:8101/api/askhawk/ingest \
  -H "Authorization: Bearer <token>" \
  -F "file=@./test/sample.txt" \
  -F "role=AUDITOR"
```
2. Ask:
```bash
curl -X POST http://localhost:8101/api/askhawk/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"<question from sample>\",\"intent\":\"howto\"}"
```

## Automated Test/Script
1. Run backend tests:
```bash
npm test
```
2. Run AskHawk vertical-slice test script (added in this change set):
```bash
node test/askHawkIngestChat.integration.test.js
```

## Troubleshooting
1. `tenantId required`:
   - ensure JWT token has tenant context and request uses authenticated route.
2. `AskHawk disabled`:
   - set `ASKHAWK_ENABLED=true`.
3. No citations:
   - ensure ingestion succeeded and question matches uploaded content.
