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

export const buildAuditReportData = async (auditRequestId) => {
  const audit = await AuditRequestMaster.findById(auditRequestId).lean();
  if (!audit) return null;

  const [supplierProfile, auditorProfile, site, product, questions, auditorUser, capas] =
    await Promise.all([
      SupplierProfile.findOne({ user_id: audit.supplier_id }).lean(),
      AuditorProfile.findOne({ user_id: audit.auditor_id }).lean(),
      SupplierSite.findById(audit.site_id).lean(),
      SupplierMasterProducts.findById(audit.supplier_product_id).lean(),
      AuditQuestions.find({ auditRequestId }).lean(),
      User.findById(audit.auditor_id).lean(),
      Capa.find({ auditId: auditRequestId }).lean(),
    ]);

  const auditeeName = supplierProfile?.companyName || "Auditee";
  const auditorName = formatPersonName(auditorProfile) || auditorUser?.email || "Auditor";
  const siteContactName = site
    ? [site.contact_person_title, site.contact_person_fname, site.contact_person_lname]
        .filter(Boolean)
        .join(" ")
    : "";

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

  const keyFindings = observations.slice(0, 5).map((obs) => obs.description || obs.reference).filter(Boolean);

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

  return {
    auditee: {
      name: auditeeName,
      siteName: site?.site_name || "",
      address: buildAddress(site || supplierProfile || {}),
      contacts: {
        name: siteContactName,
        email: site?.contact_email || "",
        phone: site?.contact_phone
          ? `${site?.contact_phone_countryCode || ""} ${site?.contact_phone}`.trim()
          : "",
      },
      website: "",
    },
    supplier: {
      name: supplierProfile?.companyName || auditeeName,
      address: buildAddress(supplierProfile || {}),
      contact: supplierProfile
        ? {
            name: formatPersonName(supplierProfile),
            phone: supplierProfile.phone ? `${supplierProfile.countryCode || ""} ${supplierProfile.phone}`.trim() : "",
          }
        : {},
    },
    auditor: {
      name: auditorName,
      org: auditorProfile?.companyName || "",
      email: auditorUser?.email || "",
    },
    audit: {
      startDate: audit?.complianceDate || null,
      endDate: audit?.complianceDate || null,
      standards: [],
      scope: "",
      type: "",
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
    summary: {
      keyFindings,
    },
    sections: {
      introduction: "",
      companyInfo: "",
      facility: "",
      tour: "",
      warehouses: "",
      manufacturing: "",
      qcLab: "",
      systems: "",
      conclusion: "",
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
      date: new Date(),
    },
  };
};
