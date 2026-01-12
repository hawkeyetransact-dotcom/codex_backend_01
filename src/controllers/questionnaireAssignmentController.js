import mongoose from "mongoose";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { QuestionnaireSectionAssignment } from "../models/questionnaireSectionAssignmentModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { User } from "../models/userModel.js";

const toId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

const resolveSupplierOwnerId = (user) => {
  if (!user) return null;
  if (user.role === "supplier") return user._id;
  if (user.role === "supplierUser") return user.invitedBy || null;
  return null;
};

const loadAuditForSupplier = async (auditId, supplierOwnerId) => {
  if (!auditId || !supplierOwnerId) return null;
  return AuditRequestMaster.findOne({
    _id: auditId,
    supplier_id: supplierOwnerId,
  })
    .select("_id tenantOrgId supplier_id")
    .lean();
};

export const listDepartmentAssignments = async (req, res) => {
  try {
    const auditId = req.params.auditId;
    const supplierOwnerId = resolveSupplierOwnerId(req.user);
    if (!supplierOwnerId) {
      return res.status(403).json({ status: false, message: "Not allowed." });
    }

    const audit = await loadAuditForSupplier(auditId, supplierOwnerId);
    if (!audit) {
      return res.status(404).json({ status: false, message: "Audit not found." });
    }

    const query = { auditRequestId: auditId, status: { $ne: "REASSIGNED" } };
    if (req.user.role === "supplierUser") {
      query.assignedToUserId = req.user._id;
    }

    const assignments = await QuestionnaireSectionAssignment.find(query).lean();
    return res.status(200).json({ status: true, assignments });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

export const upsertDepartmentAssignments = async (req, res) => {
  try {
    const auditId = req.params.auditId;
    if (req.user?.role !== "supplier") {
      return res.status(403).json({ status: false, message: "Only supplier admins can assign sections." });
    }

    const supplierOwnerId = resolveSupplierOwnerId(req.user);
    const audit = await loadAuditForSupplier(auditId, supplierOwnerId);
    if (!audit) {
      return res.status(404).json({ status: false, message: "Audit not found." });
    }

    const { assignments = [] } = req.body || {};
    if (!Array.isArray(assignments) || !assignments.length) {
      return res.status(400).json({ status: false, message: "Assignments are required." });
    }

    const results = [];
    for (const entry of assignments) {
      const categoryName = String(entry?.categoryName || "").trim();
      const assignedToUserId = toId(entry?.assignedToUserId);
      if (!categoryName || !assignedToUserId) continue;

      const userExists = await User.findOne({
        _id: assignedToUserId,
        role: "supplierUser",
        invitedBy: supplierOwnerId,
      }).select("_id");
      if (!userExists) continue;

      const existing = await QuestionnaireSectionAssignment.findOne({
        auditRequestId: auditId,
        categoryName,
        status: { $ne: "REASSIGNED" },
      }).sort({ createdAt: -1 });

      if (existing && String(existing.assignedToUserId) === String(assignedToUserId)) {
        existing.dueDate = entry?.dueDate ? new Date(entry.dueDate) : existing.dueDate;
        existing.notes = entry?.notes ?? existing.notes ?? "";
        existing.status = existing.status || "ASSIGNED";
        await existing.save();
        results.push(existing.toObject());
        continue;
      }

      if (existing) {
        existing.status = "REASSIGNED";
        await existing.save();
      }

      const created = await QuestionnaireSectionAssignment.create({
        auditRequestId: auditId,
        tenantOrgId: audit?.tenantOrgId || null,
        categoryName,
        assignedToUserId,
        assignedByUserId: req.user?._id,
        status: "ASSIGNED",
        dueDate: entry?.dueDate ? new Date(entry.dueDate) : undefined,
        notes: entry?.notes || "",
      });
      results.push(created.toObject());
    }

    return res.status(200).json({ status: true, assignments: results });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

export const submitAssignmentsToSpoc = async (req, res) => {
  try {
    if (req.user?.role !== "supplierUser") {
      return res.status(403).json({ status: false, message: "Only supplier users can submit to SPOC." });
    }
    const auditId = req.params.auditId;
    const supplierOwnerId = resolveSupplierOwnerId(req.user);
    const audit = await loadAuditForSupplier(auditId, supplierOwnerId);
    if (!audit) {
      return res.status(404).json({ status: false, message: "Audit not found." });
    }

    const assignments = await QuestionnaireSectionAssignment.find({
      auditRequestId: auditId,
      assignedToUserId: req.user._id,
      status: { $ne: "REASSIGNED" },
    }).lean();

    if (!assignments.length) {
      return res.status(400).json({ status: false, message: "No assigned sections to submit." });
    }

    const categoryNames = assignments.map((a) => a.categoryName).filter(Boolean);
    const now = new Date();

    await QuestionnaireSectionAssignment.updateMany(
      {
        auditRequestId: auditId,
        assignedToUserId: req.user._id,
        categoryName: { $in: categoryNames },
        status: { $ne: "REASSIGNED" },
      },
      { $set: { status: "SUBMITTED", submittedAt: now } }
    );

    await AuditQuestions.updateMany(
      { auditRequestId: auditId, categoryName: { $in: categoryNames } },
      {
        $set: {
          responseStatus: "supplier_submitted",
          submittedByUserId: req.user._id,
          submittedToSpocAt: now,
          lastUpdatedByUserId: req.user._id,
          updatedAt: now,
        },
      }
    );

    return res.status(200).json({
      status: true,
      message: "Submitted to SPOC.",
      categories: categoryNames,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
