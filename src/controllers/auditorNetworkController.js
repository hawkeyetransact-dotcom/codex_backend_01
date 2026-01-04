import { AuditorAffiliation } from "../models/auditorAffiliationModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { assertSameTenant } from "../middlewares/authMiddleware.js";

export const inviteInternalAuditor = async (req, res) => {
  const { orgId } = req.params;
  const { auditorProfileId } = req.body || {};
  try {
    assertSameTenant(orgId, req.tenantId);
    const aff = await AuditorAffiliation.findOneAndUpdate(
      { auditorProfileId, orgTenantId: orgId },
      { affiliationType: "INTERNAL", status: "ACTIVE", invitedBy: req.user?._id, approvedBy: req.user?._id },
      { upsert: true, new: true }
    );
    return res.json({ data: aff });
  } catch (err) {
    console.error("inviteInternalAuditor", err);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export const inviteExternalAuditor = async (req, res) => {
  const { orgId } = req.params;
  const { auditorProfileId } = req.body || {};
  try {
    assertSameTenant(orgId, req.tenantId);
    const aff = await AuditorAffiliation.findOneAndUpdate(
      { auditorProfileId, orgTenantId: orgId },
      { affiliationType: "EXTERNAL", status: "PENDING", invitedBy: req.user?._id },
      { upsert: true, new: true }
    );
    return res.json({ data: aff });
  } catch (err) {
    console.error("inviteExternalAuditor", err);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export const acceptAffiliation = async (req, res) => {
  const { id } = req.params;
  try {
    const aff = await AuditorAffiliation.findById(id);
    if (!aff) return res.status(404).json({ error: "Not found" });
    aff.status = "ACTIVE";
    aff.approvedBy = req.user?._id;
    await aff.save();
    return res.json({ data: aff });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const revokeAffiliation = async (req, res) => {
  const { orgId, id } = req.params;
  try {
    assertSameTenant(orgId, req.tenantId);
    const aff = await AuditorAffiliation.findOneAndUpdate(
      { _id: id, orgTenantId: orgId },
      { status: "REVOKED", approvedBy: req.user?._id },
      { new: true }
    );
    if (!aff) return res.status(404).json({ error: "Not found" });
    return res.json({ data: aff });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export const listOrgAuditors = async (req, res) => {
  const { orgId } = req.params;
  const { type } = req.query;
  try {
    assertSameTenant(orgId, req.tenantId);
    const filter = { orgTenantId: orgId };
    if (type === "pending") filter.status = "PENDING";
    if (type === "internal") filter.affiliationType = "INTERNAL";
    if (type === "external") filter.affiliationType = "EXTERNAL";
    const affs = await AuditorAffiliation.find(filter).lean();
    return res.json({ data: affs });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export const searchAuditors = async (req, res) => {
  const { tags = "", region = "", qualification = "" } = req.query;
  try {
    const filter = {};
    if (region) filter.country = region;
    if (qualification) filter["certifications.certificationType"] = { $regex: qualification, $options: "i" };
    if (tags) filter["workExperiences.skills"] = { $in: String(tags).split(",").map((t) => t.trim()).filter(Boolean) };
    const items = await AuditorProfile.find(filter).limit(50).lean();
    return res.json({ data: items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
