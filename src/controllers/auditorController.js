import mongoose from "mongoose";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { QuestionnaireSectionAssignment } from "../models/questionnaireSectionAssignmentModel.js";
import { WorkflowMilestoneService, applyWorkflowTransition } from "../services/workflowMilestoneService.js";
import { resolveAuditWorkflowTenantId } from "../utils/workflowTenant.js";

const MILESTONE_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2, SKIPPED: 2 };
const parseObjId = (val) => (mongoose.Types.ObjectId.isValid(val) ? new mongoose.Types.ObjectId(val) : undefined);
const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);
const toId = (value) => (value ? value.toString() : "");
const resolveRequestLabel = (audit) =>
  audit?.hawkeyeRequestId || audit?.internalRequestId || audit?.supplierRequestId || audit?._id?.toString?.() || "";
const ensureWorkflowRecord = async (tenantId, auditId, code) => {
  if (!tenantId || !auditId || !code) return null;
  const filter = {
    tenantId,
    workflowType: "AUDIT",
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    milestoneCode: code,
  };
  const existing = await WorkflowMilestoneInstance.findOne(filter);
  if (existing) return existing;
  return WorkflowMilestoneInstance.create({ ...filter, status: "NOT_STARTED" });
};
const advanceMilestone = async ({ tenantId, auditId, code, desiredStatus }) => {
  if (!tenantId || !auditId || !code || !desiredStatus) return;
  await ensureWorkflowRecord(tenantId, auditId, code);
  const filter = {
    tenantId,
    workflowType: "AUDIT",
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    milestoneCode: code,
  };
  const current = await WorkflowMilestoneInstance.findOne(filter).lean();
  const currentRank = MILESTONE_ORDER[current?.status] ?? 0;
  const desiredRank = MILESTONE_ORDER[desiredStatus] ?? 0;
  if (desiredRank < currentRank || current?.status === desiredStatus) return;

  if (desiredStatus === "IN_PROGRESS") {
    await WorkflowMilestoneService.markMilestoneStarted(auditId, code, { tenantId, role: "system" });
    return;
  }

  if (desiredStatus === "COMPLETED") {
    await WorkflowMilestoneService.markMilestoneCompleted(auditId, code, { tenantId, role: "system" });
    return;
  }

  const update = { status: desiredStatus, updatedAt: new Date() };
  if (desiredStatus === "SKIPPED") update.completedAt = new Date();
  await WorkflowMilestoneInstance.findOneAndUpdate(filter, update, { new: true, upsert: true });
};
const syncMilestonesFromStatus = async ({ auditId, tenantId, trackStatus, questionnaireStatus, nextAuditOn }) => {
  if (!auditId || !tenantId) return;
  const statusNorm = (trackStatus || "").toLowerCase();
  const qStatus = (questionnaireStatus || "").toLowerCase();

  if (statusNorm.includes("request") || qStatus === "request_received") {
    await advanceMilestone({ tenantId, auditId, code: "AR_CREATED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ASSIGNED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ACCEPTANCE_PENDING", desiredStatus: "IN_PROGRESS" });
  }
  if (statusNorm.includes("questionnaire") || qStatus === "in_progress") {
    await advanceMilestone({ tenantId, auditId, code: "TEMPLATE_SELECTION_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_PREP_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "sent_to_supplier") {
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_PREP_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_RELEASED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "supplier_draft") {
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "supplier_submitted" || statusNorm.includes("response completed")) {
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_SUBMITTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "followup_requested") {
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_REQUESTED", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "followup_submitted") {
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_REQUESTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_RESPONSES_SUBMITTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "IN_PROGRESS" });
  }
  if (statusNorm.includes("review completed") || qStatus === "review_completed") {
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FINAL_REVIEW_AND_SIGNOFF", desiredStatus: "IN_PROGRESS" });
  }
};

const resolveWorkflowTenantId = async (audit) =>
  resolveAuditWorkflowTenantId({
    auditId: audit?._id,
    fallbackTenantId: parseObjId(audit?.tenantOrgId || audit?.tenant_id || audit?.tenantId),
  });

