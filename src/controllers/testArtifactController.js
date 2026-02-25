import mongoose from "mongoose";
import { User } from "../models/userModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { ReportTemplate } from "../models/reportTemplateModel.js";
import { AUDIT_ARTIFACT_TYPES } from "../constants/auditPhases.js";
import { resolveTemplateTypesForArtifact } from "../utils/templateDefaults.js";
import { callLlmService, LLM_MODEL } from "../services/llmServiceClient.js";
import { mergeReportTemplate } from "../utils/reportTemplateEngine.js";

const normalize = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const normalizeText = (value) => normalize(value).toLowerCase();
const todayIso = () => new Date().toISOString().slice(0, 10);

const toObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const resolveArtifactLabel = (artifactType) => {
  const labels = {
    INTIMATION_LETTER: "Intimation Letter",
    RFQ: "RFQ",
    SCOPE: "Scope & Agenda",
    AGENDA: "Scope & Agenda",
    PRE_AUDIT_QUESTIONNAIRE: "Pre-Audit Questionnaire",
    DRL: "Document Request List",
    EXECUTION_QUESTIONNAIRE: "Execution Questionnaire",
    GMP_CHECKLIST: "GMP Checklist",
    FINDINGS_LOG: "Findings Log",
    CAPA_PLAN: "CAPA Plan",
    FINAL_REPORT: "Final Report",
  };
  return labels[artifactType] || artifactType;
};

const buildAddress = (source = {}) =>
  normalize(
    [
      source?.addressline1,
      source?.addressline2,
      source?.addressline3,
      source?.address_line1,
      source?.address_line2,
      source?.address_line3,
      source?.city,
      source?.state,
      source?.country,
      source?.zipcode,
    ]
      .filter(Boolean)
      .join(", ")
  );

const buildDisplayName = ({ profile, user }) => {
  const firstName = profile?.firstName || profile?.contact_person_fname || "";
  const lastName = profile?.lastName || profile?.contact_person_lname || "";
  const fullName = normalize(`${firstName} ${lastName}`);
  return normalize(profile?.companyName || fullName || user?.email || "");
};

const resolveDeterministicPrefill = ({ label, context }) => {
  const text = normalizeText(label);
  if (!text) return "";

  const mentionsBuyer = /\b(buyer|from|issuer|sender|our)\b/.test(text);
  const mentionsSupplier = /\b(supplier|vendor|recipient|auditee|their)\b/.test(text);
  const looksLikeName = /\b(name|contact person|name of contact|printed name|company)\b/.test(text);
  const looksLikeEmail = /\b(email|e mail)\b/.test(text);
  const looksLikeAddress = /\b(address|location|facility)\b/.test(text);
  const looksLikePhone = /\b(phone|mobile|tel|telephone)\b/.test(text);
  const looksLikeDate = /\b(date|signed on|signed date|signature date)\b/.test(text);

  if (/\b(audit id|request id|reference|vendor code)\b/.test(text)) {
    return context?.requestId || "";
  }

  if (looksLikeDate && /\b(sign|signature|signed)\b/.test(text)) {
    return todayIso();
  }

  if (/\blead auditor\b/.test(text)) {
    return context?.auditor?.name || "TBD";
  }

  if (/\b(co auditor|co-auditor|technical expert)\b/.test(text)) {
    return context?.auditor?.name || "TBD";
  }

  if (looksLikeName) {
    if (mentionsBuyer && !mentionsSupplier) return context?.buyer?.name || "";
    if (mentionsSupplier && !mentionsBuyer) return context?.supplier?.name || "";
    if (/^to\b/.test(text) || /\bdear\b/.test(text)) return context?.supplier?.name || "";
    if (/^from\b/.test(text)) return context?.buyer?.name || "";
    if (/\bauditor\b/.test(text)) return context?.auditor?.name || "TBD";
  }

  if (looksLikeEmail) {
    if (mentionsBuyer && !mentionsSupplier) return context?.buyer?.email || "";
    if (mentionsSupplier && !mentionsBuyer) return context?.supplier?.email || "";
    if (/\bauditor\b/.test(text)) return context?.auditor?.email || "";
  }

  if (looksLikeAddress) {
    if (/\b(site|plant|facility)\b/.test(text)) return context?.site?.address || context?.supplier?.address || "";
    if (mentionsBuyer && !mentionsSupplier) return context?.buyer?.address || "";
    if (mentionsSupplier && !mentionsBuyer) return context?.supplier?.address || "";
    if (/^to\b/.test(text)) return context?.supplier?.address || "";
  }

  if (looksLikePhone) {
    if (mentionsBuyer && !mentionsSupplier) return context?.buyer?.phone || "";
    if (mentionsSupplier && !mentionsBuyer) return context?.supplier?.phone || "";
  }

  if (/\b(product|material)\b/.test(text)) return context?.product?.name || "";
  if (/\bdosage\b/.test(text)) return context?.product?.dosage || "";
  if (/\bcas\b/.test(text)) return context?.product?.casNumber || "";
  if (/\b(api|technology)\b/.test(text)) return context?.product?.apiTechnology || "";
  if (/\b(site|plant)\b/.test(text)) return context?.site?.name || "";

  return "";
};

