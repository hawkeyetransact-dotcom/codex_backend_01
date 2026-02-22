import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Template } from "../models/templateModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { AssessmentType } from "../models/assessmentTypeModel.js";
import { uploadQuestionnaireFile } from "./questionnaireUploadController.js";
import {
  extractTextFromBuffer,
  extractHtmlFromBuffer,
  isFormTemplate,
  buildDocumentTemplateFromText,
  renderDocumentBlocksToHtml,
} from "../services/questionnaireExtractionService.js";
import { normalizeDocumentTemplateText, normalizeTemplateText } from "../services/questionnaireGeminiService.js";
import {
  autoArchiveTemplatesForBucket,
  resolveArtifactTypeForTemplate,
  resolveTemplateScopeTenantId,
} from "../utils/templateLifecycle.js";

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

const cloneTemplateQuestions = async ({ sourceTemplateId, targetTemplateId }) => {
  if (!sourceTemplateId || !targetTemplateId || Number(sourceTemplateId) === Number(targetTemplateId)) return 0;
  const sourceQuestions = await TemplateQuestions.find({ templateId: Number(sourceTemplateId) }).lean();
  if (!sourceQuestions.length) return 0;
  const docs = sourceQuestions.map((question, idx) => {
    const rest = { ...(question || {}) };
    delete rest._id;
    delete rest.createdAt;
    delete rest.updatedAt;
    delete rest.__v;
    return {
      ...rest,
      templateId: Number(targetTemplateId),
      version: 1,
      order: Number.isFinite(rest?.order) ? rest.order : idx,
    };
  });
  if (!docs.length) return 0;
  await TemplateQuestions.insertMany(docs, { ordered: false });
  return docs.length;
};

