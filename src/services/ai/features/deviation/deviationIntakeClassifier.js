/**
 * Deviation Intake Classifier — Wave 2 LLM-backed.
 *
 * Auto-suggests on Create:
 *   - classification (CRITICAL / MAJOR / MINOR)
 *   - category (PROCESS / EQUIPMENT / ... per DeviationModel enum)
 *   - patientSafetyImpact + productQualityImpact (one-liners)
 *   - regulatoryReportability flags { fdaFieldAlert, medWatch, euAnnex16 }
 *   - confidence + citations
 *
 * Pattern mirrors capa.draft_rca + audit.draft_observation. Skeleton
 * fallback when LLM unavailable: returns conservative defaults
 * (MINOR / OTHER / no reportability) so the deviation still creates.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "deviation.classify_intake@1.0.0";

const CATEGORY_ENUM = [
  "PROCESS", "EQUIPMENT", "MATERIAL", "DOCUMENTATION", "ENVIRONMENTAL",
  "LABORATORY", "PACKAGING", "STORAGE", "PERSONNEL", "OTHER",
];
const CLASSIFICATION_ENUM = ["CRITICAL", "MAJOR", "MINOR"];

function buildPrompt({ title, description, area, processStep, productName, batchNumbers }) {
  const text = String(description || "").slice(0, 4000);
  const systemPrompt = `You are a senior pharma cGMP QA classifier. You read newly-reported
deviations and propose structured triage so a QA reviewer can route + prioritise
within seconds.

NON-NEGOTIABLE RULES:
1. Every claim MUST carry a citation [N1] (= the narrative supplied below) or
   [F1] (= title/area/processStep metadata).
2. classification MUST be one of: ${CLASSIFICATION_ENUM.join(" | ")}.
3. category MUST be one of: ${CATEGORY_ENUM.join(" | ")}.
4. regulatoryReportability is a strict boolean map — use historical reportability
   triggers per FDA 21 CFR 314.81 (Field Alerts), 803 (MedWatch), EU Annex 16.
5. Output JSON only.

OUTPUT SCHEMA:
- classification           "CRITICAL" | "MAJOR" | "MINOR"
- category                 enum value
- patientSafetyImpact      one sentence (≤ 200 chars)
- productQualityImpact     one sentence (≤ 200 chars)
- regulatoryReportability  { fdaFieldAlert: bool, medWatch: bool, euAnnex16: bool, rationale: string }
- suggestedInvestigatorRole "QA Manager" | "Production Mgr" | "QC Lab Lead" | "Engineering Lead"
- confidence               0–1
- citations                [{ id: "N1"|"F1", excerpt: "≤140 chars" }]`;

  const userPrompt = `Classify this newly-reported deviation.

TITLE:        ${title || "(none)"}
AREA:         ${area || "(none)"}
PROCESS STEP: ${processStep || "(none)"}
PRODUCT:      ${productName || "(none)"}
BATCH(ES):    ${(batchNumbers || []).join(", ") || "(none)"}

NARRATIVE [N1]:
${text}

[F1] = the metadata block above.

Return JSON only.`;
  return { systemPrompt, userPrompt };
}

export async function classifyDeviationIntake(args) {
  const { title, description, area, processStep, productName, batchNumbers, tenantContext, llmConfig } = args;
  if (!description) throw new Error("classifyDeviationIntake: description is required");
  if (!tenantContext?.tenantId) throw new Error("tenantContext.tenantId is required");

  const { systemPrompt, userPrompt } = buildPrompt({ title, description, area, processStep, productName, batchNumbers });

  const synthRetrieval = [
    { docId: "N1", chunkId: "N1", text: `[N1] ${String(description || "").slice(0, 2000)}`, score: 1.0 },
    { docId: "F1", chunkId: "F1", text: `[F1] title=${title || ""} area=${area || ""} step=${processStep || ""} product=${productName || ""}`, score: 1.0 },
  ];

  const result = await groundedGenerate({
    feature: "deviation.classify_intake",
    systemPrompt,
    userPrompt,
    retrievalSet: synthRetrieval,
    outputSchema: {
      requiredFields: [
        "classification", "category", "patientSafetyImpact", "productQualityImpact",
        "regulatoryReportability", "suggestedInvestigatorRole", "confidence", "citations",
      ],
    },
    minConfidence: 0.5,
    requireCitations: true,
    tenantContext: { ...tenantContext, linkedEntityType: "deviation" },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) {
    return {
      ok: true,
      source: "skeleton.fallback",
      classification: {
        classification: "MINOR",
        category: "OTHER",
        patientSafetyImpact: null,
        productQualityImpact: null,
        regulatoryReportability: { fdaFieldAlert: false, medWatch: false, euAnnex16: false, rationale: "LLM unavailable — defer to QA judgement" },
        suggestedInvestigatorRole: "QA Manager",
        confidence: 0,
        citations: [{ id: "F1", excerpt: title || "" }],
      },
      meta: { reason: result.reason, promptVersion: PROMPT_VERSION, auditRecord: result.auditRecord },
    };
  }

  const out = result.output || {};
  const safeClass = CLASSIFICATION_ENUM.includes(out.classification) ? out.classification : "MINOR";
  const safeCat = CATEGORY_ENUM.includes(out.category) ? out.category : "OTHER";

  return {
    ok: true,
    source: "llm.groundedGenerate",
    classification: {
      classification: safeClass,
      category: safeCat,
      patientSafetyImpact: out.patientSafetyImpact || null,
      productQualityImpact: out.productQualityImpact || null,
      regulatoryReportability: out.regulatoryReportability || {},
      suggestedInvestigatorRole: out.suggestedInvestigatorRole || "QA Manager",
      confidence: Number(out.confidence) || 0,
      citations: out.citations || [],
    },
    meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION, auditRecord: result.auditRecord },
  };
}

export const __private = { PROMPT_VERSION };