const buildLlmPrompt = ({ context, fields }) =>
  [
    "You are a pharma audit assistant. Use the provided test context to prefill document template fields.",
    "Return JSON only (no markdown).",
    "Only include confident answers.",
    "Schema: {\"fields\":[{\"questionId\":\"string\",\"value\":\"string\",\"confidence\":0-1}]}",
    "",
    "Context:",
    JSON.stringify(context, null, 2),
    "",
    "Template Fields:",
    JSON.stringify(
      fields.map((field) => ({
        questionId: field?._id,
        label: field?.question,
      })),
      null,
      2
    ),
  ].join("\n");

const DEFAULT_TEST_REPORT_GUIDELINES = [
  "WHO TRS No. 957, Annex 2 - Good manufacturing practices for active pharmaceutical ingredients",
  "WHO TRS No. 986, Annex 2 - Good manufacturing practices for pharmaceutical products: main principles",
  "WHO guidance on desk assessment of GMP evidence for regulatory decisions",
];

const buildTestReportData = ({ context }) => {
  const today = todayIso();
  const productName = normalize(context?.product?.name || "");
  const products = productName
    ? [
        {
          name: productName,
          casNumber: normalize(context?.product?.casNumber || ""),
          dosageForm: normalize(context?.product?.dosage || ""),
          apiTechnology: normalize(context?.product?.apiTechnology || ""),
        },
      ]
    : [];
  const keyFinding = productName
    ? `Test preview generated for ${productName} using selected buyer/supplier/site context.`
    : "Test preview generated using selected buyer/supplier/site context.";
  const intro = `This is a test-artifacts preview for final report template validation. Context used: ${context?.supplier?.name || "Supplier"} at ${context?.site?.name || "site"} for ${productName || "selected product"}.`;

  return {
    auditee: {
      name: normalize(context?.supplier?.name || "Supplier"),
      siteName: normalize(context?.site?.name || ""),
      address: normalize(context?.site?.address || context?.supplier?.address || ""),
      contacts: {
        name: normalize(context?.supplier?.name || ""),
        email: normalize(context?.supplier?.email || ""),
        phone: normalize(context?.supplier?.phone || ""),
      },
    },
    supplier: {
      name: normalize(context?.supplier?.name || "Supplier"),
      address: normalize(context?.supplier?.address || ""),
      contact: {
        name: normalize(context?.supplier?.name || ""),
        phone: normalize(context?.supplier?.phone || ""),
        email: normalize(context?.supplier?.email || ""),
      },
    },
    buyer: {
      name: normalize(context?.buyer?.name || ""),
      email: normalize(context?.buyer?.email || ""),
    },
    auditor: {
      name: normalize(context?.auditor?.name || "TBD"),
      email: normalize(context?.auditor?.email || ""),
      org: "Hawkeye",
    },
    audit: {
      requestId: context?.requestId || `TEST-${Date.now()}`,
      inspectionRecordNumber: context?.requestId || `TEST-${Date.now()}`,
      assessmentMode: "Desk assessment",
      startDate: today,
      endDate: today,
      standards: DEFAULT_TEST_REPORT_GUIDELINES.slice(0, 2),
      scope: "Final report template test preview (no workflow instance created).",
      type: "Template Preview",
      unitsWorkshops: normalize(context?.site?.name || ""),
      apisCovered: products.map((item) => item.name),
      validityPeriod: "Preview only - no regulatory validity.",
    },
    products,
    personnelAudited: [
      {
        name: normalize(context?.supplier?.name || ""),
        responsibility: "Site contact",
        qualification: "",
        experience: "",
      },
    ],
    documentsReviewed: [
      "Site Master File",
      "GMP certificate",
      "Regulatory inspection summary",
      "Questionnaire and supporting evidence",
    ],
    guidelinesReferenced: DEFAULT_TEST_REPORT_GUIDELINES,
    whopir: {
      reportType: "WHO PUBLIC INSPECTION REPORT",
      assessmentMode: "Desk assessment",
      validityPeriod: "Preview only - no regulatory validity.",
    },
    regulatoryInspections: [
      {
        authority: "",
        inspectionDates: "",
        inspectionType: "",
        unitsCovered: "",
        productsCovered: "",
        areasInspected: "",
        outcome: "",
      },
    ],
    summary: {
      keyFindings: [keyFinding],
      executiveSummary: keyFinding,
    },
    sections: {
      summary: keyFinding,
      introduction: intro,
      companyInfo: "",
      facility: "",
      tour: "",
      warehouses: "",
      manufacturing: "",
      qcLab: "",
      systems: "",
      manufacturerAndSite: "",
      inspectionDetails: "",
      onsiteSummary: "",
      qualityManagement: "",
      personnel: "",
      buildingsFacilities: "",
      processEquipment: "",
      documentationRecords: "",
      materialsManagement: "",
      productionInProcessControls: "",
      packagingAndLabeling: "",
      storageDistribution: "",
      laboratoryControls: "",
      validation: "",
      changeControl: "",
      rejectionReuse: "",
      complaintsRecalls: "",
      contractManufacturers: "",
      deskEvidenceSummary: "",
      lastWhoInspection: "",
      supportingDocsAuthorization: "",
      supportingDocsSmf: "",
      supportingDocsProductList: "",
      supportingDocsRegulatoryInspections: "",
      supportingDocsOther: "",
      conclusion:
        "This preview confirms report block rendering and placeholder mapping. Use actual audit workflow for official report generation.",
    },
    observations: [
      {
        no: 1,
        severity: "Info",
        reference: "TEST_PREVIEW",
        description: "Final report preview generated from selected context.",
        evidence: "",
        recommendation: "Use this preview to validate template layout and placeholder mapping.",
        capaDueDate: "",
      },
    ],
    capa: [],
    signoff: {
      auditorName: normalize(context?.auditor?.name || "TBD"),
      reviewerName: "",
      date: today,
      reviewedDate: "",
    },
  };
};

