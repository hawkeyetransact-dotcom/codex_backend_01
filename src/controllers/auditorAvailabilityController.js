import mongoose from "mongoose";
import { AvailabilityBlock } from "../models/availabilityBlockModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditorQualification } from "../models/AuditorQualificationModel.js";
import { User } from "../models/userModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

export const listAuditorAvailability = async (req, res) => {
  try {
    const blocks = await AvailabilityBlock.find({
      ownerType: "auditor",
      ownerId: req.user?._id,
    })
      .sort({ start: 1 })
      .lean();
    return res.json({ data: blocks });
  } catch (err) {
    console.error("listAuditorAvailability", err);
    return res.status(500).json({ error: "Failed to load availability" });
  }
};

export const createAuditorAvailability = async (req, res) => {
  try {
    const { start, end, blockType = "blackout", timezone = "UTC" } = req.body || {};
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate || !endDate || endDate <= startDate) {
      return res.status(400).json({ error: "Invalid start/end" });
    }

    const block = await AvailabilityBlock.create({
      tenantOrgId: req.tenantId || req.user?.tenant_id || null,
      ownerType: "auditor",
      ownerId: req.user?._id,
      blockType,
      start: startDate,
      end: endDate,
      timezone,
      createdBy: req.user?._id,
    });

    return res.status(201).json({ data: block });
  } catch (err) {
    console.error("createAuditorAvailability", err);
    return res.status(500).json({ error: "Failed to save availability" });
  }
};

export const deleteAuditorAvailability = async (req, res) => {
  try {
    const block = await AvailabilityBlock.findOneAndDelete({
      _id: req.params.blockId,
      ownerType: "auditor",
      ownerId: req.user?._id,
    });
    if (!block) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteAuditorAvailability", err);
    return res.status(500).json({ error: "Failed to delete availability" });
  }
};

/**
 * G2: GET /api/auditors/available
 *
 * Returns auditors that are simultaneously:
 *   1. qualified (qualificationStatus === 'QUALIFIED' or 'CONDITIONALLY_QUALIFIED')
 *   2. NOT in a 'blackout' AvailabilityBlock overlapping the requested window
 *   3. NOT carrying a declared COI against the supplier (if supplierId provided)
 *   4. matching the requested affiliation (internal | external) if provided
 *   5. (for internal auditors) matching the requested buyerOrgId
 *
 * Query params: start, end (required ISO dates) · affiliation · supplierId
 * · buyerOrgId · minQualification ('QUALIFIED' default | 'CONDITIONALLY_QUALIFIED')
 */
export const listAvailableAuditors = async (req, res) => {
  try {
    const { start, end, affiliation, supplierId, buyerOrgId, minQualification } = req.query || {};
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "start and end are required (ISO dates)" });
    }

    const profileQuery = {};
    if (affiliation && ["internal", "external"].includes(String(affiliation))) {
      profileQuery.auditorAffiliation = affiliation;
    }
    if (affiliation === "internal" && buyerOrgId && mongoose.isValidObjectId(buyerOrgId)) {
      profileQuery.auditorOrgId = new mongoose.Types.ObjectId(buyerOrgId);
    }
    const profiles = await AuditorProfile.find(profileQuery)
      .select("user_id firstName lastName companyName auditorAffiliation auditorOrgId")
      .lean();
    if (!profiles.length) return res.json({ data: [], count: 0 });

    const userIds = profiles.map((p) => p.user_id);
    const allowedStatuses = (minQualification === "CONDITIONALLY_QUALIFIED")
      ? ["QUALIFIED", "CONDITIONALLY_QUALIFIED"]
      : ["QUALIFIED"];
    const qualifications = await AuditorQualification.find({
      auditorUserId: { $in: userIds },
    }).select("auditorUserId qualificationStatus coiDeclarations totalAuditsCompleted").lean();
    const qualByUser = new Map(qualifications.map((q) => [String(q.auditorUserId), q]));

    const blackouts = await AvailabilityBlock.find({
      ownerType: "auditor",
      ownerId: { $in: userIds },
      blockType: "blackout",
      start: { $lt: endDate },
      end: { $gt: startDate },
    }).select("ownerId start end").lean();
    const blackedOut = new Set(blackouts.map((b) => String(b.ownerId)));

    let coiAuditorIds = new Set();
    if (supplierId && mongoose.isValidObjectId(supplierId)) {
      const auditsForSupplier = await AuditRequestMaster.find({
        supplier_id: supplierId,
      }).select("_id").lean();
      const auditIds = new Set(auditsForSupplier.map((a) => String(a._id)));
      qualifications.forEach((q) => {
        const conflicts = (q.coiDeclarations || []).filter(
          (c) => c.hasConflict && auditIds.has(String(c.auditId))
        );
        if (conflicts.length) coiAuditorIds.add(String(q.auditorUserId));
      });
    }

    const users = await User.find({ _id: { $in: userIds }, status: "ACTIVE" })
      .select("_id email role")
      .lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const results = profiles
      .filter((p) => {
        const uid = String(p.user_id);
        const user = userById.get(uid);
        const qual = qualByUser.get(uid);
        if (!user || !qual) return false;
        if (!allowedStatuses.includes(qual.qualificationStatus)) return false;
        if (blackedOut.has(uid)) return false;
        if (coiAuditorIds.has(uid)) return false;
        return true;
      })
      .map((p) => {
        const uid = String(p.user_id);
        const user = userById.get(uid);
        const qual = qualByUser.get(uid);
        return {
          auditorUserId: uid,
          auditorProfileId: String(p._id),
          email: user.email,
          firstName: p.firstName,
          lastName: p.lastName,
          companyName: p.companyName,
          auditorAffiliation: p.auditorAffiliation || "external",
          qualificationStatus: qual.qualificationStatus,
          totalAuditsCompleted: qual.totalAuditsCompleted || 0,
        };
      });

    return res.json({ data: results, count: results.length });
  } catch (err) {
    console.error("listAvailableAuditors error:", err);
    return res.status(500).json({ error: err.message });
  }
};
