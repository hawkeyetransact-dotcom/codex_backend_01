import { AuditArtifact } from "../models/auditArtifactModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";

const GEMINI_MODEL = process.env.GEMINI_PREFILL_MODEL || "gemini-1.5-pro-latest";
const CONFIDENCE_THRESHOLD = 0.8;

const normalize = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

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

const callGemini = async ({ prompt }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    const err = new Error("Gemini API key missing");
    err.status = 500;
    throw err;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Gemini error ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? String(text).trim() : null;
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
      .select("_id question")
      .lean();
    if (!questions.length) {
      return res.json({ success: true, data: { fields: [], message: "No template fields found" } });
    }

    const context = buildContext(audit);
    const prompt = buildPrompt({ context, fields: questions });
    const raw = await callGemini({ prompt });
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
      data: { fields: filtered, model: GEMINI_MODEL },
    });
  } catch (error) {
    console.error("prefillArtifact error", error);
    return res.status(500).json({ error: "Failed to prefill artifact" });
  }
};