export const getTemplate = async (req, res) => {
  try {
    const numericTemplateId = Number(req.params.templateId);
    if (!numericTemplateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }

    const template = await Template.findOne({ templateId: numericTemplateId }).lean();
    if (!template) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }
    // Templates are global for now; do not restrict by tenantId.

    let documentBody = template.documentBody || "";
    let documentHtml = template.extractionConfig?.documentHtml || "";
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
    if (!documentHtml && isFormTemplate(templateKind)) {
      const sourcePath = resolveTemplateSourcePath(template);
      if (sourcePath) {
        try {
          const buffer = fs.readFileSync(sourcePath);
          const mimeType =
            template.sourceMimeType ||
            inferMimeType(template.sourceFileName || path.basename(sourcePath));
          const { html } = await extractHtmlFromBuffer(mimeType, buffer);
          if (html) {
            documentHtml = html;
            await Template.updateOne(
              { templateId: numericTemplateId },
              { $set: { "extractionConfig.documentHtml": documentHtml } }
            );
          }
        } catch (error) {
          console.warn("Failed to derive document HTML", error.message);
        }
      }
    }

    if (!documentHtml && documentBody && isFormTemplate(templateKind)) {
      try {
        const parsed = buildDocumentTemplateFromText(documentBody);
        if (parsed?.blocks?.length) {
          documentHtml = renderDocumentBlocksToHtml(parsed.blocks);
          await Template.updateOne(
            { templateId: numericTemplateId },
            {
              $set: {
                "extractionConfig.documentHtml": documentHtml,
                "extractionConfig.documentBlocks": parsed.blocks,
              },
            }
          );
        }
      } catch (error) {
        console.warn("Failed to derive document HTML from text", error.message);
      }
    }

    const normalizedBody =
      (await normalizeDocumentTemplateText(documentBody, { templateType: templateKind })) ||
      (await normalizeTemplateText(documentBody, { templateType: templateKind }));
    if (normalizedBody && normalizedBody !== documentBody) {
      documentBody = normalizedBody;
      await Template.updateOne({ templateId: numericTemplateId }, { $set: { documentBody } });
    }

    const mergedExtractionConfig = {
      ...(template.extractionConfig || {}),
      ...(documentHtml ? { documentHtml } : {}),
    };
    return res
      .status(200)
      .json({ status: true, data: { ...template, documentBody, extractionConfig: mergedExtractionConfig } });
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
      templateScope = "",
      assessmentTypeId,
      status,
      includeLegacy = "true",
      includeEmpty = "true",
      includeArchived = "false",
    } = req.query || {};
    const includeArchivedFlag = String(includeArchived) === "true";
    const normalizedScope = String(templateScope || "").toUpperCase();
    const filters = [];
    if (normalizedScope === "TENANT") {
      if (!tenantId) {
        return res.status(200).json({ status: true, data: [] });
      }
      filters.push({ tenantId });
    } else if (normalizedScope === "GLOBAL") {
      filters.push({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] });
    } else if (tenantId) {
      filters.push({
        $or: [
          { tenantId },
          { tenantId: null },
          { tenantId: { $exists: false } },
          { "visibility.tenantOnly": false },
          { "visibility.tenantOnly": { $exists: false } },
        ],
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
    if (artifactType) {
      const normalizedArtifact = String(artifactType || "").toUpperCase();
      if (normalizedArtifact === "SCOPE") {
        filters.push({
          artifactType: { $in: ["SCOPE", "AGENDA"] },
        });
      } else if (normalizedArtifact === "EXECUTION_QUESTIONNAIRE") {
        filters.push({ artifactType: normalizedArtifact });
      } else {
        filters.push({ artifactType: normalizedArtifact });
      }
    }
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
        const typeVariants = Array.from(new Set([String(templateType || ""), normalizedType])).filter(Boolean);
        const resolvedArtifactType = resolveArtifactTypeForTemplate({ templateType: normalizedType });
        const templateTypeFilter = [{ templateType: { $in: typeVariants } }];
        if (resolvedArtifactType) {
          templateTypeFilter.push({ artifactType: resolvedArtifactType });
        }
        filters.push({ $or: templateTypeFilter });
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
    if (!includeArchivedFlag) {
      filters.push({ archiveFlag: { $ne: true } });
      if (!status) {
        filters.push({ status: { $ne: "ARCHIVED" } });
      }
    }
    if (status) {
      if (!includeArchivedFlag && String(status).toUpperCase() === "ARCHIVED") {
        return res.status(200).json({ status: true, data: [] });
      }
      filters.push({ status });
    }

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

      // Exclude legacy templates that are explicitly tied to non-execution artifacts (e.g. PRE_AUDIT_Q).
      const legacyIds = legacyCounts.map((entry) => entry._id);
      const legacyMeta = legacyIds.length
        ? await Template.find({ templateId: { $in: legacyIds } })
            .select("templateId templateType artifactType status archiveFlag")
            .lean()
        : [];
      const legacyMetaMap = new Map(
        legacyMeta.map((tpl) => [
          tpl.templateId,
          {
            templateType: tpl.templateType,
            artifactType: tpl.artifactType,
            status: tpl.status,
            archiveFlag: tpl.archiveFlag,
          },
        ])
      );

      const isExecutionTemplate = (meta) => {
        if (!meta) return true; // no metadata -> allow as legacy execution template
        if (meta.archiveFlag || String(meta.status || "").toUpperCase() === "ARCHIVED") return false;
        const type = String(meta.templateType || "").toUpperCase();
        const artifact = String(meta.artifactType || "").toUpperCase();
        if (type && type !== "EXECUTION_Q") return false;
        if (artifact && artifact !== "EXECUTION_QUESTIONNAIRE") return false;
        return true;
      };

      legacyCounts.forEach((entry) => {
        if (existingIds.has(entry._id)) return;
        const meta = legacyMetaMap.get(entry._id);
        if (!isExecutionTemplate(meta)) return;
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
    const tenantScopeId = req.tenantId || req.user?.tenant_id || null;
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
      templateScope = "GLOBAL",
      assessmentTypeId = null,
      status = "DRAFT",
      version = 1,
      extractionConfig = {},
    } = req.body || {};
    if (!name) return res.status(400).json({ status: false, error: "Template name is required" });
    const tenantId = resolveTemplateScopeTenantId({ templateScope, tenantId: tenantScopeId });
    const resolvedArtifactType = resolveArtifactTypeForTemplate({ artifactType, templateType });
    const nextId = await computeNextTemplateId();

    const resolvedAssessmentTypeId = await resolveAssessmentTypeId({
      assessmentTypeId,
      tenantId: tenantScopeId,
    });
    const normalizedVisibility = {
      ...(visibility && typeof visibility === "object" ? visibility : {}),
      tenantOnly: Boolean(tenantId),
    };
    const record = await Template.create({
      tenantId,
      templateId: nextId,
      name,
      riskcategory,
      Audittype,
      industry,
      categories: Array.isArray(categories) ? categories : [],
      phaseKey,
      artifactType: resolvedArtifactType || null,
      regulatoryMapping,
      productType,
      riskLevel,
      visibility: normalizedVisibility,
      templateType,
      assessmentTypeId: resolvedAssessmentTypeId || null,
      status,
      version,
      extractionConfig,
      archiveFlag: false,
      createdBy: req.user?._id,
    });

    const { archivedTemplateIds } = await autoArchiveTemplatesForBucket({
      tenantId,
      artifactType: resolvedArtifactType,
      templateType,
      assessmentTypeId: resolvedAssessmentTypeId,
      keepTemplateIds: [nextId],
    });

    return res.status(201).json({ status: true, data: record, meta: { archivedTemplateIds } });
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
      { $set: { status: "PUBLISHED", archiveFlag: false } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }
    const { archivedTemplateIds } = await autoArchiveTemplatesForBucket({
      tenantId: updated.tenantId || null,
      artifactType: updated.artifactType,
      templateType: updated.templateType,
      assessmentTypeId: updated.assessmentTypeId || null,
      keepTemplateIds: [updated.templateId],
    });
    return res.status(200).json({ status: true, data: updated, meta: { archivedTemplateIds } });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const saveTemplateContent = async (req, res) => {
  try {
    const tenantScopeId = req.tenantId || req.user?.tenant_id || null;
    const numericTemplateId = Number(req.params.templateId);
    if (!numericTemplateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }

    const template = await Template.findOne({ templateId: numericTemplateId }).lean();
    if (!template) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }

    const {
      documentHtml,
      documentBody,
      saveMode = "GLOBAL_REPLACE",
      name,
      templateScope = "TENANT",
      artifactType,
      templateType,
      phaseKey,
      assessmentTypeId,
    } = req.body || {};
    const hasHtml = typeof documentHtml === "string";
    const hasBody = typeof documentBody === "string";
    if (!hasHtml && !hasBody) {
      return res.status(400).json({ status: false, error: "documentHtml or documentBody is required" });
    }

    const resolvedArtifactType = resolveArtifactTypeForTemplate({
      artifactType: artifactType || template.artifactType,
      templateType: templateType || template.templateType,
    });
    const resolvedAssessmentTypeId = await resolveAssessmentTypeId({
      assessmentTypeId: assessmentTypeId || template.assessmentTypeId || null,
      tenantId: tenantScopeId,
    });
    const mergedExtractionConfig = {
      ...(template.extractionConfig || {}),
      ...(hasHtml ? { documentHtml: String(documentHtml || "") } : {}),
    };
    const nextDocumentBody = hasBody ? String(documentBody || "") : template.documentBody || "";
    const normalizedSaveMode = String(saveMode || "GLOBAL_REPLACE").toUpperCase();

    if (normalizedSaveMode === "TENANT_PERSONAL") {
      const tenantId = resolveTemplateScopeTenantId({ templateScope, tenantId: tenantScopeId });
      if (!tenantId) {
        return res.status(400).json({ status: false, error: "Tenant scope is required for personal templates" });
      }
      const nextTemplateId = await computeNextTemplateId();
      const nextName =
        typeof name === "string" && name.trim()
          ? name.trim()
          : `${template.name || `Template ${template.templateId}`} (Tenant)`;
      const created = await Template.create({
        tenantId,
        templateId: nextTemplateId,
        name: nextName,
        riskcategory: template.riskcategory || "",
        Audittype: template.Audittype || "",
        industry: template.industry || "",
        categories: Array.isArray(template.categories) ? template.categories : [],
        phaseKey: phaseKey || template.phaseKey || null,
        artifactType: resolvedArtifactType || null,
        regulatoryMapping: template.regulatoryMapping || {},
        productType: template.productType || "",
        riskLevel: template.riskLevel || "",
        visibility: {
          ...(template.visibility || {}),
          tenantOnly: true,
        },
        templateType: templateType || template.templateType || null,
        assessmentTypeId: resolvedAssessmentTypeId || null,
        sourceFile: template.sourceFile || "",
        sourceFileName: template.sourceFileName || "",
        sourceMimeType: template.sourceMimeType || "",
        documentBody: nextDocumentBody,
        status: "PUBLISHED",
        archiveFlag: false,
        version: 1,
        extractionConfig: mergedExtractionConfig,
        createdBy: req.user?._id,
      });
      const questionCount = await cloneTemplateQuestions({
        sourceTemplateId: template.templateId,
        targetTemplateId: nextTemplateId,
      });
      const { archivedTemplateIds } = await autoArchiveTemplatesForBucket({
        tenantId,
        artifactType: resolvedArtifactType,
        templateType: templateType || template.templateType,
        assessmentTypeId: resolvedAssessmentTypeId || null,
        keepTemplateIds: [nextTemplateId],
      });
      return res.status(201).json({
        status: true,
        data: created,
        meta: { saveMode: normalizedSaveMode, clonedQuestions: questionCount, archivedTemplateIds },
      });
    }

    const update = {
      name: typeof name === "string" && name.trim() ? name.trim() : template.name,
      phaseKey: phaseKey || template.phaseKey || null,
      artifactType: resolvedArtifactType || null,
      templateType: templateType || template.templateType || null,
      assessmentTypeId: resolvedAssessmentTypeId || null,
      documentBody: nextDocumentBody,
      extractionConfig: mergedExtractionConfig,
      archiveFlag: false,
    };
    const updated = await Template.findOneAndUpdate(
      { templateId: numericTemplateId },
      { $set: update, $inc: { version: 1 } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }
    const { archivedTemplateIds } = await autoArchiveTemplatesForBucket({
      tenantId: updated.tenantId || null,
      artifactType: updated.artifactType,
      templateType: updated.templateType,
      assessmentTypeId: updated.assessmentTypeId || null,
      keepTemplateIds: [updated.templateId],
    });
    return res.status(200).json({
      status: true,
      data: updated,
      meta: { saveMode: normalizedSaveMode, archivedTemplateIds },
    });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const updateTemplateFormatting = async (req, res) => {
  try {
    const { templateId } = req.params;
    const numericTemplateId = Number(templateId);
    if (!templateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }
    if (req.adminScope !== "PLATFORM") {
      return res.status(403).json({ status: false, error: "Forbidden" });
    }
    const { formatting = {} } = req.body || {};
    const updated = await Template.findOneAndUpdate(
      { templateId: numericTemplateId },
      { $set: { "extractionConfig.formatting": formatting } },
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
