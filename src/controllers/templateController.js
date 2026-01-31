import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Template } from "../models/templateModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { AssessmentType } from "../models/assessmentTypeModel.js";
import { uploadQuestionnaireFile } from "./questionnaireUploadController.js";
import { extractTextFromBuffer, isFormTemplate } from "../services/questionnaireExtractionService.js";
import { normalizeDocumentTemplateText, normalizeTemplateText } from "../services/questionnaireGeminiService.js";

const computeNextTemplateId = async () => {
  const [maxFromTemplates, maxFromQuestions] = await Promise.all([
    Template.findOne().sort({ templateId: -1 }).select("templateId").lean(),
    TemplateQuestions.findOne().sort({ templateId: -1 }).select("templateId").lean(),
  ]);
  const maxVal = Math.max(maxFromTemplates?.templateId || 0, maxFromQuestions?.templateId || 0);
  return maxVal + 1;
};

const resolveAssessmentTypeId = async ({ assessmentTypeId, tenantId }) => {
  if (!assessmentTypeId) return null;
  if (mongoose.Types.ObjectId.isValid(assessmentTypeId)) {
    return new mongoose.Types.ObjectId(assessmentTypeId);
  }
  const byKey = await AssessmentType.findOne({
    key: assessmentTypeId,
    $or: [{ tenantId }, { tenantId: null }],
  })
    .select("_id")
    .lean();
  return byKey?._id || null;
};

const resolveTemplateSourcePath = (template) => {
  if (!template) return "";
  const rawSourcePath = template.sourceFile || template.extractionConfig?.sourceUrl || "";
  const candidates = [];
  if (rawSourcePath) {
    candidates.push(rawSourcePath);
    if (!path.isAbsolute(rawSourcePath)) {
      candidates.push(path.join(process.cwd(), rawSourcePath));
    }
  }
  if (template.sourceFileName) {
    candidates.push(path.join(process.cwd(), "uploads", template.sourceFileName));
    candidates.push(path.join(process.cwd(), "test", "data", template.sourceFileName));
  }
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || "";
};

const inferMimeType = (filename = "") => {
  const ext = path.extname(filename || "").toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".doc") return "application/msword";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".txt") return "text/plain";
  return "";
};

