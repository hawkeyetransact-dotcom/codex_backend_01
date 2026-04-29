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

const normalizeRole = (value) => {
  const raw = String(value || "").toLowerCase();
  if (!raw) return "";
  const compact = raw.replace(/[\s_-]/g, "");
  if (compact === "supplieradmin") return "supplier";
  if (compact === "supplieruser") return "supplieruser";
  if (compact === "tenantadmin") return "tenant_admin";
  if (compact === "superadmin") return "superadmin";
  return raw;
};

const hasMeaningfulValue = (val) => {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (typeof val === "number" || typeof val === "boolean") return true;
  if (Array.isArray(val)) return val.some((item) => hasMeaningfulValue(item));
  if (typeof val === "object") return Object.values(val).some((item) => hasMeaningfulValue(item));
  return false;
};

const resolveSupplierOwnerId = (user) => {
  if (!user) return null;
  const role = normalizeRole(user.role);
  if (role === "supplier") return user._id;
  if (role === "supplieruser") return user.invitedBy || null;
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

/**
 * G4: Bulk-assign questionnaire categories to multiple supplier teammates.
 *
 * POST /api/audits/:auditId/department-assignments/bulk
 * Body: {
 *   assignments: [
 *     { categoryName: 'GMP Quality Systems', assignedToUserIds: ['<id1>', '<id2>'], dueDate?: '2026-05-15' },
 *     { categoryName: 'Production Controls',  assignedToUserIds: ['<id3>'] }
 *   ],
 *   replaceExisting?: boolean (default false — when true, marks prior active assignments REASSIGNED)
 * }
 *
 * Permission: supplier (admin) only — supplierUser cannot reassign.
 */
export const bulkAssignSections = async (req, res) => {
  try {
    const role = normalizeRole(req.user?.role);
    if (role !== "supplier") {
      return res.status(403).json({ error: "Only the supplier admin may bulk-assign sections" });
    }
    const supplierOwnerId = resolveSupplierOwnerId(req.user);
    const audit = await loadAuditForSupplier(req.params.auditId, supplierOwnerId);
    if (!audit) return res.status(404).json({ error: "Audit not found or not yours" });

    const { assignments = [], replaceExisting = false } = req.body || {};
    if (!Array.isArray(assignments) || !assignments.length) {
      return res.status(400).json({ error: "assignments must be a non-empty array" });
    }

    // Validate all user IDs first.
    const allUserIds = [...new Set(assignments.flatMap((a) => a.assignedToUserIds || []))];
    if (!allUserIds.length) {
      return res.status(400).json({ error: "no assignedToUserIds supplied" });
    }
    const users = await User.find({
      _id: { $in: allUserIds },
      $or: [{ _id: supplierOwnerId }, { invitedBy: supplierOwnerId }],
    }).select("_id email").lean();
    const validUserIds = new Set(users.map((u) => String(u._id)));
    const invalid = allUserIds.filter((u) => !validUserIds.has(String(u)));
    if (invalid.length) {
      return res.status(400).json({ error: `User(s) not in your supplier org: ${invalid.join(", ")}` });
    }

    if (replaceExisting) {
      const cats = assignments.map((a) => a.categoryName);
      await QuestionnaireSectionAssignment.updateMany(
        {
          auditRequestId: audit._id,
          categoryName: { $in: cats },
          status: { $in: ["ASSIGNED", "IN_PROGRESS"] },
        },
        { $set: { status: "REASSIGNED" } }
      );
    }

    const ops = [];
    for (const row of assignments) {
      for (const uid of row.assignedToUserIds || []) {
        ops.push({
          insertOne: {
            document: {
              auditRequestId: audit._id,
              tenantOrgId: String(audit.tenantOrgId || req.tenantId || ""),
              categoryName: row.categoryName,
              assignedToUserId: toId(uid),
              assignedByUserId: req.user._id,
              status: "ASSIGNED",
              dueDate: row.dueDate ? new Date(row.dueDate) : null,
            },
          },
        });
      }
    }
    if (!ops.length) return res.json({ data: { inserted: 0 } });
    const result = await QuestionnaireSectionAssignment.bulkWrite(ops, { ordered: false });

    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: audit.tenantOrgId,
        auditId: audit._id,
        entityType: "questionnaire-section-assignment",
        entityId: audit._id,
        action: "BULK_ASSIGN_SECTIONS",
        actorId: req.user._id,
        actorRole: req.user.role,
        meta: { count: ops.length, replaceExisting },
      });
    }

    // Notify each assignee.
    try {
      const distinctUserIds = [...new Set(allUserIds.map(String))];
      await NotificationOrchestratorService.emitEvent(
        "questionnaire.section_assigned",
        {
          entityType: "audit",
          entityId: audit._id,
          title: "Questionnaire sections assigned",
          message: "You have been assigned questionnaire sections to fill.",
          action: { url: `/audits/${audit._id}/questionnaire`, label: "Open questionnaire" },
          recipientStrategy: "explicit",
          recipientUserIds: distinctUserIds,
          severity: "info",
        },
        { tenantId: audit.tenantOrgId, role: "supplier" }
      );
    } catch (notifyErr) {
      console.error("bulkAssignSections notify failed:", notifyErr.message);
    }

    return res.status(201).json({
      data: { inserted: result.insertedCount || ops.length },
    });
  } catch (err) {
    console.error("bulkAssignSections error:", err);
    return res.status(500).json({ error: err.message });
  }
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
        action: { url: `/audits/${auditId}/questionnaire`, label: "Open questionnaire" },
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
    const actorRole = normalizeRole(req.user?.role);
    const supplierOwnerId = resolveSupplierOwnerId(req.user);
    if (!supplierOwnerId) {
      return res.status(403).json({ status: false, message: "Not allowed." });
    }

    const audit = await loadAuditForSupplier(auditId, supplierOwnerId);
    if (!audit) {
      return res.status(404).json({ status: false, message: "Audit not found." });
    }

    const query = { auditRequestId: auditId, status: { $ne: "REASSIGNED" } };
    if (actorRole === "supplieruser") {
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
    const actorRole = normalizeRole(req.user?.role);
    if (actorRole !== "supplier") {
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
      const assigneeRole = normalizeRole(userExists?.role);
      const isSupplierAdmin = assigneeRole === "supplier" && String(userExists?._id) === String(supplierOwnerId);
      const isSupplierUser = assigneeRole === "supplieruser" && String(userExists?.invitedBy) === String(supplierOwnerId);
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
          role: assigneeRole,
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
        role: assigneeRole,
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
    const actorRole = normalizeRole(req.user?.role);
    if (!["supplieruser", "supplier"].includes(actorRole)) {
      return res.status(403).json({ status: false, message: "Only supplier users/admins can submit sections." });
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

    const requestedCategories = Array.isArray(req.body?.categories)
      ? req.body.categories.map((c) => String(c || "").trim()).filter(Boolean)
      : [];
    const requestedSet = requestedCategories.length ? new Set(requestedCategories) : null;
    const targetAssignments = requestedSet
      ? assignments.filter((a) => requestedSet.has(String(a.categoryName || "")))
      : assignments;

    if (!targetAssignments.length) {
      return res.status(400).json({ status: false, message: "No matching assigned sections to submit." });
    }

    const categoryNames = Array.from(
      new Set(targetAssignments.map((a) => String(a.categoryName || "").trim()).filter(Boolean))
    );
    if (!categoryNames.length) {
      return res.status(400).json({ status: false, message: "No valid categories to submit." });
    }

    const mandatoryQuestions = await AuditQuestions.find({
      auditRequestId: auditId,
      categoryName: { $in: categoryNames },
      isMandatory: true,
    })
      .select("_id categoryName YesNoAnswers textResponse docUrls responseDetails")
      .lean();

    const missingMandatoryByCategory = {};
    mandatoryQuestions.forEach((question) => {
      const answered =
        hasMeaningfulValue(question.YesNoAnswers) ||
        hasMeaningfulValue(question.textResponse) ||
        hasMeaningfulValue(question.docUrls) ||
        hasMeaningfulValue(question.responseDetails);
      if (answered) return;
      const key = String(question.categoryName || "Uncategorized");
      missingMandatoryByCategory[key] = (missingMandatoryByCategory[key] || 0) + 1;
    });

    if (Object.keys(missingMandatoryByCategory).length) {
      return res.status(400).json({
        status: false,
        message: "Mandatory questions are missing for one or more selected sections.",
        missingMandatoryByCategory,
      });
    }

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
    if (
      tenantId &&
      supplierOwnerId &&
      actorRole === "supplieruser" &&
      String(supplierOwnerId) !== String(req.user?._id)
    ) {
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
      message: actorRole === "supplier" ? "Sections marked submitted." : "Submitted to SPOC.",
      categories: categoryNames,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
