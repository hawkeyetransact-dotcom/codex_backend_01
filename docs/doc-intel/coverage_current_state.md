## Current state – document extraction & SAQ coverage (as of Dec 2025)

**Where things live**
- `src/routes/evidenceRoutes.js` → upload/list/view-token/stream routes for audit evidence.
- `src/controllers/evidenceController.js` → uses `multer` (memory) + `EvidenceService`.
- `src/services/evidenceService.js` → stores encrypted originals/redacted files on disk (`uploads/evidence`), does simple text extraction with `pdf-parse` (whole-file text only), optional OCR for images, issues short-lived view tokens.
- `src/models/evidenceModel.js` → single document per upload (tenantId, auditRequestId, uploader, paths, status, view policy). **No per-page index.**
- Autofill/LLM: `src/controllers/autoFillController.js` pulls limited evidence text (first ~12k chars) and calls OpenAI to draft answers. No coverage mapping.

**What we do not have**
- No `/api/evidence/ingest` or `/api/saq/coverage` endpoints.
- No PSCI SAQ question parsing; no place to cache parsed questions.
- No incremental page-level store; uploads are whole-file only.
- Prior attempts expected zip uploads; current portal uploads are one file at a time.

**Libraries in use**
- `pdf-parse` for PDF text, `pdf2pic` + `tesseract.js` for OCR fallback (not on by default).
- `mammoth` present (not yet used) for DOCX to HTML/text conversion.

**Observed gaps / breakpoints**
- Coverage/autofill attempts were using full-file text slices → unreliable, no provenance.
- No tenant-aware page index, so re-ingestion of single files would require reprocessing everything.
- PSCI SAQ template (≈98 questions) is not parsed anywhere; questions are not available to match against evidence.

**Quick fix plan (agreed scope)**
1) Add incremental evidence index in Mongo:
   - `EvidenceUpload` manifest (tenantId, fileName, sha256, mime, size, pageCount, status/error, uploader).
   - `EvidencePage` per page (tenantId, uploadId, fileName, sha256, mime, pageNumber, text).
2) New endpoints:
   - `POST /api/evidence/ingest` (single PDF upload) → extract per-page text, persist pages, return uploadId/pageCount.
   - `POST /api/saq/coverage` → load PSCI questions (from DOCX), gather tenant evidence pages, keyword-score pages, return per-question confidence + provenance.
3) DOCX parsing:
   - Use `mammoth` → HTML → table parsing; first cell numeric = qnum; capture section header + question text.
   - Cache parsed questions (in-memory or DB by templateId).
4) Scoring:
   - Up to 12 keywords ≥4 chars (ignore stopwords), score by keyword hits.
   - Confidence: HIGH ≥7, MED ≥4, LOW ≥1, NONE 0. Include quote (file + page).
5) Dev script/tests:
   - Ingest sample PDF, run coverage against PSCI DOCX, emit `out/question_coverage.{json,csv}` and print counts.
   - Add minimal tests: question parse count, ingest stores pages, coverage length matches question count, at least one MED/HIGH for sample PDF.

