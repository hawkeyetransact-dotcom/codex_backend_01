import mongoose from "mongoose";
import { Assessment } from "../../models/assessmentModel.js";
import { QuestionnaireArtifact } from "../../models/questionnaireArtifactModel.js";
import { Template } from "../../models/templateModel.js";
import { TemplateQuestions } from "../../models/templateQuestionsModel.js";
import { MODULE_PACKS } from "../../modules/auditEngine/modulePacks.js";
import { canAccessAssessment } from "../../utils/assessmentAccess.js";

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

const buildSectionsFromQuestions = (questions) => {
  const map = new Map();
  questions.forEach((q) => {
    const key = q.categoryName || "General";
    if (!map.has(key)) {
      map.set(key, { key, title: key, status: "DRAFT" });
    }
  });
  return Array.from(map.values());
};

const buildPreAuditQuestions = (assessment) => {
  const modules = assessment?.modules || [];
  const questions = [];
  modules.forEach((module) => {
    const pack = MODULE_PACKS[module];
    if (!pack?.preAuditQuestions?.length) return;
    pack.preAuditQuestions.forEach((q, index) => {
      questions.push({
        questionId: q.id,
        text: q.text,
        categoryName: q.category || module,
        order: index,
      });
    });
  });
  return questions;
};

const buildParticipants = (assessment) => ({
  supplierId: assessment.scope?.supplierId || null,
  auditorId: assessment.assignedAuditors?.[0]?.userId || null,
  buyerId: assessment.scope?.buyerId || null,
});

export const listQuestionnaires = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const filter = { tenantId };
    if (req.query?.kind) filter.kind = req.query.kind;
    if (req.query?.status) filter.status = req.query.status;
    if (req.query?.module) filter.module = req.query.module;
    if (req.query?.assessmentId) filter.assessmentId = req.query.assessmentId;

    const role = req.user?.role;
    if (role === "auditor") filter["participants.auditorId"] = req.user._id;
    if (role === "buyer") filter["participants.buyerId"] = req.user._id;
    if (role === "supplier") filter["participants.supplierId"] = req.user._id;
    if (role === "supplierUser" && req.user?.invitedBy) filter["participants.supplierId"] = req.user.invitedBy;

    const items = await QuestionnaireArtifact.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error("listQuestionnaires error", error);
    return res.status(500).json({ error: "Failed to list questionnaires" });
  }
};

export const createPreAuditQuestionnaire = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.params.id;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const assessment = await Assessment.findOne({ _id: assessmentId, tenantId }).lean();
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const questions = buildPreAuditQuestions(assessment);
    const sections = buildSectionsFromQuestions(questions);

    const artifact = await QuestionnaireArtifact.findOneAndUpdate(
      { tenantId, assessmentId, kind: "PRE_AUDIT" },
      {
        tenantId,
        assessmentId,
        kind: "PRE_AUDIT",
        module: assessment.modules?.[0],
        status: "SENT",
        sections,
        questions,
        responses: [],
        participants: buildParticipants(assessment),
      },
      { new: true, upsert: true }
    );

    return res.status(201).json({ success: true, data: artifact });
  } catch (error) {
    console.error("createPreAuditQuestionnaire error", error);
    return res.status(500).json({ error: "Failed to create pre-audit questionnaire" });
  }
};

export const createFullQuestionnaire = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.params.id;
    const templateId = req.body?.templateId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    if (!templateId) return res.status(400).json({ error: "templateId is required" });

    const assessment = await Assessment.findOne({ _id: assessmentId, tenantId }).lean();
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const templateIdValue = Number.isFinite(Number(templateId)) ? Number(templateId) : templateId;
    const template = await Template.findOne({ templateId: templateIdValue }).lean();
    const tplQuestions = await TemplateQuestions.find({ templateId: templateIdValue }).sort({ order: 1 }).lean();
    if (!template || !tplQuestions.length) {
      return res.status(404).json({ error: "Template not found or empty" });
    }
    const questions = tplQuestions.map((q, index) => ({
      questionId: String(q._id),
      questionCode: q.questionCode,
      text: q.question,
      categoryName: q.categoryName,
      answerType: q.answerType,
      options: q.options || [],
      responseSchema: q.responseSchema,
      required: q.isMandatory || false,
      order: q.order ?? index,
    }));
    const sections = buildSectionsFromQuestions(questions);

    const artifact = await QuestionnaireArtifact.findOneAndUpdate(
      { tenantId, assessmentId, kind: "FULL" },
      {
        tenantId,
        assessmentId,
        kind: "FULL",
        module: assessment.modules?.[0],
        status: "SENT",
        sections,
        questions,
        responses: [],
        templateRef: {
          templateId: String(templateId),
          version: template?.version || "1",
          name: template?.name || `Template ${templateId}`,
        },
        participants: buildParticipants(assessment),
      },
      { new: true, upsert: true }
    );

    return res.status(201).json({ success: true, data: artifact });
  } catch (error) {
    console.error("createFullQuestionnaire error", error);
    return res.status(500).json({ error: "Failed to create full questionnaire" });
  }
};

export const getQuestionnaire = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    const artifact = await QuestionnaireArtifact.findOne({ _id: req.params.qid, tenantId }).lean();
    if (!artifact) return res.status(404).json({ error: "Questionnaire not found" });
    const assessment = await Assessment.findOne({ _id: artifact.assessmentId, tenantId }).lean();
    if (!assessment || !canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });
    return res.json({ success: true, data: artifact });
  } catch (error) {
    console.error("getQuestionnaire error", error);
    return res.status(500).json({ error: "Failed to load questionnaire" });
  }
};

export const respondQuestionnaire = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const artifact = await QuestionnaireArtifact.findOne({ _id: req.params.qid, tenantId });
    if (!artifact) return res.status(404).json({ error: "Questionnaire not found" });

    const assessment = await Assessment.findOne({ _id: artifact.assessmentId, tenantId }).lean();
    if (!assessment || !canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const incoming = Array.isArray(req.body?.responses) ? req.body.responses : [];
    const responseMap = new Map((artifact.responses || []).map((r) => [String(r.questionId), r]));
    incoming.forEach((r) => {
      const key = String(r.questionId || "");
      if (!key) return;
      responseMap.set(key, {
        questionId: key,
        value: r.value,
        responseDetails: r.responseDetails,
        answeredBy: req.user?._id,
        answeredAt: new Date(),
        attachments: r.attachments || [],
      });
    });
    artifact.responses = Array.from(responseMap.values());
    artifact.status = req.body?.submit ? "SUBMITTED" : "IN_PROGRESS";
    await artifact.save();

    return res.json({ success: true, data: artifact });
  } catch (error) {
    console.error("respondQuestionnaire error", error);
    return res.status(500).json({ error: "Failed to save responses" });
  }
};

export const reviewQuestionnaire = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    const artifact = await QuestionnaireArtifact.findOne({ _id: req.params.qid, tenantId });
    if (!artifact) return res.status(404).json({ error: "Questionnaire not found" });
    const assessment = await Assessment.findOne({ _id: artifact.assessmentId, tenantId }).lean();
    if (!assessment || !canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const status = req.body?.status || "REVIEWED";
    artifact.status = status;
    await artifact.save();
    return res.json({ success: true, data: artifact });
  } catch (error) {
    console.error("reviewQuestionnaire error", error);
    return res.status(500).json({ error: "Failed to review questionnaire" });
  }
};
