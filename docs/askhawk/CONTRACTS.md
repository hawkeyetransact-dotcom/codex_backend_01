---
doc: CONTRACTS
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: askhawk
status: current
---

# AskHawk API Contracts

## Auth & Tenant Contract
1. Authentication: Bearer JWT (`Authorization: Bearer <token>`) or cookie token supported by existing auth middleware.
2. Tenant source of truth: `req.tenantId` from authenticated user context.
3. Client may send `tenantId`, but server must reject tenant mismatch and never query other tenants.

## Feature Flag Contract
1. Backend flag: `ASKHAWK_ENABLED=true` required.
2. When disabled, AskHawk endpoints return `403` with `{ "message": "AskHawk disabled" }` (or equivalent).

## Existing Chat Endpoint
### `POST /api/askhawk/chat`
Purpose: Answer user question with citations from tenant KB and local knowledge.

Request JSON:
```json
{
  "intent": "howto",
  "question": "How do I create an audit request?",
  "role": "BUYER",
  "productArea": "audit_workflow",
  "userId": "optional-user-id",
  "screenId": "/audits/new"
}
```

Response JSON:
```json
{
  "answer": "string",
  "citations": ["string"],
  "actions": ["string"],
  "followUps": ["string"],
  "confidence": 0.91,
  "grounded": true,
  "unsupportedClaims": ["string"],
  "retrieval": {
    "mode": "knowledge",
    "hits": 6,
    "topScore": 0.73,
    "productArea": "audit_workflow"
  }
}
```

## New Ingestion Endpoint (Vertical Slice)
### `POST /api/askhawk/ingest`
Purpose: Upload one document and ingest chunks into tenant KB.

Request:
- Content-Type: `multipart/form-data`
- Field: `file` (required; PDF/DOCX/TXT)
- Optional fields:
  - `role`
  - `productArea`
  - `tags` (comma-separated or JSON array)
  - `title`

Success response:
```json
{
  "message": "Ingested",
  "data": {
    "tenantId": "string",
    "articleId": "string",
    "fileName": "string",
    "mimeType": "string",
    "chunkCount": 24,
    "source": "uploaded_document",
    "citations": [
      "doc:askhawk-doc-abc123#chunk-0",
      "doc:askhawk-doc-abc123#chunk-1"
    ]
  }
}
```

Validation errors:
- `400` invalid/missing file or unsupported mime.
- `401` unauthenticated.
- `403` tenant mismatch or feature disabled.

## Retrieval Contract
1. Retrieval must include tenant filter:
   - `KbChunk.find({ tenantId: req.tenantId, ... })`
2. Retrieval may include role/productArea filters but must not relax tenant boundary.
3. Citations for uploaded docs must include enough provenance for auditability:
   - file name (via metadata)
   - chunk index
   - source slug

## Conversation Persistence Contract
1. Every chat call writes one `HawkConversation` row with:
   - `tenantId`
   - `messages`
   - `citations`
   - `metadata.confidence`, `metadata.grounded`, retrieval info
2. Conversation writes are best-effort but should not cross tenant.

## Frontend Contracts
1. AskHawk launcher shown only when `NEXT_PUBLIC_ASKHAWK_ENABLED=true`.
2. Chat UI calls AskHawk chat endpoint and renders:
   - answer
   - citations
   - confidence/grounded flags
3. Ingest UI uploads file and shows ingestion result counts.