export const acceptAuditRequest = async (req, res) => {
  try {
    const { auditId } = req.params;
    const audit = await AuditRequestMaster.findById(auditId);
    if (!audit) return res.status(404).json({ error: "Audit request not found" });

    const role = req.user?.role;
    const isAdmin = ADMIN_ROLES.has(role);
    if (!isAdmin && toId(audit.auditor_id) !== toId(req.user?._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const decision = String(audit.auditorDecision || "PENDING").toUpperCase();
    if (decision === "ACCEPTED") {
      return res.status(200).json({ message: "Audit request already accepted", audit });
    }
    if (decision === "REJECTED") {
      return res.status(409).json({ error: "Audit request already rejected" });
    }

    audit.auditorDecision = "ACCEPTED";
    audit.auditorDecisionAt = new Date();
    audit.auditorDecisionBy = req.user?._id || null;
    audit.auditorRejectionReason = null;
    audit.trackStatus = audit.trackStatus || "Auditor accepted";
    audit.nextAuditOn = "auditor";
    await audit.save();

    const tenantId = await resolveWorkflowTenantId(audit);
    if (tenantId) {
      await applyWorkflowTransition({
        workflowType: "AUDIT",
        entityType: "AuditRequest",
        entityId: audit._id,
        transitionCode: "AUDITOR_ACCEPT",
        context: { tenantId, role: role || "auditor", req },
      });
    }

    if (tenantId && audit.create_by_buyer_id) {
      const requestLabel = resolveRequestLabel(audit);
      await NotificationOrchestratorService.emitEvent(
        "audit.request.accepted",
        {
          entityType: "audit",
          entityId: audit._id,
          title: "Audit request accepted",
          message: requestLabel ? `Auditor accepted audit ${requestLabel}.` : "Auditor accepted audit request.",
          action: { url: `/audits/${audit._id}`, label: "View audit" },
          actionRequired: false,
          recipientStrategy: "explicit",
          recipientUserIds: [audit.create_by_buyer_id],
          severity: "info",
        },
        { tenantId, role: "buyer" }
      );
    }

    return res.status(200).json({ message: "Audit request accepted", audit });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to accept audit request" });
  }
};

export const rejectAuditRequest = async (req, res) => {
  try {
    const { auditId } = req.params;
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return res.status(400).json({ error: "Rejection reason is required" });

    const audit = await AuditRequestMaster.findById(auditId);
    if (!audit) return res.status(404).json({ error: "Audit request not found" });

    const role = req.user?.role;
    const isAdmin = ADMIN_ROLES.has(role);
    if (!isAdmin && toId(audit.auditor_id) !== toId(req.user?._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const decision = String(audit.auditorDecision || "PENDING").toUpperCase();
    if (decision === "REJECTED") {
      return res.status(200).json({ message: "Audit request already rejected", audit });
    }
    if (decision === "ACCEPTED") {
      return res.status(409).json({ error: "Audit request already accepted" });
    }

    audit.auditorDecision = "REJECTED";
    audit.auditorDecisionAt = new Date();
    audit.auditorDecisionBy = req.user?._id || null;
    audit.auditorRejectionReason = reason;
    audit.trackStatus = "Auditor rejected";
    audit.nextAuditOn = "buyer";
    await audit.save();

    const tenantId = await resolveWorkflowTenantId(audit);
    if (tenantId) {
      await applyWorkflowTransition({
        workflowType: "AUDIT",
        entityType: "AuditRequest",
        entityId: audit._id,
        transitionCode: "AUDITOR_REJECT",
        context: { tenantId, role: role || "auditor", req },
      });
    }

    if (tenantId && audit.create_by_buyer_id) {
      const requestLabel = resolveRequestLabel(audit);
      await NotificationOrchestratorService.emitEvent(
        "audit.request.rejected",
        {
          entityType: "audit",
          entityId: audit._id,
          title: "Audit request rejected",
          message: requestLabel ? `Auditor rejected audit ${requestLabel}: ${reason}` : `Auditor rejected audit request: ${reason}`,
          action: { url: `/audits/${audit._id}`, label: "View audit" },
          actionRequired: true,
          recipientStrategy: "explicit",
          recipientUserIds: [audit.create_by_buyer_id],
          severity: "warning",
        },
        { tenantId, role: "buyer" }
      );
    }

    return res.status(200).json({ message: "Audit request rejected", audit });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to reject audit request" });
  }
};

export const createProfile = async (req, res) => {
  try {
    const existingProfile = await AuditorProfile.findOne({
      user_id: req.user._id,
    });
    if (existingProfile)
      return res
        .status(400)
        .json({ error: "Profile already exists.", profile: existingProfile });

    const profile = new AuditorProfile({ user_id: req.user._id, ...req.body });
    await profile.save();

    res.status(201).json({ message: "Profile created successfully", profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const profile = await AuditorProfile.findOne({ user_id: req.user._id });

    if (!profile) return res.status(404).json({ error: "Profile not found." });

    await AuditorProfile.updateOne({ user_id: req.user._id }, req.body);

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createPreviewAuditQuestions = async (req, res) => {
  const { auditRequestId, questions = [], templateId } = req.body;
  const templateIdNumber = templateId !== undefined && templateId !== null ? Number(templateId) : undefined;
  const ExistingAudit = await AuditRequestMaster.findById(auditRequestId);
  if (!ExistingAudit) {
    return res
      .status(403)
      .json({ error: "Audit request does not exist." });
  }
  await AuditQuestions.updateMany(
    { auditRequestId },
    { $set: { isTempDeleted: true } }
  );
  const questionIds = questions?.map((q) => q.question_id).filter(Boolean) || [];
  const templateMap = new Map();
  if (questionIds.length) {
    const templateQuestions = await TemplateQuestions.find({ _id: { $in: questionIds } }).lean();
    templateQuestions.forEach((tq) => {
      templateMap.set(String(tq._id), tq);
    });
  }

  const bulkOperations = questions.map((q) => {
    const templateQuestion = q?.question_id ? templateMap.get(String(q.question_id)) : null;
    const resolvedTemplateId = templateQuestion?.templateId ?? q.templateId ?? templateIdNumber;
    const numericTemplateId = Number.isFinite(Number(resolvedTemplateId)) ? Number(resolvedTemplateId) : templateIdNumber;
    const answerType = templateQuestion?.answerType || q.answerType || "text";
    const isMandatory = Boolean(q?.isMandatory);
    const options = Array.isArray(templateQuestion?.options)
      ? templateQuestion.options
      : Array.isArray(q.options)
      ? q.options
      : [];
    const helperText = templateQuestion?.helperText || q.helperText || "";
    const subQuestions = Array.isArray(templateQuestion?.subQuestions)
      ? templateQuestion.subQuestions
      : Array.isArray(q.subQuestions)
      ? q.subQuestions
      : [];
    const normalizedQuestion =
      templateQuestion?.normalizedQuestion ||
      q.normalizedQuestion ||
      (q.question || templateQuestion?.question || "").toLowerCase().replace(/[\W_]+/g, "").trim();
    const responseSchema =
      templateQuestion?.responseSchema ||
      q.responseSchema || {
        type: answerType,
        options: (options || []).map((o) => ({ value: o, label: o })),
        helperText: helperText || "",
        placeholder: "",
        commentPlaceholder: "",
        required: false,
        validation: {},
        layout: {},
        subQuestions,
      };
    const riskcategory = templateQuestion?.riskcategory || q.riskcategory || "";
    const Audittype = templateQuestion?.Audittype || q.Audittype || "";
    const industry = templateQuestion?.industry || q.industry || "";
    const order = Number.isFinite(templateQuestion?.order) ? templateQuestion?.order : (Number(q.order) || 0);
    const questionCode = templateQuestion?.questionCode || q.questionCode;
    const extractionHints = templateQuestion?.extractionHints || q.extractionHints || {};
    const answerMapping = templateQuestion?.answerMapping || q.answerMapping || {};

    return {
      updateOne: {
        filter: { question_id: q.question_id, auditRequestId },  // Check if exists
        update: {
          $set: {
            question: q.question || templateQuestion?.question,
            categoryName: q.categoryName || templateQuestion?.categoryName,
            subCategoryName: q.subCategoryName || templateQuestion?.subCategoryName || "",
            templateId: numericTemplateId,
            categoryId: q.categoryId || templateQuestion?.categoryId,
            riskcategory,
            Audittype,
            industry,
            normalizedQuestion,
            questionCode,
            responseSchema,
            extractionHints,
            answerMapping,
            answerType,
            options,
            helperText,
            subQuestions,
            order,
            isMandatory,
            isTempDeleted: false  // Reactivate if previously deleted
          }
        },
        upsert: true  // Insert if not found
      }
    };
  });

  // Perform bulk write
  const bulkResult = await AuditQuestions.bulkWrite(bulkOperations);

  // Mark questionnaire as in progress as soon as a draft is saved
  await AuditRequestMaster.findByIdAndUpdate(auditRequestId, {
    $set: {
      questionnaireStatus: "in_progress",
      trackStatus: "Questionnaire in progress",
      isTempleteUsed: true,
      ...(templateId ? { selectedTemplateId: templateId } : {})
    }
  });
  const workflowTenantId = await resolveAuditWorkflowTenantId({
    auditId: ExistingAudit._id,
    fallbackTenantId: parseObjId(ExistingAudit.tenantOrgId || ExistingAudit.tenant_id),
  });
  await syncMilestonesFromStatus({
    auditId: ExistingAudit._id,
    tenantId: workflowTenantId,
    trackStatus: "Questionnaire in progress",
    questionnaireStatus: "in_progress",
  });

  res.status(200).json({
    resCode: 200,
    message: "Audit questions processed successfully.",
    bulkResult
  });
}

export const getAuditoQuestionsByRequestId = async (req, res) => {
  const { auditRequestId, page = 1, limit = 10 } = req.query;
  try {
    if (!auditRequestId) {
      return res
        .status(400)
        .json({ error: "request Id query parameter is required" });
    }
    const audit = await AuditRequestMaster.findById(auditRequestId)
      .select("questionnaireStatus")
      .lean();
    if (!audit) {
      return res.status(404).json({ error: "Audit request not found" });
    }
    const isSupplierRole = req.user?.role === "supplier" || req.user?.role === "supplierUser";
    if (isSupplierRole) {
      const qStatus = String(audit.questionnaireStatus || "").toLowerCase();
      const allowed = new Set([
        "sent_to_supplier",
        "supplier_submitted",
        "followup_requested",
        "followup_submitted",
        "review_completed",
        "auditor_submitted",
      ]);
      if (!allowed.has(qStatus)) {
        return res.status(403).json({ error: "Questionnaire is not released to supplier yet." });
      }
    }
    const query = { auditRequestId: auditRequestId };
    if (req.user?.role === "supplierUser") {
      const assignments = await QuestionnaireSectionAssignment.find({
        auditRequestId,
        assignedToUserId: req.user._id,
        status: { $ne: "REASSIGNED" },
      })
        .select("categoryName")
        .lean();
      const categories = assignments.map((a) => a.categoryName).filter(Boolean);
      if (!categories.length) {
        return res.status(200).json({
          mappings: [],
          totalRecords: 0,
          totalPages: 0,
          currentPage: Number(page),
        });
      }
      query.categoryName = { $in: categories };
    }
    const mappings = await AuditQuestions.find(query)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    const totalRecords = await AuditQuestions.countDocuments(query);
    res.status(200).json({
      mappings,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export const updateAuditResponses = async (req, res) => {
  const { responses, status } = req.body;
  const { auditRequestId } = req.params;
  const isSupplierUser = req.user?.role === "supplierUser";
  const isSupplierRole = isSupplierUser || req.user?.role === "supplier";

  try {
    // Check if Audit Request exists
    const existingAudit = await AuditRequestMaster.findById(auditRequestId);
    if (!existingAudit) {
      return res.status(403).json({ error: "Audit request does not exist." });
    }
    const auditStatus = String(existingAudit.questionnaireStatus || "").toLowerCase();
    const isFollowupRequested = auditStatus === "followup_requested";
    const supplierEditable = auditStatus === "sent_to_supplier" || isFollowupRequested;
    if (isSupplierRole && !supplierEditable) {
      return res.status(403).json({ error: "Questionnaire is locked until auditor review." });
    }

    // Fetch existing audit questions for this request
    const existingQuestions = await AuditQuestions.find({ auditRequestId });

    // Map existing data for quick access
    const existingMap = {};
    for (const doc of existingQuestions) {
      existingMap[doc._id.toString()] = doc;
    }

    const hasMeaningfulValue = (val) => {
      if (val === null || val === undefined) return false;
      if (typeof val === "string") return val.trim().length > 0;
      if (typeof val === "number" || typeof val === "boolean") return true;
      if (Array.isArray(val)) return val.some((item) => hasMeaningfulValue(item));
      if (typeof val === "object") return Object.values(val).some((item) => hasMeaningfulValue(item));
      return false;
    };

    const shouldValidateMandatory =
      status === "supplier_submitted" &&
      (req.user?.role === "supplier" || req.user?.role === "supplierUser");

    if (shouldValidateMandatory) {
      const responseLookup = responses || {};
      const missingMandatory = existingQuestions
        .filter((q) => q.isMandatory)
        .filter((q) => {
          const incoming = responseLookup[q._id.toString()] || {};
          const yesNo = incoming.YesNoAnswers ?? q.YesNoAnswers ?? null;
          const textResponse = incoming.textResponse ?? q.textResponse ?? null;
          const docUrls = incoming.docUrls ?? q.docUrls ?? "";
          const responseDetails = incoming.responseDetails ?? q.responseDetails ?? {};
          return !(
            hasMeaningfulValue(yesNo) ||
            hasMeaningfulValue(textResponse) ||
            hasMeaningfulValue(docUrls) ||
            hasMeaningfulValue(responseDetails)
          );
        })
        .map((q) => q._id.toString());

      if (missingMandatory.length) {
        return res.status(400).json({
          error: "Mandatory questions are missing responses.",
          missingQuestionIds: missingMandatory,
        });
      }
    }

    const responseEntries = Object.entries(responses || {});
    if (!responseEntries.length) {
      return res.status(200).json({
        resCode: 200,
        message: "No responses provided.",
      });
    }

    let allowedCategories = null;
    if (isSupplierUser) {
      const assignments = await QuestionnaireSectionAssignment.find({
        auditRequestId,
        assignedToUserId: req.user._id,
        status: { $ne: "REASSIGNED" },
      })
        .select("categoryName")
        .lean();
      allowedCategories = new Set(assignments.map((a) => a.categoryName).filter(Boolean));
    }

    const touchedCategories = new Set();
    const skippedQuestions = [];
    const bulkOperations = responseEntries.flatMap(([questionId, response]) => {
      const existing = existingMap[questionId] || {};
      if (!existing?._id) {
        skippedQuestions.push(questionId);
        return [];
      }
      if (isSupplierUser && allowedCategories && !allowedCategories.has(existing.categoryName)) {
        skippedQuestions.push(questionId);
        return [];
      }
      if (isSupplierRole && isFollowupRequested && existing.flagStatus !== "auditor_flagged") {
        skippedQuestions.push(questionId);
        return [];
      }
      if (existing.categoryName) touchedCategories.add(existing.categoryName);
      const nextStatus = isSupplierRole
        ? (status || existing.responseStatus || "supplier_draft")
        : (status || existing.responseStatus || "auditor_draft");

      const nextYesNo = response.YesNoAnswers ?? existing.YesNoAnswers ?? null;
      const nextText = response.textResponse ?? existing.textResponse ?? null;
      const nextDocUrls = response.docUrls ?? existing.docUrls ?? '';
      const nextDetails = response.responseDetails ?? existing.responseDetails ?? {};
      const hasSupplierResponse =
        isSupplierRole &&
        isFollowupRequested &&
        existing.flagStatus === "auditor_flagged" &&
        hasMeaningfulValue({
          YesNoAnswers: nextYesNo,
          textResponse: nextText,
          docUrls: nextDocUrls,
          responseDetails: nextDetails,
        });

      const nextFlagStatus = isSupplierRole
        ? (hasSupplierResponse ? "supplier_responded" : existing.flagStatus ?? "auditor_accepted")
        : (response.flagStatus ?? existing.flagStatus ?? "auditor_accepted");
      const nextMessages = isSupplierRole ? (existing.messages ?? '') : (response.messages ?? existing.messages ?? '');
      const nextInternalNotes = isSupplierRole ? (existing.internalNotes ?? null) : (response.internalNotes ?? existing.internalNotes ?? null);
      const nextAttachments = isSupplierRole
        ? (existing.auditorAttachments ?? [])
        : (response.auditorAttachments ?? existing.auditorAttachments ?? []);

      return {
        updateOne: {
          filter: {
            _id: new mongoose.Types.ObjectId(String(questionId)),
            auditRequestId: new mongoose.Types.ObjectId(String(auditRequestId))
          },
          update: {
            $set: {
              YesNoAnswers: nextYesNo,
              textResponse: nextText,
              docUrls: nextDocUrls,
              internalNotes: nextInternalNotes,
              isComplient: typeof response.isComplient === 'boolean' ? response.isComplient : existing.isComplient ?? null,
              flagStatus: nextFlagStatus,
              messages: nextMessages,
              auditorAttachments: nextAttachments,
              PhysicalAuditRequired: typeof response.PhysicalAuditRequired === 'boolean'
                ? response.PhysicalAuditRequired
                : existing.PhysicalAuditRequired ?? false,
              responseDetails: nextDetails,
              responseStatus: nextStatus,
              lastUpdatedByUserId: req.user?._id,
              updatedAt: new Date()
            }
          },
          upsert: false
        }
      };
    });

    if (!bulkOperations.length) {
      return res.status(200).json({
        resCode: 200,
        message: "No responses applied for this user.",
        skippedQuestions,
      });
    }

    const bulkResult = await AuditQuestions.bulkWrite(bulkOperations);

    if (isSupplierUser && touchedCategories.size) {
      await QuestionnaireSectionAssignment.updateMany(
        {
          auditRequestId,
          assignedToUserId: req.user._id,
          categoryName: { $in: Array.from(touchedCategories) },
          status: { $in: ["ASSIGNED", "REOPENED"] },
        },
        { $set: { status: "IN_PROGRESS" } }
      );
    }

    const workflowTenantId = await resolveAuditWorkflowTenantId({
      auditId: existingAudit._id,
      fallbackTenantId: parseObjId(existingAudit.tenantOrgId || existingAudit.tenant_id),
    });
    await syncMilestonesFromStatus({
      auditId: existingAudit._id,
      tenantId: workflowTenantId,
      questionnaireStatus: status,
      trackStatus: existingAudit.trackStatus,
      nextAuditOn: existingAudit.nextAuditOn,
    });

    return res.status(200).json({
      resCode: 200,
      message: "Audit questions updated successfully.",
      bulkResult,
      skippedQuestions,
    });

  } catch (error) {
    console.error('Error updating audit responses:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const flagQuestionFollowUp = async (req, res) => {
  try {
    const { auditRequestId, questionId, questionText, supplierId, message } = req.body;
    if (!auditRequestId || !questionId) {
      return res.status(400).json({ success: false, error: "auditRequestId and questionId are required" });
    }
    const audit = await AuditRequestMaster.findById(auditRequestId).lean();
    if (!audit) {
      return res.status(404).json({ success: false, error: "Audit not found" });
    }
    await AuditQuestions.updateOne(
      { _id: questionId, auditRequestId },
      {
        $set: {
          flagStatus: "auditor_flagged",
          ...(message ? { messages: message } : {}),
        },
      }
    );
    await AuditRequestMaster.findByIdAndUpdate(auditRequestId, {
      $set: {
        questionnaireStatus: "followup_requested",
        trackStatus: "Supplier follow up open",
        nextAuditOn: "supplier",
      },
    });
    const recipient = supplierId || audit.supplier_id;
    if (!recipient) {
      return res.status(400).json({ success: false, error: "No supplier found for this audit" });
    }
    const tenantId = await resolveAuditWorkflowTenantId({
      auditId: auditRequestId,
      fallbackTenantId: audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null,
    });
    if (tenantId) {
      await WorkflowMilestoneService.markMilestoneStarted(auditRequestId, "FOLLOWUP_REQUESTED", {
        tenantId,
        role: "auditor",
        req,
      });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("flagQuestionFollowUp error", error);
    return res.status(500).json({ success: false, error: "Unable to flag question" });
  }
};
