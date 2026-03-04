import { runAgenticFormAutofill } from "../services/agenticFormAutofillService.js";

const safeJsonParse = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeRole = (value = "supplier") => {
  const role = String(value || "supplier").trim().toLowerCase();
  return ["supplier", "buyer", "auditor"].includes(role) ? role : "supplier";
};

const buildFailureResponse = (message = "Unable to process autofill request.") => ({
  discovered_form_schema: { source: "none", fields: [] },
  doc_classification: {
    primary_type: "unknown",
    secondary_types: [],
    rationale: [],
    per_document: [],
  },
  extracted_entities: {
    org: { company_name: null, site_name: null, company_alternatives: [], site_alternatives: [] },
    addresses: [],
    geo: { country: null, state: null, city: null, postal_code: null },
    contacts: [],
    ids: { DUNS: null, FEI: null, license_no: null, document_no: null },
    dates: { issue: [], effective: [], inspection: [] },
    source_text_length: 0,
  },
  mapping_result: {},
  autofill_payload: {},
  missing_fields: [],
  followup_questions: [message],
  filled_in_browser: false,
  fill_report: [],
});

export const registerPrefillAgenticFromUpload = async (req, res) => {
  try {
    const uploadedFiles = Array.isArray(req.files)
      ? req.files.filter((file) => file?.buffer)
      : req.file?.buffer
      ? [req.file]
      : [];

    const role = normalizeRole(req.body?.role);
    const discoveredFormSchema =
      safeJsonParse(req.body?.discoveredFormSchema) ||
      safeJsonParse(req.body?.formSchema) ||
      null;
    const formHtml = typeof req.body?.formHtml === "string" ? req.body.formHtml : "";

    const result = await runAgenticFormAutofill({
      files: uploadedFiles,
      discoveredFormSchema,
      formHtml,
      role,
    });
    return res.json(result);
  } catch (err) {
    console.error("registerPrefillAgenticFromUpload error", err);
    return res.status(500).json(buildFailureResponse("Failed to run agentic autofill."));
  }
};
