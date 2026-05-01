/**
 * documentControlBulkController.js
 *
 * AI-driven bulk upload of controlled documents (POST /api/document-control/bulk-upload).
 *
 * Pipeline per file (parallel, concurrency 5):
 *   1. storeDocumentFile() → HawkVault key + url + sha256
 *   2. extractText()       → first ~6000 chars (pdf-parse for PDFs, raw for text/docx)
 *   3. classifyDocumentForControl() → AI metadata + citations + confidence
 *   4. DocumentControl.create() in DRAFT with AI fields + storageRef
 *
 * Output: 207-Multi-Status style envelope so partial failures are visible
 *   { success, total, created, failed, items: [{file, ok, doc?, error?}] }
 *
 * Per Annex 11 / PDA Letter: nothing auto-submits for review; everything
 * lands as DRAFT for the QA Coordinator to review + edit + confirm.
 */
import multer from "multer";
import pdfParse from "pdf-parse";
import { storeDocumentFile } from "../services/digilocker/digilockerStorageService.js";
import { classifyDocumentForControl } from "../services/ai/features/docControl/documentClassifier.js";
import { DocumentControl } from "../models/DocumentControlModel.js";
import { writeAuditTrail } from "../services/auditTrailService.js";

// Multer: 50 files / 25 MB each — same limit per file as single upload.
export const bulkUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 50 },
}).array("files", 50);

// documentType → reviewer role (default; tenant_admin can override later).
const ROUTING_RULES = {
  SOP: "QA Manager",
  POLICY: "Quality Director",
  WORK_INSTRUCTION: "Department Head",
  FORM: "QA Manager",
  SPECIFICATION: "Regulatory Affairs",
  PROTOCOL: "Quality Director",
  REPORT_TEMPLATE: "QA Manager",
  GUIDELINE: "QA Manager",
  REGULATORY_SUBMISSION: "Regulatory Affairs",
  CUSTOM: "QA Manager",
};

const TEXT_BUDGET = 60000; // raw chars before classifier truncates further

const extractText = async ({ buffer, mimeType, fileName }) => {
  const ext = String(fileName || "").toLowerCase().split(".").pop();
  try {
    if (mimeType === "application/pdf" || ext === "pdf") {
      const r = await pdfParse(buffer);
      return String(r.text || "").slice(0, TEXT_BUDGET);
    }
    // Plain text & markdown
    if (mimeType?.startsWith("text/") || ["txt", "md", "csv"].includes(ext)) {
      return buffer.toString("utf-8").slice(0, TEXT_BUDGET);
    }
    // DOCX / XLSX — leave to filename-based fallback for now (mammoth/xlsx
    // is a heavier dependency we can add when needed).
    return "";
  } catch (e) {
    console.warn(`[bulk-upload] text extraction failed for ${fileName}:`, e.message);
    return "";
  }
};

// Lightweight concurrency limiter — runs at most `n` promises at a time.
const mapWithConcurrency = async (items, n, fn) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (e) {
        results[i] = { ok: false, error: e };
      }
    }
  });
  await Promise.all(workers);
  return results;
};

export const bulkUploadDocuments = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const ownerUserId = req.user?._id;
    if (!ownerUserId) return res.status(403).json({ error: "Forbidden" });
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: "No files uploaded" });

    const tenantContext = {
      tenantId: String(req.tenantId),
      userId: String(ownerUserId),
      userRole: req.user?.role,
      linkedEntityType: "document_control",
    };

    // Optional: tenant taxonomy hint to the classifier (recent docTypes seen).
    const recent = await DocumentControl.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 }).limit(15)
      .select("documentType keywords").lean();
    const tenantTaxonomy = Array.from(new Set(recent.flatMap((d) => d.keywords || []))).slice(0, 25);

    const ingest = async (file) => {
      // 1. Store the file in HawkVault.
      const stored = await storeDocumentFile({ file });

      // 2. Extract text for the classifier.
      const text = await extractText({
        buffer: file.buffer,
        mimeType: stored.mimeType,
        fileName: stored.originalFileName,
      });

      // 3. Classify with the AI agent (falls back to skeleton if LLM down).
      const classification = await classifyDocumentForControl({
        fileName: stored.originalFileName,
        extractedText: text,
        tenantTaxonomy,
        tenantContext,
      });
      const c = classification.classified;

      // 4. Auto-route reviewer role: prefer AI suggestion; fall back to type rule.
      const reviewerRole = c.suggestedReviewerRole || ROUTING_RULES[c.documentType] || "QA Manager";

      // 5. Create the DocumentControl record in DRAFT.
      const doc = await DocumentControl.create({
        tenantId: req.tenantId,
        title: c.title,
        documentType: c.documentType,
        versionLabel: "1.0",
        versionMajor: 1,
        versionMinor: 0,
        status: "DRAFT",
        scope: c.scope || undefined,
        description: c.description || undefined,
        keywords: c.keywords,
        complianceStandards: c.complianceStandards,
        ownerId: ownerUserId,
        storageRef: stored.key || undefined,
        // Note: digilockerId left null — bulk path does not pre-create a
        // DigiLockerDocument wrapper. The storageRef alone is enough for
        // download/preview when implemented.
      });

      // Audit trail row — captures what the AI proposed vs what landed.
      await writeAuditTrail({
        tenantId: req.tenantId,
        module: "document_control",
        entityType: "document_control",
        entityId: doc._id,
        action: "BULK_AI_INTAKE",
        actorId: ownerUserId,
        actorRole: req.user?.role,
        meta: {
          source: classification.meta?.source,
          promptVersion: classification.meta?.promptVersion,
          confidence: c.confidence,
          aiSuggestedReviewerRole: c.suggestedReviewerRole,
          appliedReviewerRole: reviewerRole,
          fileSha256: stored.checksumSha256,
          fileName: stored.originalFileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          aiCitations: c.citations,
        },
      });

      return {
        ok: true,
        file: stored.originalFileName,
        sizeBytes: stored.sizeBytes,
        document: {
          _id: doc._id,
          docNumber: doc.docNumber,
          title: doc.title,
          documentType: doc.documentType,
          status: doc.status,
        },
        ai: {
          confidence: c.confidence,
          suggestedReviewerRole: reviewerRole,
          source: classification.meta?.source,
          citations: c.citations?.slice(0, 3),
        },
      };
    };

    const results = await mapWithConcurrency(files, 5, ingest);

    const items = results.map((r, i) =>
      r.ok ? r.value : {
        ok: false,
        file: files[i].originalname || `file-${i}`,
        error: r.error?.message || "Failed",
      }
    );
    const created = items.filter((x) => x.ok).length;
    const failed = items.length - created;

    return res.status(failed === items.length ? 500 : 200).json({
      success: created > 0,
      total: items.length,
      created,
      failed,
      items,
      routingRules: ROUTING_RULES,
    });
  } catch (err) {
    console.error("bulkUploadDocuments error:", err);
    return res.status(500).json({ error: err.message });
  }
};
