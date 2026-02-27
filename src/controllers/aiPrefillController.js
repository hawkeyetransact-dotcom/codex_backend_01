import { AuditArtifact } from "../models/auditArtifactModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { callLlmService, LLM_MODEL } from "../services/llmServiceClient.js";
import {
  extractAnswers,
  loadEvidenceFromDocUrls,
  loadExecutionEvidenceDataset,
  mergeEvidencePayloads,
} from "./autoFillController.js";

const CONFIDENCE_THRESHOLD = 0.8;

const normalize = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const normalizeYesNo = (value) => {
  const raw = normalize(value).toLowerCase();
  if (["yes", "y", "true"].includes(raw)) return "Yes";
  if (["no", "n", "false"].includes(raw)) return "No";
  if (["na", "n/a"].includes(raw)) return "NA";
  return "";
};

const extractAttachmentUrls = (artifact) => {
  const attachments = Array.isArray(artifact?.data?.attachments) ? artifact.data.attachments : [];
  return Array.from(
    new Set(
      attachments
        .map((item) => String(item?.url || "").trim())
        .filter(Boolean)
    )
  );
};

const toPrefillValue = (answer = {}) => {
  const yesNo = normalizeYesNo(answer?.yesNo || answer?.answer);
  if (yesNo) return yesNo;

  const selected = Array.isArray(answer?.selectedOptions || answer?.choices)
    ? (answer.selectedOptions || answer.choices).map((item) => normalize(item)).filter(Boolean)
    : [];
  if (selected.length) return selected.join(" | ");

  return normalize(answer?.freeText || answer?.answer || "");
};

const buildContext = (audit) => {
  const buyer = audit?.create_by_buyer_id || {};
  const supplier = audit?.supplier_id || {};
  const site = audit?.site_id || {};
  const product = audit?.supplier_product_id || {};
  const buyerProfile = buyer?.profile || {};
  const supplierProfile = supplier?.profile || {};
  const requestId =
    audit?.hawkeyeRequestId ||
    audit?.internalRequestId ||
    audit?.supplierRequestId ||
    audit?._id?.toString() ||
    "";

  return {
    requestId,
    auditETA: audit?.auditETA || audit?.complianceDate || null,
    buyer: {
      name: normalize(buyerProfile?.companyName || `${buyerProfile?.firstName || ""} ${buyerProfile?.lastName || ""}`.trim() || buyer?.email),
      email: buyer?.email || "",
      address: normalize(
        [
          buyerProfile?.addressline1,
          buyerProfile?.addressline2,
          buyerProfile?.addressline3,
          buyerProfile?.city,
          buyerProfile?.state,
          buyerProfile?.country,
          buyerProfile?.zipcode,
        ]
          .filter(Boolean)
          .join(", ")
      ),
    },
    supplier: {
      name: normalize(supplierProfile?.companyName || `${supplierProfile?.firstName || ""} ${supplierProfile?.lastName || ""}`.trim() || supplier?.email),
      email: supplier?.email || "",
      address: normalize(
        [
          supplierProfile?.addressline1,
          supplierProfile?.addressline2,
          supplierProfile?.addressline3,
          supplierProfile?.city,
          supplierProfile?.state,
          supplierProfile?.country,
          supplierProfile?.zipcode,
        ]
          .filter(Boolean)
          .join(", ")
      ),
    },
    site: {
      name: normalize(site?.site_name || site?.plant_id || ""),
      address: normalize(
        [
          site?.address_line1,
          site?.address_line2,
          site?.address_line3,
          site?.city,
          site?.state,
          site?.country,
          site?.zipcode,
        ]
          .filter(Boolean)
          .join(", ")
      ),
    },
    product: {
      name: normalize(product?.name || product?.description || ""),
      dosage: normalize(product?.dosageForm || ""),
      casNumber: normalize(product?.casNumber || ""),
      apiTechnology: normalize(product?.apiTechnology || ""),
    },
  };
};

const buildPrompt = ({ context, fields }) => {
  const instructions = [
    "You are a pharma audit assistant. Use the provided audit context to prefill document template fields.",
    "Return JSON only. Do not include markdown.",
    "Only include fields you are confident about (confidence >= 0.8).",
    "If unsure, omit the field.",
    "Schema: {\"fields\":[{\"questionId\":\"string\",\"value\":\"string\",\"confidence\":0-1}]}",
  ].join("\n");

  return [
    instructions,
    "Audit Context:",
    JSON.stringify(context, null, 2),
    "Template Fields:",
    JSON.stringify(
      fields.map((f) => ({
        questionId: f._id,
        label: f.question,
      })),
      null,
      2
    ),
  ].join("\n\n");
};

