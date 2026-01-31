import mongoose from "mongoose";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { QuestionnaireSectionAssignment } from "../models/questionnaireSectionAssignmentModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { User } from "../models/userModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { writeAuditEvent } from "../services/auditEventService.js";
import { ENABLE_AUDIT_EVENT_LOG } from "../config/featureFlags.js";

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

const notifySectionAssignment = async ({ tenantId, auditId, categoryName, assignedToUserId, dueDate, role }) => {
  if (!tenantId || !assignedToUserId) return;
  const title = `Questionnaire section assigned: ${categoryName}`;
  const message = dueDate
    ? `You have been assigned "${categoryName}" and it is due by ${new Date(dueDate).toLocaleDateString()}.`
    : `You have been assigned "${categoryName}".`;
  try {
    await NotificationOrchestratorService.emitEvent(
      "questionnaire.section_assigned",
      {
        entityType: "audit",
        entityId: auditId,
        title,
        message,
        action: { url: `/audits/${auditId}/report`, label: "Open questionnaire" },
        recipientStrategy: "explicit",
        recipientUserIds: [assignedToUserId],
        severity: "info",
      },
      { tenantId, role: role || "supplier" }
    );
  } catch (err) {
    console.error("notifySectionAssignment failed", err.message);
  }
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
    const tenantId = audit?.tenantOrgId || req.user?.tenant_id || null;
    for (const entry of assignments) {
      const categoryName = String(entry?.categoryName || "").trim();
      const assignedToUserId = toId(entry?.assignedToUserId);
      if (!categoryName || !assignedToUserId) continue;

      const userExists = await User.findOne({ _id: assignedToUserId, status: "ACTIVE" }).select("_id role invitedBy");
      const isSupplierAdmin = userExists?.role === "supplier" && String(userExists?._id) === String(supplierOwnerId);
      const isSupplierUser = userExists?.role === "supplierUser" && String(userExists?.invitedBy) === String(supplierOwnerId);
      if (!isSupplierAdmin && !isSupplierUser) continue;

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
        await notifySectionAssignment({
          tenantId,
          auditId,
          categoryName,
          assignedToUserId,
          dueDate: existing.dueDate,
          role: userExists?.role,
        });
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
      await notifySectionAssignment({
        tenantId,
        auditId,
        categoryName,
        assignedToUserId,
        dueDate: created.dueDate,
        role: userExists?.role,
      });
    }

    if (ENABLE_AUDIT_EVENT_LOG && tenantId && results.length) {
      await writeAuditEvent({
        tenantId,
        auditId: audit._id,
        entityType: "questionnaire",
        entityId: audit._id,
        action: "QUESTIONNAIRE_SECTION_ASSIGNED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: null,
        after: null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        meta: {
          assignments: results.map((entry) => ({
            categoryName: entry.categoryName,
            assignedToUserId: entry.assignedToUserId,
            dueDate: entry.dueDate || null,
          })),
        },
      });
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

    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: audit?.tenantOrgId || req.user?.tenant_id || null,
        auditId: audit._id,
        entityType: "questionnaire",
        entityId: audit._id,
        action: "QUESTIONNAIRE_SECTIONS_SUBMITTED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: null,
        after: null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        meta: { categories: categoryNames },
      });
    }

    const tenantId = audit?.tenantOrgId || req.user?.tenant_id || null;
    if (tenantId && supplierOwnerId) {
      const title = `Section responses submitted`;
      const message = `Supplier responses submitted for ${categoryNames.join(", ")}.`;
      try {
        await NotificationOrchestratorService.emitEvent(
          "questionnaire.section_submitted",
          {
            entityType: "audit",
            entityId: auditId,
            title,
            message,
            action: { url: `/audits/${auditId}/report`, label: "Review responses" },
            recipientStrategy: "explicit",
            recipientUserIds: [supplierOwnerId],
            severity: "info",
          },
          { tenantId, role: "supplier" }
        );
      } catch (err) {
        console.error("notify submit to SPOC failed", err.message);
      }
    }

    return res.status(200).json({
      status: true,
      message: "Submitted to SPOC.",
      categories: categoryNames,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
