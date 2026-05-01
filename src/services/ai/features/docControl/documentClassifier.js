/**
 * Document Control Classifier — Wave 2 LLM-backed.
 *
 * Used by the bulk-upload pipeline. Reads extracted text from a HawkVault
 * file and returns structured metadata (title, documentType, scope, etc.)
 * with mandatory per-field citations and a confidence score.
 *
 * Falls back to a deterministic skeleton if the LLM is unavailable (same
 * pattern as observation drafter): the file still lands as DRAFT but
 * documentType defaults to "CUSTOM" + confidence: 0.0, so the QA
 * Coordinator must manually classify.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";
import { buildDocumentClassifierPrompt, __enums } from "./documentClassifierPrompt.js";

const PROMPT_VERSION = "doc.classify@1.0.0";

export async function classifyDocumentForControl(args) {
  const {
    fileName,
    extractedText,
    tenantTaxonomy = [],
    tenantContext,
    llmConfig,
  } = args;

  if (!fileName) throw new Error("classifyDocumentForControl: fileName is required");
  if (!tenantContext?.tenantId) throw new Error("classifyDocumentForControl: tenantContext.tenantId is required");

  const { systemPrompt, userPrompt } = buildDocumentClassifierPrompt({
    fileName,
    extractedText,
    tenantTaxonomy,
  });

  // Build a synthetic retrievalSet so the citation gate can verify the
  // model picked supplied IDs. We chunk the extracted text into ~1500-char
  // page-shaped chunks; the model's [Pn] markers then map to chunks.
  const chunks = [];
  const text = String(extractedText || "");
  const PAGE_SIZE = 1500;
  for (let i = 0; i < text.length && chunks.length < 5; i += PAGE_SIZE) {
    const slice = text.slice(i, i + PAGE_SIZE);
    chunks.push({
      docId: `P${chunks.length + 1}`,
      chunkId: `P${chunks.length + 1}`,
      text: `[P${chunks.length + 1}] ${slice}`,
      score: 1.0,
    });
  }
  // Filename pseudo-chunk for [F1] citations.
  chunks.push({ docId: "F1", chunkId: "F1", text: `[F1] ${fileName}`, score: 1.0 });

  const result = await groundedGenerate({
    feature: "doc.bulk_classify",
    systemPrompt,
    userPrompt,
    retrievalSet: chunks,
    outputSchema: {
      requiredFields: [
        "title",
        "documentType",
        "scope",
        "description",
        "keywords",
        "complianceStandards",
        "suggestedReviewerRole",
        "confidence",
        "citations",
      ],
    },
    minConfidence: 0.5,
    requireCitations: true,
    tenantContext: {
      ...tenantContext,
      linkedEntityType: tenantContext.linkedEntityType || "document_control",
    },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) {
    // Skeleton fallback — never block the bulk upload because of LLM hiccup.
    // The doc still lands as DRAFT; the user can classify manually.
    const cleanName = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    return {
      ok: true,
      classified: {
        title: cleanName.slice(0, 80) || "(untitled)",
        documentType: guessFromFilename(fileName),
        scope: null,
        description: null,
        keywords: [],
        complianceStandards: [],
        suggestedReviewerRole: "QA Manager",
        confidence: 0,
        citations: [{ id: "F1", excerpt: fileName }],
      },
      meta: {
        source: "skeleton.fallback",
        reason: result.reason,
        promptVersion: PROMPT_VERSION,
        auditRecord: result.auditRecord,
      },
    };
  }

  // Defensive validation against the enums — model can drift.
  const out = result.output || {};
  const safeType = __enums.DOCUMENT_TYPES.includes(out.documentType) ? out.documentType : "CUSTOM";
  const safeRole = __enums.REVIEWER_ROLES.includes(out.suggestedReviewerRole)
    ? out.suggestedReviewerRole
    : "QA Manager";
  const safeStandards = Array.isArray(out.complianceStandards)
    ? out.complianceStandards.filter((s) => __enums.COMPLIANCE_STANDARDS.includes(s))
    : [];

  return {
    ok: true,
    classified: {
      title: String(out.title || fileName).slice(0, 80),
      documentType: safeType,
      scope: out.scope || null,
      description: out.description || null,
      keywords: Array.isArray(out.keywords) ? out.keywords.slice(0, 12) : [],
      complianceStandards: safeStandards,
      suggestedReviewerRole: safeRole,
      confidence: Number(out.confidence) || 0,
      citations: Array.isArray(out.citations) ? out.citations.slice(0, 10) : [],
    },
    meta: {
      source: "llm.groundedGenerate",
      llm: result.llmMeta,
      promptVersion: PROMPT_VERSION,
      auditRecord: result.auditRecord,
    },
  };
}

// Last-ditch documentType guess from the file name, used only by the
// skeleton fallback. Strict enum match — anything else returns "CUSTOM".
function guessFromFilename(name) {
  const lower = String(name || "").toLowerCase();
  if (/\bsop[-_ ]/.test(lower)) return "SOP";
  if (/\bpolicy\b/.test(lower)) return "POLICY";
  if (/\bspec(ification)?\b/.test(lower)) return "SPECIFICATION";
  if (/\bprotocol\b/.test(lower)) return "PROTOCOL";
  if (/\b(wi|work[-_ ]?instruction)\b/.test(lower)) return "WORK_INSTRUCTION";
  if (/\bform[-_ ]/.test(lower)) return "FORM";
  if (/\bguideline\b/.test(lower)) return "GUIDELINE";
  return "CUSTOM";
}

export const __private = { PROMPT_VERSION };