export const getTemplate = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const numericTemplateId = Number(req.params.templateId);
    if (!numericTemplateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }

    const template = await Template.findOne({ templateId: numericTemplateId }).lean();
    if (!template) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }
    if (tenantId && template.tenantId && String(template.tenantId) !== String(tenantId)) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }

    let documentBody = template.documentBody || "";
    const templateKind = template.templateType || template.artifactType || "";
    if (!documentBody && isFormTemplate(templateKind)) {
      const sourcePath = resolveTemplateSourcePath(template);
      if (sourcePath) {
        try {
          const buffer = fs.readFileSync(sourcePath);
          const mimeType =
            template.sourceMimeType ||
            inferMimeType(template.sourceFileName || path.basename(sourcePath));
          const { text } = await extractTextFromBuffer(mimeType, buffer);
          documentBody = text || "";
          if (documentBody) {
            await Template.updateOne({ templateId: numericTemplateId }, { $set: { documentBody } });
          }
        } catch (error) {
          console.warn("Failed to derive document body", error.message);
        }
      }
    }

    const normalizedBody =
      (await normalizeDocumentTemplateText(documentBody, { templateType: templateKind })) ||
      (await normalizeTemplateText(documentBody, { templateType: templateKind }));
    if (normalizedBody && normalizedBody !== documentBody) {
      documentBody = normalizedBody;
      await Template.updateOne({ templateId: numericTemplateId }, { $set: { documentBody } });
    }

    return res.status(200).json({ status: true, data: { ...template, documentBody } });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const listTemplates = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const {
      phaseKey,
      artifactType,
      productType,
      riskLevel,
      templateType,
      assessmentTypeId,
      status,
      includeLegacy = "true",
      includeEmpty = "true",
    } = req.query || {};
    const filters = [];
    if (tenantId) {
      filters.push({
        $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }],
      });
    }
    if (phaseKey) {
      if (phaseKey === "EXECUTION" && includeLegacy !== "false") {
        filters.push({
          $or: [{ phaseKey }, { phaseKey: { $in: [null, ""] } }, { phaseKey: { $exists: false } }],
        });
      } else {
        filters.push({ phaseKey });
      }
    }
    if (artifactType) filters.push({ artifactType });
    if (productType) filters.push({ productType });
    if (riskLevel) filters.push({ riskLevel });
    const normalizedArtifact = String(artifactType || "").toUpperCase();
    if (templateType) {
      const normalizedType = String(templateType || "").toUpperCase();
      const allowLegacyTemplateType = includeLegacy !== "false" && normalizedType === "EXECUTION_Q";
      if (allowLegacyTemplateType) {
        filters.push({
          $or: [
            { templateType },
            { templateType: null },
            { templateType: "" },
            { templateType: { $exists: false } },
          ],
        });
      } else {
        filters.push({ templateType });
      }
    }
    if (assessmentTypeId) {
      if (mongoose.Types.ObjectId.isValid(assessmentTypeId)) {
        const resolvedId = new mongoose.Types.ObjectId(assessmentTypeId);
        filters.push({
          $or: [
            { assessmentTypeId: resolvedId },
            { assessmentTypeId: null },
            { assessmentTypeId: { $exists: false } },
          ],
        });
      } else {
        const resolved = await AssessmentType.findOne({
          key: assessmentTypeId,
          $or: [{ tenantId }, { tenantId: null }],
        })
          .select("_id")
          .lean();
        if (resolved?._id) {
          filters.push({
            $or: [
              { assessmentTypeId: resolved._id },
              { assessmentTypeId: null },
              { assessmentTypeId: { $exists: false } },
            ],
          });
        }
      }
    }
    if (status) filters.push({ status });

    const matchStage = filters.length ? { $and: filters } : {};

    let templates = await Template.aggregate([
      ...(filters.length ? [{ $match: matchStage }] : []),
      {
        $lookup: {
          from: "templateQuestions",
          localField: "templateId",
          foreignField: "templateId",
          as: "qs",
        },
      },
      {
        $addFields: {
          questionCount: { $size: "$qs" },
        },
      },
      { $project: { qs: 0 } },
      { $sort: { templateId: 1 } },
    ]);

    const allowLegacyByArtifact =
      includeLegacy !== "false" && !templateType && normalizedArtifact === "EXECUTION_QUESTIONNAIRE";
    const allowLegacyByTemplate =
      includeLegacy !== "false" && String(templateType || "").toUpperCase() === "EXECUTION_Q";
    if (allowLegacyByArtifact || allowLegacyByTemplate) {
      const existingIds = new Set(templates.map((item) => item.templateId));
      const legacyCounts = await TemplateQuestions.aggregate([
        { $group: { _id: "$templateId", questionCount: { $sum: 1 }, updatedAt: { $max: "$updatedAt" } } },
      ]);
      legacyCounts.forEach((entry) => {
        if (existingIds.has(entry._id)) return;
        templates.push({
          templateId: entry._id,
          name: `Template ${entry._id}`,
          questionCount: entry.questionCount || 0,
          updatedAt: entry.updatedAt,
        });
      });
      templates = templates.sort((a, b) => (a.templateId || 0) - (b.templateId || 0));
    }
    const includeEmptyFlag = includeEmpty !== "false";
    const filtered = includeEmptyFlag ? templates : templates.filter((t) => (t.questionCount || 0) > 0);
    return res.status(200).json({ status: true, data: filtered });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const createTemplate = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const {
      name,
      riskcategory = "",
      Audittype = "",
      industry = "",
      categories = [],
      phaseKey = null,
      artifactType = null,
      regulatoryMapping = {},
      productType = "",
      riskLevel = "",
      visibility = {},
      templateType = null,
      assessmentTypeId = null,
      status = "DRAFT",
      version = 1,
      extractionConfig = {},
    } = req.body || {};
    if (!name) return res.status(400).json({ status: false, error: "Template name is required" });
    const nextId = await computeNextTemplateId();

    const resolvedAssessmentTypeId = await resolveAssessmentTypeId({ assessmentTypeId, tenantId });
    const record = await Template.create({
      tenantId,
      templateId: nextId,
      name,
      riskcategory,
      Audittype,
      industry,
      categories: Array.isArray(categories) ? categories : [],
      phaseKey,
      artifactType,
      regulatoryMapping,
      productType,
      riskLevel,
      visibility,
      templateType,
      assessmentTypeId: resolvedAssessmentTypeId || null,
      status,
      version,
      extractionConfig,
      createdBy: req.user?._id,
    });

    return res.status(201).json({ status: true, data: record });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const { templateId } = req.params;
    const numericTemplateId = Number(templateId);
    if (!templateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }

    const template = await Template.findOne({ templateId: numericTemplateId }).lean();
    if (!template) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }
    if (tenantId && template.tenantId && String(template.tenantId) !== String(tenantId)) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }

    // Only creator or admin can delete
    const isOwner = template.createdBy && String(template.createdBy) === String(req.user?._id);
    const isAdmin = req.user?.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ status: false, error: "Not authorized to delete this template" });
    }

    await Promise.all([
      TemplateQuestions.deleteMany({ templateId: numericTemplateId }),
      Template.deleteOne({ templateId: numericTemplateId }),
    ]);

    return res.status(200).json({ status: true, message: "Template and its questions deleted" });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const publishTemplate = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const { templateId } = req.params;
    const numericTemplateId = Number(templateId);
    if (!templateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }
    const query = { templateId: numericTemplateId };
    if (tenantId) {
      query.$or = [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }];
    }
    const updated = await Template.findOneAndUpdate(
      query,
      { $set: { status: "PUBLISHED" } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }
    return res.status(200).json({ status: true, data: updated });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const extractTemplateUpload = async (req, res) => {
  try {
    const numericTemplateId = Number(req.params.templateId);
    req.body = req.body || {};
    req.body.templateId = numericTemplateId;
    if (!Number.isNaN(numericTemplateId)) {
      const template = await Template.findOne({ templateId: numericTemplateId }).lean();
      if (template) {
        req.body.templateType = req.body.templateType || template.templateType || null;
        req.body.assessmentTypeId = req.body.assessmentTypeId || template.assessmentTypeId || null;
      }
    }
    return uploadQuestionnaireFile(req, res);
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const getTemplateSource = async (req, res) => {
  try {
    const numericTemplateId = Number(req.params.templateId);
    if (!numericTemplateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }

    const template = await Template.findOne({ templateId: numericTemplateId }).lean();
    if (!template) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }

    const sourcePath = resolveTemplateSourcePath(template);
    if (!sourcePath) {
      return res.status(404).json({ status: false, error: "Template source file not available" });
    }

    const filename = template.sourceFileName || path.basename(sourcePath);
    const mimeType = template.sourceMimeType || "application/pdf";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    const stream = fs.createReadStream(sourcePath);
    stream.on("error", (err) => {
      res.status(500).json({ status: false, error: err.message });
    });
    stream.pipe(res);
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};
