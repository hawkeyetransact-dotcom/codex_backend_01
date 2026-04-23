---
doc: DECISIONS
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: askhawk
status: current
---

# AskHawk Architecture Decisions

## Scope
This document captures decisions for an in-app AskHawk assistant that answers from tenant-scoped uploaded documents with citations.

## Current System (Observed)
1. AskHawk backend already exists:
   - Routes: `src/routes/askHawkRoutes.js`
   - Controller: `src/controllers/askHawkController.js`
   - Models: `KbArticle`, `KbChunk`, `HawkConversation`, `HawkUnanswered`
2. AskHawk frontend already exists:
   - Launcher: `components/audits/askHawk.tsx`
   - Drawer: `components/askhawk/AskHawkDrawer.tsx`
   - API client: `lib/askHawkApi.ts`
3. Tenant context currently comes from JWT (`authenticate`) but AskHawk currently accepts tenant from body/header/query via `authorizeAskHawk`.
4. Existing KB retrieval includes:
   - Local codebase knowledge (deterministic local index)
   - Tenant KB chunks from Mongo (`KbChunk`) via lexical + embedding score
5. Conversation persistence already exists in `HawkConversation`.

## Mandatory Security Decision
1. AskHawk endpoints must require authenticated identity and tenant binding.
2. `tenantId` used for retrieval must resolve from authenticated context (`req.tenantId`) and not trust arbitrary client-provided tenant values.
3. All ingestion and retrieval queries must filter by the same tenant.

## Storage & Vector Strategy
1. Use existing Mongo models (`KbArticle`, `KbChunk`) for tenant document KB.
2. Store document-level metadata in article and chunk-level citation metadata in `KbChunk.metadata`.
3. Keep vectors in `KbChunk.embedding` (already supported).

## Parsing/Extraction Strategy
1. Reuse existing parser utility: `extractTextFromBuffer` from `src/services/questionnaireExtractionService.js`.
2. Supported formats for this vertical slice:
   - PDF (`application/pdf`)
   - DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
   - TXT (`text/plain`)

## Chat Strategy
1. Reuse existing `POST /api/askhawk/chat` pipeline.
2. Keep non-streaming response for vertical slice.
3. Ensure citations from uploaded docs are preserved and returned.

## UI Strategy
1. Reuse existing AskHawk drawer in layout (already integrated in header).
2. Add minimal file-ingestion UI in drawer/admin surface to trigger backend ingest endpoint.

## Feature Flag Strategy
1. Backend gate: `ASKHAWK_ENABLED`.
2. Frontend gate: `NEXT_PUBLIC_ASKHAWK_ENABLED`.
3. If disabled:
   - UI should hide launcher.
   - API endpoints should return feature-disabled error (403/404 pattern consistent with current app behavior).

## Deployment/Runtime Constraints (Observed)
1. Backend runtime:
   - Node 18 (`Dockerfile`, `apprunner.yaml`)
   - Express + Mongo
2. Existing upload modes:
   - Local filesystem: `uploads/` when `UPLOADS_MODE=local`
   - S3 when configured (`src/utils/s3Upload.js`)
3. AskHawk must not depend on extra infrastructure for this slice.

## PROPOSED DEFAULTS
1. PROPOSED DEFAULT: Vector store
   - Mongo (`KbChunk.embedding`) for immediate compatibility and zero new infra.
2. PROPOSED DEFAULT: Embedding model
   - `text-embedding-3-small` when `OPENAI_API_KEY` exists
   - deterministic hash fallback from `AskHawkEmbeddingService` when unavailable
3. PROPOSED DEFAULT: Chunking
   - `chunkSize=1200` characters
   - `chunkOverlap=200` characters
   - hard cap `maxChunksPerDoc=200`
4. PROPOSED DEFAULT: Retrieval
   - topK = 6 for chat grounding
   - rerank existing mixed score (semantic + lexical + citation/path boosts)
5. PROPOSED DEFAULT: Streaming
   - disabled for this slice (non-streaming JSON)
   - future upgrade path: SSE streaming endpoint `/api/askhawk/chat/stream`
6. PROPOSED DEFAULT: Citation format
   - `doc:<articleSlug>#chunk-<n>` plus filename and chunk metadata in `KbChunk.metadata`

## Non-Goals For This Slice
1. No refactor of existing AskHawk intent routing.
2. No external vector DB introduction.
3. No cross-tenant/global search.
4. No multi-modal OCR deep pipeline changes beyond current parser utility.
