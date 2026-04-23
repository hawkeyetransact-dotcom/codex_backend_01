---
doc: FLOWS
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: askhawk
status: current
---

# AskHawk Flows

## 1) Authentication + Tenant Resolution Flow
1. User logs in and gets JWT with tenant context.
2. Request enters `authenticate` middleware:
   - validates token
   - loads user
   - sets `req.tenantId` and `req.user`
3. AskHawk middleware builds context from authenticated identity:
   - `req.askContext = { tenantId: req.tenantId, role: req.user.role }`
4. Any explicit tenant passed by caller must match `req.tenantId`.

## 2) Ingestion Flow (Uploaded Documents)
1. User uploads PDF/DOCX/TXT to `POST /api/askhawk/ingest`.
2. Multer reads file into memory.
3. `extractTextFromBuffer` extracts text.
4. Text is normalized and split into overlapping chunks.
5. For each chunk:
   - embedding generated (`AskHawkEmbeddingService.embedText`)
   - row inserted into `KbChunk` with `tenantId`, `articleId`, `chunkOrder`, `metadata.citation`
6. `KbArticle` stores document-level metadata.
7. API returns article/chunk counts and citations.

## 3) Chat Flow
1. UI sends `question`, `intent`, optional `productArea`.
2. Server routes query mode (`faq`, `tool`, `knowledge`, etc.).
3. In knowledge mode:
   - query local code knowledge index
   - query tenant KB chunks (`KbChunk`) filtered by `tenantId`
   - rerank + compose grounded response
4. Response includes answer + citations + quality metadata.
5. Conversation persisted in `HawkConversation`.

## 4) Citation Flow
1. Ingestion writes citation strings in chunk metadata (`doc:<slug>#chunk-<n>`).
2. DB retrieval passes citation into AskHawk hit model.
3. `validateAndNormalizeCitations` filters malformed citations.
4. Final response includes normalized citation list.

## 5) Feature Flag Flow
1. `ASKHAWK_ENABLED=false`:
   - backend AskHawk routes reject calls.
2. `NEXT_PUBLIC_ASKHAWK_ENABLED=false`:
   - frontend launcher/chat hidden.

## 6) Failure Flow
1. Unsupported file type on ingest:
   - return `400` with clear message.
2. No extractable text:
   - return `422` with “no text extracted”.
3. Tenant mismatch:
   - return `403`.
4. No relevant knowledge hits:
   - return low-confidence grounded fallback with follow-up prompts.
