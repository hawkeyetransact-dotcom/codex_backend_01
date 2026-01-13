import mongoose from "mongoose";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { QuestionnaireSectionAssignment } from "../models/questionnaireSectionAssignmentModel.js";

const MILESTONE_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2, SKIPPED: 2 };
const parseObjId = (val) => (mongoose.Types.ObjectId.isValid(val) ? new mongoose.Types.ObjectId(val) : undefined);
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
  if (desiredRank < currentRank) return;
  const update = { status: desiredStatus, updatedAt: new Date() };
  if (desiredStatus === "IN_PROGRESS" && !current?.startedAt) update.startedAt = new Date();
  if (desiredStatus === "COMPLETED") {
    update.completedAt = new Date();
    if (current?.expectedAt) update.isOverdue = current.expectedAt < new Date();
  }
  await WorkflowMilestoneInstance.findOneAndUpdate(filter, update, { new: true, upsert: true });
};
const syncMilestonesFromStatus = async ({ auditId, tenantId, trackStatus, questionnaireStatus, nextAuditOn }) => {
  if (!auditId || !tenantId) return;
  const statusNorm = (trackStatus || "").toLowerCase();
  const qStatus = (questionnaireStatus || "").toLowerCase();

  if (statusNorm.includes("request") || qStatus === "request_received") {
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (statusNorm.includes("questionnaire") || qStatus === "in_progress") {
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_COMPLETED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_SENT", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "sent_to_supplier") {
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_SENT", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_RECEIVED", desiredStatus: "IN_PROGRESS" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "supplier_draft") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "supplier_submitted" || statusNorm.includes("response completed") || nextAuditOn === "auditor") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_COMPLETED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_RECEIVED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (statusNorm.includes("review completed") || qStatus === "review_completed") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_COMPLETED", desiredStatus: "COMPLETED" });
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
  await syncMilestonesFromStatus({
    auditId: ExistingAudit._id,
    tenantId: parseObjId(ExistingAudit.tenantOrgId || ExistingAudit.tenant_id),
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

  try {
    // Check if Audit Request exists
    const existingAudit = await AuditRequestMaster.findById(auditRequestId);
    if (!existingAudit) {
      return res.status(403).json({ error: "Audit request does not exist." });
    }
    if (isSupplierUser || req.user?.role === "supplier") {
      if (existingAudit.questionnaireStatus === "supplier_submitted") {
        return res.status(403).json({ error: "Questionnaire is locked until auditor review." });
      }
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
      if (existing.categoryName) touchedCategories.add(existing.categoryName);
      const nextStatus = isSupplierUser ? "supplier_draft" : (status || existing.responseStatus || 'supplier_draft');

      return {
        updateOne: {
          filter: {
            _id: new mongoose.Types.ObjectId(String(questionId)),
            auditRequestId: new mongoose.Types.ObjectId(String(auditRequestId))
          },
          update: {
            $set: {
              YesNoAnswers: response.YesNoAnswers ?? existing.YesNoAnswers ?? null,
              textResponse: response.textResponse ?? existing.textResponse ?? null,
              docUrls: response.docUrls ?? existing.docUrls ?? '',
              internalNotes: response.internalNotes ?? existing.internalNotes ?? null,
              isComplient: typeof response.isComplient === 'boolean' ? response.isComplient : existing.isComplient ?? null,
              flagStatus: response.flagStatus ?? existing.flagStatus ?? 'auditor_accepted',
              messages: response.messages ?? existing.messages ?? '',
              PhysicalAuditRequired: typeof response.PhysicalAuditRequired === 'boolean'
                ? response.PhysicalAuditRequired
                : existing.PhysicalAuditRequired ?? false,
              responseDetails: response.responseDetails ?? existing.responseDetails ?? {},
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

    await syncMilestonesFromStatus({
      auditId: existingAudit._id,
      tenantId: parseObjId(existingAudit.tenantOrgId || existingAudit.tenant_id),
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
    const { auditRequestId, questionId, questionText, supplierId } = req.body;
    if (!auditRequestId || !questionId) {
      return res.status(400).json({ success: false, error: "auditRequestId and questionId are required" });
    }
    const audit = await AuditRequestMaster.findById(auditRequestId).lean();
    if (!audit) {
      return res.status(404).json({ success: false, error: "Audit not found" });
    }
    const recipient = supplierId || audit.supplier_id;
    if (!recipient) {
      return res.status(400).json({ success: false, error: "No supplier found for this audit" });
    }
    const tenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null;
    const title = "Follow-up requested on audit question";
    const message = questionText
      ? `Follow-up requested for question: ${questionText}`
      : "Follow-up requested for an audit question.";
    try {
      await NotificationOrchestratorService.emitEvent(
        "audit.question.followup",
        {
          entityType: "audit-question",
          entityId: questionId,
          auditId: auditRequestId,
          title,
          message,
          action: { url: `/audits/${auditRequestId}`, label: "View audit" },
          recipientStrategy: "explicit",
          recipientUserIds: [recipient],
          severity: "warning",
          metadata: { auditRequestId, questionId },
        },
        { tenantId, role: "supplier" }
      );
    } catch (err) {
      console.error("[flagQuestionFollowUp] notify failed", err.message);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("flagQuestionFollowUp error", error);
    return res.status(500).json({ success: false, error: "Unable to flag question" });
  }
};