const extractJson = (text) => {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    return null;
  }
};

const callLLM = async ({ prompt }) => {
  if (!prompt) return null;
  return callLlmService({ prompt, model: LLM_MODEL, maxTokens: 800, temperature: 0.1 });
};

export const prefillArtifact = async (req, res) => {
  try {
    const { auditId, artifactId } = req.body || {};
    if (!auditId || !artifactId) {
      return res.status(400).json({ error: "auditId and artifactId are required" });
    }

    const audit = await AuditRequestMaster.findById(auditId)
      .populate("create_by_buyer_id")
      .populate("supplier_id")
      .populate("supplier_product_id")
      .populate("site_id");
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    const tenantId = audit.tenantOrgId || req.tenantId || null;
    const artifact = await AuditArtifact.findOne({
      tenantId,
      auditId: audit._id,
      _id: artifactId,
    }).lean();
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    if (!artifact.templateId) {
      return res.json({ success: true, data: { fields: [], message: "No template linked" } });
    }

    const questions = await TemplateQuestions.find({ templateId: artifact.templateId })
      .select("_id question answerType options responseSchema questionCode extractionHints")
      .lean();
    if (!questions.length) {
      return res.json({ success: true, data: { fields: [], message: "No template fields found" } });
    }

    const isExecutionQuestionnaire =
      String(artifact?.artifactType || "").toUpperCase() === "EXECUTION_QUESTIONNAIRE";

    if (isExecutionQuestionnaire) {
      const evidenceDataset = String(req.body?.evidenceDataset || "sai_life_sciences").toLowerCase();
      const includeExecutionDataset = evidenceDataset === "sai_life_sciences" || evidenceDataset === "true";
      const attachmentUrls = extractAttachmentUrls(artifact);
      const supplierUserId = audit?.supplier_id?._id || audit?.supplier_id || null;
      const [urlEvidence, datasetEvidence, profile] = await Promise.all([
        loadEvidenceFromDocUrls(attachmentUrls, { forceOcr: true }),
        includeExecutionDataset
          ? loadExecutionEvidenceDataset(String(audit._id), { forceOcr: true })
          : Promise.resolve({ text: "", files: [], details: [] }),
        supplierUserId
          ? SupplierProfile.findOne({ user_id: supplierUserId }).lean()
          : Promise.resolve(null),
      ]);
      const mergedEvidence = mergeEvidencePayloads(urlEvidence, datasetEvidence);
      if (mergedEvidence?.text) {
        const answers = await extractAnswers(
          questions,
          mergedEvidence.text,
          profile || null,
          mergedEvidence.files || []
        );
        const fields = answers
          .map((answer) => {
            const questionId = String(answer?.id || "");
            if (!questionId) return null;
            const value = toPrefillValue(answer);
            if (!value) return null;
            return {
              questionId,
              value,
              confidence: Number(answer?.confidence || 0.9),
            };
          })
          .filter(Boolean)
          .filter((field) => Number.isFinite(field.confidence) && field.confidence >= CONFIDENCE_THRESHOLD);

        if (fields.length) {
          return res.json({
            success: true,
            data: {
              fields,
              model: LLM_MODEL,
              standardKey: "ICH_Q7_CFR21",
              evidenceFiles: mergedEvidence.files || [],
              message: undefined,
            },
          });
        }
      }
    }

    const context = buildContext(audit);
    const prompt = buildPrompt({ context, fields: questions });
    let raw = null;
    try {
      raw = await callLLM({ prompt });
    } catch (err) {
      console.warn("LLM prefill failed:", err?.message || err);
    }
    const parsed = extractJson(raw);

    const fields = Array.isArray(parsed?.fields) ? parsed.fields : [];
    const filtered = fields
      .filter((f) => f?.questionId && typeof f?.value === "string")
      .map((f) => ({
        questionId: String(f.questionId),
        value: String(f.value),
        confidence: Number(f.confidence || 0),
      }))
      .filter((f) => Number.isFinite(f.confidence) && f.confidence >= CONFIDENCE_THRESHOLD);

    return res.json({
      success: true,
      data: { fields: filtered, model: LLM_MODEL, message: raw ? undefined : "LLM prefill unavailable" },
    });
  } catch (error) {
    console.error("prefillArtifact error", error);
    return res.json({ success: true, data: { fields: [], message: "LLM prefill unavailable" } });
  }
};
