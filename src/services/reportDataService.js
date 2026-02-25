import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { Capa } from "../models/capaModel.js";
import { User } from "../models/userModel.js";

const buildAddress = (source = {}) => {
  const parts = [
    source.addressline1,
    source.addressline2,
    source.addressline3,
    source.address_line1,
    source.address_line2,
    source.address_line3,
    source.city,
    source.state,
    source.country,
    source.zipcode,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return parts.join(", ");
};

const formatPersonName = (profile) => {
  if (!profile) return "";
  const parts = [profile.title, profile.firstName, profile.lastName].filter(Boolean);
  return parts.join(" ");
};

const mapRiskToSeverity = (risk) => {
  const normalized = (risk || "").toString().toLowerCase();
  if (normalized === "h" || normalized === "high") return "Major";
  if (normalized === "m" || normalized === "medium") return "Minor";
  if (normalized === "l" || normalized === "low") return "Info";
  return "Info";
};

const DEFAULT_WHOPIR_GUIDELINES = [
  "WHO TRS No. 957, Annex 2 - Good manufacturing practices for active pharmaceutical ingredients",
  "WHO TRS No. 986, Annex 2 - Good manufacturing practices for pharmaceutical products: main principles",
  "WHO guidance on desk assessment of GMP/GLP/GCP evidence for regulatory decisions",
  "WHO TRS No. 961, Annex 14 - Site Master File requirements",
];

const uniqueStrings = (values = []) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const inferAssessmentMode = (audit = {}) => {
  const signal = [
    audit.assessmentTypeKey,
    audit.trackStatus,
    audit.questionnaireStatus,
    audit.high_status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (signal.includes("desk")) return "Desk assessment";
  if (signal.includes("onsite") || signal.includes("on site")) return "Onsite inspection";
  return "Onsite inspection";
};

const buildDefaultDocumentsReviewed = (questions = []) => {
  const fromResponses = uniqueStrings(
    (Array.isArray(questions) ? questions : []).flatMap((question) => {
      const raw = String(question?.docUrls || "");
      if (!raw) return [];
      return raw
        .split(/[\n,;|]+/)
        .map((value) => value.trim())
        .filter(Boolean);
    })
  );
  if (fromResponses.length) return fromResponses.slice(0, 30);
  return [
    "Site Master File (latest approved copy)",
    "Manufacturing authorization and GMP certificate from local authority",
    "List of APIs/products manufactured at site",
    "Recent regulatory inspection history and outcomes",
    "Critical SOP index (Production, QA, QC, Engineering)",
  ];
};

export const buildAuditReportData = async (auditRequestId) => {
  const audit = await AuditRequestMaster.findById(auditRequestId).lean();
  if (!audit) return null;

  const [
    supplierProfile,
    auditorProfile,
    site,
    product,
    questions,
    auditorUser,
    supplierUser,
    buyerUser,
    capas,
  ] =
    await Promise.all([
      SupplierProfile.findOne({ user_id: audit.supplier_id }).lean(),
      AuditorProfile.findOne({ user_id: audit.auditor_id }).lean(),
      SupplierSite.findById(audit.site_id).lean(),
      SupplierMasterProducts.findById(audit.supplier_product_id).lean(),
      AuditQuestions.find({ auditRequestId }).lean(),
      User.findById(audit.auditor_id).lean(),
      User.findById(audit.supplier_id).lean(),
      User.findById(audit.create_by_buyer_id).lean(),
      Capa.find({ auditId: auditRequestId }).lean(),
    ]);

  const auditeeName = supplierProfile?.companyName || "Auditee";
  const auditorName = formatPersonName(auditorProfile) || auditorUser?.email || "Auditor";
  const requestId =
    audit?.hawkeyeRequestId ||
    audit?.internalRequestId ||
    audit?.supplierRequestId ||
    String(audit?._id || "");
  const assessmentMode = inferAssessmentMode(audit);
  const inspectionType =
    assessmentMode === "Desk assessment"
      ? "Desk assessment in lieu of onsite inspection"
      : "Onsite GMP inspection";
  const startDate = audit?.complianceDate || audit?.calendarStartAt || audit?.createdAt || null;
  const endDate = audit?.auditETA || audit?.calendarEndAt || audit?.complianceDate || null;
  const productNames = product?.name ? [product.name] : [];
  const siteContactName = site
    ? [site.contact_person_title, site.contact_person_fname, site.contact_person_lname]
        .filter(Boolean)
        .join(" ")
    : "";
  const sitePhone = site?.contact_phone
    ? `${site?.contact_phone_countryCode || ""} ${site?.contact_phone}`.trim()
    : "";
  const supplierPhone = supplierProfile?.phone
    ? `${supplierProfile.countryCode || ""} ${supplierProfile.phone}`.trim()
    : "";
  const supplierContactName = supplierProfile ? formatPersonName(supplierProfile) : "";
  const supplierEmail = supplierUser?.email || "";
  const documentsReviewed = buildDefaultDocumentsReviewed(questions);
  const guidelinesReferenced = [...DEFAULT_WHOPIR_GUIDELINES];
  const standards = guidelinesReferenced.slice(0, 2);

  const capaByQuestion = new Map();
  (capas || []).forEach((capa) => {
    (capa.linkedQuestionIds || []).forEach((qid) => {
      const key = String(qid);
      const list = capaByQuestion.get(key) || [];
      list.push({
        id: capa._id,
        title: capa.title,
        status: capa.status,
        targetDate: capa.targetDate,
      });
      capaByQuestion.set(key, list);
    });
  });

  const observations = (questions || [])
    .filter((q) => q.flagStatus === "auditor_flagged" || q.textResponse || q.internalNotes)
    .map((q, index) => ({
      no: index + 1,
      severity: q.severity || mapRiskToSeverity(q.riskcategory),
      reference: q.questionCode || q.categoryName || "",
      description: q.question || "",
      evidence: q.textResponse || q.docUrls || "",
      recommendation: q.internalNotes || "",
      capaDueDate: "",
      linkedEvidenceIds: q.linkedEvidenceIds || [],
      linkedCapaIds: q.linkedCapaIds || [],
      linkedFindingId: q.linkedFindingId || null,
      linkedCapas: capaByQuestion.get(String(q._id)) || [],
    }));

  const keyFindings = observations
    .slice(0, 8)
    .map((obs) => obs.description || obs.reference)
    .filter(Boolean);

  const personnelAudited = siteContactName
    ? [
        {
          name: siteContactName,
          responsibility: "Site Contact",
          qualification: "",
          experience: "",
        },
      ]
    : [];

  const introText =
    assessmentMode === "Desk assessment"
      ? `This WHO-style report is prepared as a desk assessment for ${auditeeName}. The review considered available GMP evidence, supporting documentation and prior regulatory outcomes.`
      : `This WHO-style report summarizes the onsite GMP inspection conducted at ${auditeeName}. The assessment focused on API manufacturing controls, quality systems and supporting operations.`;
  const manufacturerAndSiteText =
    `Manufacturer: ${auditeeName}. Corporate address: ${buildAddress(supplierProfile || {}) || "_____"}.\n` +
    `Inspected manufacturing site: ${site?.site_name || "_____"} at ${buildAddress(site || {}) || "_____"}.\n` +
    `Unit / block / workshop in scope: ${site?.plant_id || "_____"}.\n` +
    `DUNS / FEI / GPS (if applicable): _____.`;
  const inspectionDetailsText =
    `Inspection record number: ${requestId || "_____"}.\n` +
    `Inspection mode: ${assessmentMode}.\n` +
    `Inspection type: ${inspectionType}.\n` +
    `Inspection period: ${startDate || "_____"} to ${endDate || "_____"}.\n` +
    `APIs / products covered: ${productNames.length ? productNames.join(", ") : "_____"}.\n` +
    `Manufacturing authorization / GMP license number: _____.`;
  const conclusionText =
    "Based on the areas reviewed, available evidence and documented findings, the site may be considered operating at an acceptable level of compliance with WHO GMP guidelines, subject to closure of identified gaps and continued positive inspection outcomes.";

  return {
    auditee: {
      name: auditeeName,
      siteName: site?.site_name || "",
      address: buildAddress(site || supplierProfile || {}),
      contacts: {
        name: siteContactName,
        email: site?.contact_email || "",
        phone: sitePhone,
      },
      website: "",
    },
    supplier: {
      name: supplierProfile?.companyName || auditeeName,
      address: buildAddress(supplierProfile || {}),
      contact: supplierProfile
        ? {
            name: supplierContactName,
            phone: supplierPhone,
            email: supplierEmail,
          }
        : {},
    },
    buyer: {
      name: buyerUser?.email || "",
      email: buyerUser?.email || "",
    },
    auditor: {
      name: auditorName,
      org: auditorProfile?.companyName || "",
      email: auditorUser?.email || "",
    },
    audit: {
      requestId,
      inspectionRecordNumber: requestId,
      assessmentMode,
      startDate,
      endDate,
      standards,
      scope:
        assessmentMode === "Desk assessment"
          ? "Assessment of SRA/NRA inspection evidence and supporting GMP documentation."
          : "Onsite GMP assessment of manufacturing, quality and support systems.",
      type: inspectionType,
      unitsWorkshops: site?.plant_id || "",
      apisCovered: productNames,
      validityPeriod:
        "This WHOPIR remains valid for 3 years, provided that any follow-up inspection outcome is positive.",
    },
    products: product
      ? [
          {
            name: product.name,
            casNumber: product.casNumber,
            dosageForm: product.dosageForm,
            apiTechnology: product.apiTechnology,
          },
        ]
      : [],
    personnelAudited,
    documentsReviewed,
    guidelinesReferenced,
    whopir: {
      reportType: "WHO PUBLIC INSPECTION REPORT",
      assessmentMode,
      partNumbering: ["Part 1", "Part 2", "Part 3", "Part 4", "Part 5", "Part 6"],
      validityPeriod:
        "This WHOPIR remains valid for 3 years, provided that any follow-up inspection outcome is positive.",
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
      keyFindings,
      executiveSummary: keyFindings.length
        ? keyFindings.join(" ")
        : "No major non-compliances were recorded from available audit evidence.",
    },
    sections: {
      summary: "",
      introduction: introText,
      companyInfo: "",
      facility: "",
      tour: "",
      warehouses: "",
      manufacturing: "",
      qcLab: "",
      systems: "",
      manufacturerAndSite: manufacturerAndSiteText,
      inspectionDetails: inspectionDetailsText,
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
      conclusion: conclusionText,
    },
    observations,
    capa: (capas || []).map((capa) => ({
      title: capa.title,
      description: capa.description,
      severity: capa.severity,
      targetDate: capa.targetDate,
      status: capa.status,
    })),
    signoff: {
      auditorName,
      reviewerName: "",
      date: new Date(),
      reviewedDate: "",
    },
  };
};
