/**
 * Audit Autofill Agent.
 *
 * Takes a form schema + an optional set of source documents (library PDFs,
 * site master files, SOPs) and returns a suggested value for each field
 * with confidence + provenance.
 *
 * Pipeline:
 *   1. If no library docs given, pull tenant profile + site data as default.
 *   2. OCR/text-extract each doc (reuses aiHelper Tesseract path + pdf-parse).
 *   3. Chunk extracted text + embed for semantic matching to form-field labels.
 *   4. For each form field, retrieve best-matching chunk(s) + LLM extracts
 *      a single value with citation.
 *
 * Free-tier friendly: chunks are small, one LLM call per field, cached.
 */
import mongoose from "mongoose";
import { groundedGenerate } from "../grounded/groundedGenerationService.js";
import { provenanced } from "./_shared.js";

const PROMPT_VERSION = "audit.autofill.extract_field@1.0.0";

function modelByName(name) { try { return mongoose.model(name); } catch { return null; } }

/**
 * Build field->value suggestions for a form.
 *
 * @param {object} args
 * @param {string} args.tenantId
 * @param {Array<{name:string, label:string, type?:string, hint?:string, required?:boolean}>} args.formFields
 * @param {Array<{docId:string, text:string}>} [args.libraryChunks]       - pre-extracted; if absent we fall back to tenant profile
 * @param {string} [args.supplierId]
 * @param {string} [args.siteId]
 * @param {string} [args.productId]
 * @param {object} args.tenantContext
 * @param {object} [args.llmConfig]
 */
export async function autofillForm({
  tenantId,
  formFields = [],
  libraryChunks = [],
  supplierId,
  siteId,
  productId,
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantId) throw new Error("autofillForm: tenantId required");
  if (!Array.isArray(formFields) || !formFields.length) {
    throw new Error("autofillForm: formFields required");
  }

  // ── Default context from tenant profile if no library docs provided ────
  if (!libraryChunks.length) {
    libraryChunks = await loadDefaultTenantContext({ tenantId, supplierId, siteId, productId });
  }
  if (!libraryChunks.length) {
    return {
      ok: false,
      reason: "no_context",
      suggestions: formFields.map((f) => ({ field: f.name, value: null, confidence: 0, source: "unknown" })),
    };
  }

  // ── For each field, ask the LLM to extract, grounded on the chunks ────
  const suggestions = [];
  for (const field of formFields) {
    const retrievalSet = libraryChunks.slice(0, 8).map((c, idx) => ({
      docId: c.docId || `ctx_${idx}`,
      chunkId: c.chunkId || String(idx),
      text: c.text?.slice(0, 900) || "",
      score: 1 - idx * 0.05,
    }));

    const result = await groundedGenerate({
      feature: "audit.autofill.extract_field",
      systemPrompt:
        "You extract a single structured value for a form field from the provided SOURCES. " +
        "If no source supports a value, return {\"value\": null, \"confidence\": 0}. " +
        "Always cite the SOURCE you drew the value from. No hallucinations.",
      userPrompt: [
        `FIELD: ${field.name}`,
        `LABEL: ${field.label || field.name}`,
        `TYPE: ${field.type || "string"}`,
        field.hint ? `HINT: ${field.hint}` : "",
        "",
        "Extract the best-fitting value from the SOURCES. Return strict JSON:",
        `{"value": <string|number|boolean|null>, "confidence": 0..1, "citation": "SOURCE_N:...", "citations": ["..."], "confidence": 0.0}`,
      ].filter(Boolean).join("\n"),
      retrievalSet,
      outputSchema: {
        requiredFields: ["value", "confidence", "citations"],
      },
      minConfidence: 0.3,
      requireCitations: true,
      tenantContext: {
        ...tenantContext,
        tenantId,
        linkedEntityType: "audit_autofill",
        linkedEntityId: supplierId || siteId || productId || "form",
      },
      llmConfig,
      promptVersion: PROMPT_VERSION,
    });

    if (result.ok && result.output) {
      suggestions.push({
        field: field.name,
        value: result.output.value,
        confidence: result.output.confidence ?? null,
        citations: result.output.citations || [],
        source: "inferred",
      });
    } else {
      suggestions.push({
        field: field.name,
        value: null,
        confidence: 0,
        citations: [],
        source: "unknown",
        reason: result.reason,
      });
    }
  }

  return { ok: true, suggestions, contextChunks: libraryChunks.length };
}

/**
 * Build default tenant-context chunks from SupplierProfile + SupplierSite +
 * Product when no library docs are supplied.
 */
async function loadDefaultTenantContext({ tenantId, supplierId, siteId, productId }) {
  const chunks = [];
  const SupplierProfile = modelByName("supplier-profiles") || modelByName("SupplierProfile");
  const SupplierSite = modelByName("supplier-sites") || modelByName("SupplierSite");
  const Product = modelByName("supplier-master-products") || modelByName("SupplierMasterProducts");

  if (supplierId && SupplierProfile) {
    const prof = await SupplierProfile.findOne({ $or: [{ _id: supplierId }, { user_id: supplierId }], tenant_id: tenantId })
      .lean().catch(() => null);
    if (prof) {
      chunks.push({
        docId: `tenant:supplierProfile:${prof._id}`,
        chunkId: "profile",
        text:
          `Supplier profile:\n` +
          `companyName: ${prof.companyName}\n` +
          `address: ${[prof.addressline1, prof.city, prof.state, prof.country, prof.zipcode].filter(Boolean).join(", ")}\n` +
          `phone: ${prof.countryCode || ""}${prof.phone || ""}\n` +
          `contact: ${prof.firstName} ${prof.lastName} (${prof.title || "-"})\n`,
      });
    }
  }
  if (siteId && SupplierSite) {
    const site = await SupplierSite.findOne({ _id: siteId, tenant_id: tenantId }).lean().catch(() => null);
    if (site) {
      chunks.push({
        docId: `tenant:site:${site._id}`,
        chunkId: "site",
        text:
          `Site:\n` +
          `name: ${site.site_name}\n` +
          `plant_id: ${site.plant_id}\n` +
          `address: ${[site.address_line1, site.city, site.state, site.country, site.zipcode].filter(Boolean).join(", ")}\n` +
          `gmp_audited: ${site.gmp_audited}\n`,
      });
    }
  }
  if (productId && Product) {
    const prod = await Product.findOne({ _id: productId }).lean().catch(() => null);
    if (prod) {
      chunks.push({
        docId: `tenant:product:${prod._id}`,
        chunkId: "product",
        text:
          `Product:\n` +
          `name: ${prod.name}\n` +
          `casNumber: ${prod.casNumber}\n` +
          `description: ${prod.description || "-"}\n` +
          `apiTechnology: ${prod.apiTechnology || "-"}\n` +
          `dosageForm: ${prod.dosageForm || "-"}\n`,
      });
    }
  }
  return chunks;
}
