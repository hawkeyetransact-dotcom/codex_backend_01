/**
 * Complaint Triage AI agent (Wave 3, roadmap item promoted to live).
 *
 * Given a fresh complaint, suggests:
 *   - severity (CRITICAL / MAJOR / MINOR / INFORMATIONAL)
 *   - MDR reportability flag
 *   - regulatory deadline in days (FAR / MDR)
 *   - similar past CAPAs (text match against linkedCAPAIds in tenant)
 *
 * Uses the grounded-generation runtime so the suggestion is audit-trailed.
 */
import { groundedGenerate } from "../grounded/groundedGenerationService.js";
import { buildSupplierContextForAi } from "../../crossModule/supplierQualityEventService.js";

const PROMPT_VERSION = "complaint.triage@1.1.0";

const SYSTEM_PROMPT = `
You are a pharma quality triage assistant trained on 21 CFR 820.198 (medical
device complaint files), 21 CFR 211.198 (drug complaint files), and 21 CFR 803
(MDR reporting).

Given a complaint description, classify it and propose:
  - severity: CRITICAL (patient harm / death possible) | MAJOR (product-quality
    issue affecting fitness for use) | MINOR (cosmetic / non-functional) |
    INFORMATIONAL (feedback only)
  - isMedicalDeviceReport: true if the product is a medical device AND the
    complaint involves death, serious injury, or malfunction that could cause
    harm. Otherwise false.
  - requiresRegulatoryReporting: true if severity=CRITICAL OR isMedicalDeviceReport=true
  - recommendedDeadlineDays: 5 if MDR or CRITICAL with patient impact; 30 otherwise
  - regulatoryBodies: ["FDA_MEDWATCH","EU_VIGILANCE"] for MDR; ["FDA_MEDWATCH"] if SAFETY-related; [] otherwise
  - rationale: one sentence
  - confidence: 0.0-1.0

OUTPUT (strict JSON):
{
  "severity": "CRITICAL|MAJOR|MINOR|INFORMATIONAL",
  "isMedicalDeviceReport": true|false,
  "requiresRegulatoryReporting": true|false,
  "recommendedDeadlineDays": 5|15|30,
  "regulatoryBodies": [],
  "rationale": "...",
  "confidence": 0.0
}
`.trim();

export async function triageComplaint({
  tenantId,
  tenantOrgKey,           // optional — for V1 CAPA scoping in supplier history lookup
  complaintId,
  supplierId,             // NEW — drives supplier-history injection
  title,
  description,
  complaintType,
  source,
  productName,
  isMedicalDevice,
  retrievalSet = [],
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantId) throw new Error("triageComplaint: tenantId required");
  if (!description) throw new Error("triageComplaint: description required");

  // Pull headline supplier history if a supplier is linked.
  // The agent uses this to up-weight severity for repeat-offender suppliers.
  const supplierContext = await buildSupplierContextForAi({ tenantId, tenantOrgKey, supplierId }).catch(() => null);
  const supplierBlock = supplierContext
    ? [
        "",
        "SUPPLIER HISTORY (factor this into severity — repeat issues warrant escalation):",
        `  Open CAPAs: ${supplierContext.open.capas} · Open deviations: ${supplierContext.open.deviations} · Open complaints: ${supplierContext.open.complaints}`,
        `  Recently closed (90d): ${supplierContext.recentlyClosed.capas} CAPAs · ${supplierContext.recentlyClosed.deviations} deviations · ${supplierContext.recentlyClosed.complaints} complaints`,
        ...(supplierContext.topOpenCapas.length ? ["  Top open CAPAs:", ...supplierContext.topOpenCapas.map((c) => `    - [${c.severity}] ${c.title} (${c.status})`)] : []),
        ...(supplierContext.topOpenDeviations.length ? ["  Top open deviations:", ...supplierContext.topOpenDeviations.map((d) => `    - [${d.classification}] ${d.title}`)] : []),
      ].join("\n")
    : "";

  const userPrompt = [
    `Complaint title: ${title || "(untitled)"}`,
    `Type: ${complaintType || "OTHER"}`,
    `Source: ${source || "OTHER"}`,
    `Product: ${productName || "(not specified)"}`,
    `Medical device: ${isMedicalDevice ? "yes" : "no"}`,
    "",
    `Description:`,
    description,
    supplierBlock,
  ].join("\n");

  const result = await groundedGenerate({
    feature: "complaint.triage",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    retrievalSet,
    outputSchema: {
      requiredFields: [
        "severity",
        "isMedicalDeviceReport",
        "requiresRegulatoryReporting",
        "recommendedDeadlineDays",
        "regulatoryBodies",
        "rationale",
        "confidence",
      ],
    },
    minConfidence: 0.4,
    requireCitations: false,
    tenantContext: {
      ...tenantContext,
      tenantId,
      linkedEntityType: "complaint",
      linkedEntityId: complaintId,
    },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  return {
    ok: result.ok,
    triage: result.output,
    reason: result.reason,
    message: result.message,
    meta: result.meta,
  };
}

export const __private = { PROMPT_VERSION };
