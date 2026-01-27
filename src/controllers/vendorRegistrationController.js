import { SupplierProfile } from "../models/supplierProfileModel.js";
import { Template } from "../models/templateModel.js";
import { resolveDefaultTemplateId } from "../utils/templateDefaults.js";

const resolveVendorTemplateId = async (tenantId) => {
  const fromDefault = await resolveDefaultTemplateId({
    artifactType: "VENDOR_REGISTRATION",
    tenantId,
    assessmentTypeId: null,
  });
  if (fromDefault) return fromDefault;
  const template = await Template.findOne({
    templateType: "VENDOR_REGISTRATION",
    status: "PUBLISHED",
    $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }],
  })
    .sort({ "extractionConfig.defaultTemplate": -1, templateId: 1 })
    .select("templateId")
    .lean();
  return template?.templateId || null;
};

export const getVendorRegistration = async (req, res) => {
  try {
    const userId = req.user?._id;
    const tenantId = req.tenantId || req.user?.tenant_id || null;
    const profile = await SupplierProfile.findOne({ user_id: userId }).lean();
    const templateId = await resolveVendorTemplateId(tenantId);
    if (!templateId) {
      return res.status(404).json({ error: "Vendor registration template not found" });
    }
    return res.json({
      success: true,
      data: {
        templateId,
        status: profile?.vendorRegistration?.status || "DRAFT",
        responses: profile?.vendorRegistration?.responses || [],
        submittedAt: profile?.vendorRegistration?.submittedAt || null,
        profile: profile
          ? {
              companyName: profile.companyName,
              title: profile.title,
              firstName: profile.firstName,
              lastName: profile.lastName,
              phone: profile.phone,
              countryCode: profile.countryCode,
              email: req.user?.email || "",
              addressline1: profile.addressline1,
              addressline2: profile.addressline2,
              addressline3: profile.addressline3,
              city: profile.city,
              state: profile.state,
              country: profile.country,
              zipcode: profile.zipcode,
              panNumber: profile.panNumber,
              gstNumber: profile.gstNumber,
              caNumber: profile.caNumber,
            }
          : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load vendor registration" });
  }
};

export const saveVendorRegistration = async (req, res) => {
  try {
    const userId = req.user?._id;
    const tenantId = req.tenantId || req.user?.tenant_id || null;
    const { templateId, responses = [], submit = false } = req.body || {};
    if (!templateId || Number.isNaN(Number(templateId))) {
      return res.status(400).json({ error: "templateId is required" });
    }
    const profile = await SupplierProfile.findOne({ user_id: userId });
    if (!profile) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }
    profile.vendorRegistration = {
      templateId: Number(templateId),
      status: submit ? "SUBMITTED" : "DRAFT",
      responses: Array.isArray(responses) ? responses : [],
      updatedAt: new Date(),
      submittedAt: submit ? new Date() : profile.vendorRegistration?.submittedAt || null,
    };
    await profile.save();
    return res.json({
      success: true,
      data: {
        templateId: profile.vendorRegistration.templateId,
        status: profile.vendorRegistration.status,
        responses: profile.vendorRegistration.responses,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to save vendor registration" });
  }
};