const extractJson = (text) => {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
};

export const listTestArtifactOptions = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const includeProductsRaw = String(req.query?.includeProducts || "")
      .trim()
      .toLowerCase();
    const includeProducts =
      includeProductsRaw === "1" ||
      includeProductsRaw === "true" ||
      includeProductsRaw === "yes";
    const supplierUserIdRaw = String(req.query?.supplierUserId || "").trim();
    const siteIdRaw = String(req.query?.siteId || "").trim();
    const restrictTenantRaw = String(req.query?.restrictToTenant || "")
      .trim()
      .toLowerCase();
    const restrictToTenant =
      restrictTenantRaw === "1" ||
      restrictTenantRaw === "true" ||
      restrictTenantRaw === "yes";
    const supplierUserIdFilter = toObjectId(supplierUserIdRaw);
    const siteIdFilter = toObjectId(siteIdRaw);
    const tenantScopedOr = tenantId && restrictToTenant
      ? [{ tenant_id: tenantId }, { tenant_id: null }, { tenant_id: { $exists: false } }]
      : null;

    const [buyerProfiles, supplierProfiles, buyerUsers, supplierUsers, sites] = await Promise.all([
      BuyerProfile.find({
        ...(tenantScopedOr ? { $or: tenantScopedOr } : {}),
      })
        .select(
          "user_id title firstName lastName companyName phone addressline1 addressline2 addressline3 city state country zipcode"
        )
        .populate("user_id", "_id email role tenant_id status")
        .sort({ updatedAt: -1 })
        .limit(800)
        .lean(),
      SupplierProfile.find({
        ...(tenantScopedOr ? { $or: tenantScopedOr } : {}),
        ...(supplierUserIdFilter ? { user_id: supplierUserIdFilter } : {}),
      })
        .select(
          "user_id title firstName lastName companyName phone addressline1 addressline2 addressline3 city state country zipcode"
        )
        .populate("user_id", "_id email role tenant_id status")
        .sort({ updatedAt: -1 })
        .limit(1200)
        .lean(),
      User.find({
        role: "buyer",
        ...(tenantScopedOr ? { $or: tenantScopedOr } : {}),
      })
        .select("_id email role tenant_id status")
        .sort({ updatedAt: -1 })
        .limit(800)
        .lean(),
      User.find({
        role: { $in: ["supplier", "supplierUser"] },
        ...(supplierUserIdFilter ? { _id: supplierUserIdFilter } : {}),
        ...(tenantScopedOr ? { $or: tenantScopedOr } : {}),
      })
        .select("_id email role tenant_id status")
        .sort({ updatedAt: -1 })
        .limit(1200)
        .lean(),
      SupplierSite.find({
        ...(tenantScopedOr ? { $or: tenantScopedOr } : {}),
        ...(supplierUserIdFilter ? { user_id: supplierUserIdFilter } : {}),
        ...(siteIdFilter ? { _id: siteIdFilter } : {}),
      })
        .select(
          "_id user_id site_name plant_id address_line1 address_line2 address_line3 city state country zipcode"
        )
        .sort({ updatedAt: -1 })
        .limit(1200)
        .lean(),
    ]);

    const buyerUserMap = new Map(buyerUsers.map((user) => [String(user._id), user]));
    const supplierUserMap = new Map(supplierUsers.map((user) => [String(user._id), user]));

    const buyersById = new Map();
    buyerProfiles.forEach((profile) => {
      const user = profile?.user_id &&
        typeof profile.user_id === "object" &&
        (profile.user_id?._id || profile.user_id?.email)
        ? profile.user_id
        : buyerUserMap.get(String(profile?.user_id || ""));
      const id = String(user?._id || profile?.user_id || "").trim();
      if (!id) return;
      buyersById.set(id, {
        id,
        email: user?.email || "",
        role: user?.role || "buyer",
        name: buildDisplayName({ profile, user }),
        companyName: normalize(profile?.companyName || ""),
        address: buildAddress(profile),
      });
    });
    buyerUsers.forEach((user) => {
      const id = String(user?._id || "").trim();
      if (!id || buyersById.has(id)) return;
      buyersById.set(id, {
        id,
        email: user?.email || "",
        role: user?.role || "buyer",
        name: normalize(user?.email || ""),
        companyName: "",
        address: "",
      });
    });
    const buyersOut = Array.from(buyersById.values());

    const suppliersById = new Map();
    supplierProfiles.forEach((profile) => {
      const user = profile?.user_id &&
        typeof profile.user_id === "object" &&
        (profile.user_id?._id || profile.user_id?.email)
        ? profile.user_id
        : supplierUserMap.get(String(profile?.user_id || ""));
      const id = String(user?._id || profile?.user_id || "").trim();
      if (!id) return;
      suppliersById.set(id, {
        id,
        email: user?.email || "",
        role: user?.role || "supplier",
        name: buildDisplayName({ profile, user }),
        companyName: normalize(profile?.companyName || ""),
        address: buildAddress(profile),
      });
    });
    supplierUsers.forEach((user) => {
      const id = String(user?._id || "").trim();
      if (!id || suppliersById.has(id)) return;
      suppliersById.set(id, {
        id,
        email: user?.email || "",
        role: user?.role || "supplier",
        name: normalize(user?.email || ""),
        companyName: "",
        address: "",
      });
    });
    const suppliersOut = Array.from(suppliersById.values());

    const sitesOut = sites.map((site) => ({
      id: site._id,
      supplierUserId: site.user_id || null,
      siteName: normalize(site.site_name || site.plant_id || ""),
      plantId: site.plant_id || "",
      address: buildAddress(site),
    }));

    let productsOut = [];
    if (includeProducts) {
      const productScopeSites = siteIdFilter
        ? sitesOut.filter((site) => String(site.id) === String(siteIdFilter))
        : supplierUserIdFilter
          ? sitesOut.filter((site) => String(site.supplierUserId || "") === String(supplierUserIdFilter))
          : sitesOut;
      const plantIds = Array.from(
        new Set(productScopeSites.map((site) => String(site.plantId || "").trim()).filter(Boolean))
      );
      const productQuery = plantIds.length ? { plant_id: { $in: plantIds } } : null;
      const products = productQuery
        ? await SupplierMasterProducts.find(productQuery)
            .select("_id name casNumber description apiTechnology dosageForm plant_id")
            .sort({ updatedAt: -1 })
            .limit(600)
            .lean()
        : [];
      const siteByPlantId = new Map(
        productScopeSites.map((site) => [String(site.plantId || "").trim(), site])
      );
      productsOut = products.map((product) => {
        const plantId = String(product.plant_id || "").trim();
        const site = siteByPlantId.get(plantId);
        return {
          id: product._id,
          plantId,
          supplierUserId: site?.supplierUserId || null,
          name: normalize(product.name || product.description || ""),
          casNumber: normalize(product.casNumber || ""),
          dosageForm: normalize(product.dosageForm || ""),
          apiTechnology: normalize(product.apiTechnology || ""),
        };
      });
    }

    const artifacts = AUDIT_ARTIFACT_TYPES.map((artifactType) => ({
      artifactType,
      label: resolveArtifactLabel(artifactType),
      templateTypes: resolveTemplateTypesForArtifact(artifactType),
    }));

    return res.json({
      success: true,
      data: {
        artifacts,
        buyers: buyersOut,
        suppliers: suppliersOut,
        products: productsOut,
        sites: sitesOut,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load test artifact options" });
  }
};

export const prefillTestArtifact = async (req, res) => {
  try {
    const {
      templateId,
      artifactType = "",
      buyerUserId,
      supplierUserId,
      productId,
      siteId,
    } = req.body || {};

    const templateIdNum = Number(templateId);
    if (!Number.isFinite(templateIdNum) || templateIdNum <= 0) {
      return res.status(400).json({ error: "templateId is required" });
    }

    const [
      buyerUser,
      supplierUserRaw,
      product,
      site,
      auditorProfile,
      questions,
    ] = await Promise.all([
      toObjectId(buyerUserId)
        ? User.findById(buyerUserId).select("_id email role").lean()
        : Promise.resolve(null),
      toObjectId(supplierUserId)
        ? User.findById(supplierUserId).select("_id email role").lean()
        : Promise.resolve(null),
      toObjectId(productId)
        ? SupplierMasterProducts.findById(productId)
            .select("_id name description casNumber apiTechnology dosageForm plant_id")
            .lean()
        : Promise.resolve(null),
      toObjectId(siteId)
        ? SupplierSite.findById(siteId)
            .select(
              "_id user_id site_name plant_id address_line1 address_line2 address_line3 city state country zipcode contact_person_title contact_person_fname contact_person_lname contact_email contact_phone"
            )
            .lean()
        : Promise.resolve(null),
      AuditorProfile.findOne({ user_id: req.user?._id })
        .select("firstName lastName")
        .lean(),
      TemplateQuestions.find({ templateId: templateIdNum })
        .select("_id question")
        .sort({ order: 1, categoryName: 1, createdAt: 1 })
        .lean(),
    ]);

    if (!questions.length) {
      return res.status(404).json({ error: "No template questions found" });
    }

    const supplierUser = supplierUserRaw
      ? supplierUserRaw
      : site?.user_id
        ? await User.findById(site.user_id).select("_id email role").lean()
        : null;
    const [buyerProfile, supplierProfile] = await Promise.all([
      buyerUser?._id
        ? BuyerProfile.findOne({ user_id: buyerUser._id })
            .select(
              "title firstName lastName phone companyName addressline1 addressline2 addressline3 city state country zipcode"
            )
            .lean()
        : null,
      supplierUser?._id
        ? SupplierProfile.findOne({ user_id: supplierUser._id })
            .select(
              "title firstName lastName phone companyName addressline1 addressline2 addressline3 city state country zipcode"
            )
            .lean()
        : null,
    ]);

    const buyerName = buildDisplayName({ profile: buyerProfile, user: buyerUser });
    const supplierName = buildDisplayName({ profile: supplierProfile, user: supplierUser });
    const auditorName = normalize(
      `${auditorProfile?.firstName || ""} ${auditorProfile?.lastName || ""}`.trim() ||
        req.user?.email ||
        "TBD"
    );

    const context = {
      requestId: `TEST-${Date.now()}`,
      artifactType: String(artifactType || "").toUpperCase(),
      buyer: {
        name: buyerName,
        email: buyerUser?.email || "",
        phone: buyerProfile?.phone ? String(buyerProfile.phone) : "",
        address: buildAddress(buyerProfile),
      },
      supplier: {
        name: supplierName,
        email: supplierUser?.email || "",
        phone: supplierProfile?.phone ? String(supplierProfile.phone) : "",
        address: buildAddress(supplierProfile),
      },
      auditor: {
        name: auditorName,
        email: req.user?.email || "",
      },
      site: {
        name: normalize(site?.site_name || site?.plant_id || ""),
        address: buildAddress(site),
      },
      product: {
        name: normalize(product?.name || product?.description || ""),
        dosage: normalize(product?.dosageForm || ""),
        casNumber: normalize(product?.casNumber || ""),
        apiTechnology: normalize(product?.apiTechnology || ""),
      },
    };

    const deterministicFields = questions
      .map((question) => {
        const value = resolveDeterministicPrefill({
          label: question?.question,
          context,
        });
        if (!value) return null;
        return {
          questionId: String(question._id),
          value: String(value),
          confidence: 0.99,
        };
      })
      .filter(Boolean);

    const llmPrompt = buildLlmPrompt({ context, fields: questions });
    let llmFields = [];
    try {
      const raw = await callLlmService({
        prompt: llmPrompt,
        model: LLM_MODEL,
        maxTokens: 1000,
        temperature: 0.1,
      });
      const parsed = extractJson(raw);
      const fromLlm = Array.isArray(parsed?.fields) ? parsed.fields : [];
      llmFields = fromLlm
        .filter((field) => field?.questionId && typeof field?.value === "string")
        .map((field) => ({
          questionId: String(field.questionId),
          value: String(field.value),
          confidence: Number(field.confidence || 0),
        }))
        .filter((field) => Number.isFinite(field.confidence) && field.confidence >= 0.8);
    } catch (error) {
      llmFields = [];
    }

    const mergedByQuestion = new Map(
      deterministicFields.map((field) => [field.questionId, field])
    );
    llmFields.forEach((field) => {
      mergedByQuestion.set(field.questionId, field);
    });

    const signatureDefaults = {
      buyerName: context.buyer.name || "",
      buyerSignedAt: todayIso(),
      supplierName: context.supplier.name || "",
      supplierSignedAt: todayIso(),
      auditorName: context.auditor.name || "TBD",
      auditorSignedAt: todayIso(),
    };

    return res.json({
      success: true,
      data: {
        model: LLM_MODEL,
        questionCount: questions.length,
        fields: Array.from(mergedByQuestion.values()),
        context,
        signatureDefaults,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to generate test prefill" });
  }
};

export const listTestReportTemplates = async (req, res) => {
  try {
    const templates = await ReportTemplate.find({ isActive: true })
      .select("_id name description category version updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: {
        templates: templates.map((template) => ({
          id: String(template._id),
          name: template.name || "Report Template",
          description: template.description || "",
          category: template.category || "",
          version: Number(template.version || 1),
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load report templates" });
  }
};

export const previewTestReportTemplate = async (req, res) => {
  try {
    const { reportTemplateId, buyerUserId, supplierUserId, productId, siteId } = req.body || {};
    if (!reportTemplateId || !mongoose.Types.ObjectId.isValid(String(reportTemplateId))) {
      return res.status(400).json({ error: "reportTemplateId is required" });
    }

    const [template, buyerUser, supplierUserRaw, product, site, auditorProfile] = await Promise.all([
      ReportTemplate.findById(reportTemplateId).lean(),
      toObjectId(buyerUserId)
        ? User.findById(buyerUserId).select("_id email role").lean()
        : Promise.resolve(null),
      toObjectId(supplierUserId)
        ? User.findById(supplierUserId).select("_id email role").lean()
        : Promise.resolve(null),
      toObjectId(productId)
        ? SupplierMasterProducts.findById(productId)
            .select("_id name description casNumber apiTechnology dosageForm plant_id")
            .lean()
        : Promise.resolve(null),
      toObjectId(siteId)
        ? SupplierSite.findById(siteId)
            .select(
              "_id user_id site_name plant_id address_line1 address_line2 address_line3 city state country zipcode contact_person_title contact_person_fname contact_person_lname contact_email contact_phone"
            )
            .lean()
        : Promise.resolve(null),
      AuditorProfile.findOne({ user_id: req.user?._id })
        .select("firstName lastName")
        .lean(),
    ]);

    if (!template) return res.status(404).json({ error: "Report template not found" });

    const supplierUser = supplierUserRaw
      ? supplierUserRaw
      : site?.user_id
        ? await User.findById(site.user_id).select("_id email role").lean()
        : null;

    const [buyerProfile, supplierProfile] = await Promise.all([
      buyerUser?._id
        ? BuyerProfile.findOne({ user_id: buyerUser._id })
            .select(
              "title firstName lastName phone companyName addressline1 addressline2 addressline3 city state country zipcode"
            )
            .lean()
        : null,
      supplierUser?._id
        ? SupplierProfile.findOne({ user_id: supplierUser._id })
            .select(
              "title firstName lastName phone companyName addressline1 addressline2 addressline3 city state country zipcode"
            )
            .lean()
        : null,
    ]);

    const buyerName = buildDisplayName({ profile: buyerProfile, user: buyerUser });
    const supplierName = buildDisplayName({ profile: supplierProfile, user: supplierUser });
    const auditorName = normalize(
      `${auditorProfile?.firstName || ""} ${auditorProfile?.lastName || ""}`.trim() ||
        req.user?.email ||
        "TBD"
    );

    const context = {
      requestId: `TEST-${Date.now()}`,
      buyer: {
        name: buyerName,
        email: buyerUser?.email || "",
        phone: buyerProfile?.phone ? String(buyerProfile.phone) : "",
        address: buildAddress(buyerProfile),
      },
      supplier: {
        name: supplierName,
        email: supplierUser?.email || "",
        phone: supplierProfile?.phone ? String(supplierProfile.phone) : "",
        address: buildAddress(supplierProfile),
      },
      auditor: {
        name: auditorName,
        email: req.user?.email || "",
      },
      site: {
        name: normalize(site?.site_name || site?.plant_id || ""),
        address: buildAddress(site),
      },
      product: {
        name: normalize(product?.name || product?.description || ""),
        dosage: normalize(product?.dosageForm || ""),
        casNumber: normalize(product?.casNumber || ""),
        apiTechnology: normalize(product?.apiTechnology || ""),
      },
    };

    const reportData = buildTestReportData({ context });
    const { renderedBlocks, highlights } = mergeReportTemplate(template, reportData);

    return res.json({
      success: true,
      data: {
        template: {
          id: String(template._id),
          name: template.name || "Report Template",
          description: template.description || "",
          category: template.category || "",
          version: Number(template.version || 1),
        },
        renderedBlocks,
        highlights,
        reportData,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to generate report preview" });
  }
};
