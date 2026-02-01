import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { QuestionnaireUpload } from "../models/questionnaireUploadModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { Categories } from "../models/categoriesModel.js";
import { Template } from "../models/templateModel.js";
import { AssessmentType } from "../models/assessmentTypeModel.js";
import {
  ensureUploadDir,
  processQuestionnaireUpload,
  computeDeltaForTemplate,
  extractTextFromBuffer,
  extractHtmlFromBuffer,
  isFormTemplate,
  extractQuestionsFromText,
  injectInlinePlaceholders,
  buildDocumentTemplateFromText,
} from "../services/questionnaireExtractionService.js";
import {
  coerceQuestionsFromGemini,
  extractQuestionnaireWithGemini,
  normalizeTemplateText,
  normalizeDocumentTemplateText,
} from "../services/questionnaireGeminiService.js";

const EXTRACTOR_URL = process.env.EXTRACTOR_URL || "http://localhost:8000/extract";

const normalizeQuestionText = (text = "") => {
  return text.toLowerCase().replace(/[\W_]+/g, "").trim();
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

const mapResponseType = (response_type = "") => {
  const rt = response_type.toLowerCase();
  if (rt === "yes_no") return { answerType: "radio", options: ["Yes", "No"], mapType: "yesno" };
  if (rt === "yes_no_na") return { answerType: "radio", options: ["Yes", "No", "NA"], mapType: "yesno" };
  if (rt === "single_select") return { answerType: "radio", options: [], mapType: "select" };
  if (rt === "multi_select") return { answerType: "checkbox", options: [], mapType: "checkbox" };
  return { answerType: "text", options: [], mapType: "text" };
};

const TEMPLATE_TYPE_TO_ARTIFACT = {
  INTIMATION_LETTER: "INTIMATION_LETTER",
  RFQ: "RFQ",
  SCOPE: "SCOPE",
  AGENDA: "AGENDA",
  PRE_AUDIT_Q: "PRE_AUDIT_QUESTIONNAIRE",
  EXECUTION_Q: "EXECUTION_QUESTIONNAIRE",
  CHECKLIST: "GMP_CHECKLIST",
  CAPA_NOTICE: "CAPA_PLAN",
  FINAL_REPORT: "FINAL_REPORT",
};

const ALLOW_EMPTY_TEMPLATE_TYPES = new Set([
  "INTIMATION_LETTER",
  "RFQ",
  "SCOPE",
  "AGENDA",
  "FINAL_REPORT",
  "CAPA_NOTICE",
]);

const resolveArtifactType = (templateType, artifactType) => {
  if (artifactType) return artifactType;
  if (!templateType) return null;
  const normalized = String(templateType || "").toUpperCase();
  return TEMPLATE_TYPE_TO_ARTIFACT[normalized] || null;
};

const callExternalExtractor = async (filePath, originalname) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer]);
    const form = new FormData();
    form.append("file", blob, originalname || path.basename(filePath));
    const resp = await fetch(EXTRACTOR_URL, { method: "POST", body: form });
    if (!resp.ok) throw new Error(`Extractor returned ${resp.status}`);
    const json = await resp.json();
    return { categories: json?.categories || [], meta: { extracted_text_items: json?.extracted_text_items, category_count: json?.category_count } };
  } catch (err) {
    console.warn("External extractor failed, falling back:", err.message);
    return null;
  }
};

export const uploadQuestionnaireFile = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "File is required." });
    }

    ensureUploadDir();
    const { originalname, mimetype, size, buffer } = req.file;
    const tenantId = req.tenantId || req.user?.tenant_id || null;
    const templateId = req.body?.templateId ? Number(req.body.templateId) : null;
    const templateType = req.body?.templateType || null;
    const assessmentTypeId = req.body?.assessmentTypeId || null;
    const resolvedAssessmentTypeId = await resolveAssessmentTypeId({ assessmentTypeId, tenantId });
    const formTemplate = isFormTemplate(templateType);
    const extractionConfig = req.body?.extractionConfig || {};
    const safeName = `${Date.now()}-${originalname.replace(/\s+/g, "_")}`;
    const destPath = path.join(process.cwd(), "uploads", safeName);
    fs.writeFileSync(destPath, buffer);

    let questions = [];
    let categories = [];
    let subCategories = [];
    let usedOcr = false;
    let textSource = "external";
    let meta = { characterCount: 0, fileName: originalname, size };
    let documentBody = "";
    let documentBlocks = [];
    let documentHtml = "";
    let rawTextForLlm = "";
    const llmThreshold = templateType === "PRE_AUDIT_Q" ? 20 : 0;

    if (formTemplate) {
      try {
        const extracted = await extractTextFromBuffer(mimetype, buffer);
        documentBody = extracted?.text || "";
        rawTextForLlm = documentBody;
      } catch (err) {
        console.warn("Document body extraction failed:", err.message);
      }
      try {
        const htmlExtracted = await extractHtmlFromBuffer(mimetype, buffer);
        documentHtml = htmlExtracted?.html || "";
      } catch (err) {
        console.warn("Document HTML extraction failed:", err.message);
      }
      const normalizedBody = await normalizeDocumentTemplateText(documentBody, { templateType });
      if (normalizedBody) {
        documentBody = normalizedBody;
      } else if (documentBody) {
        documentBody = injectInlinePlaceholders(documentBody);
      }
      if (documentBody) {
        const docParsed = buildDocumentTemplateFromText(documentBody);
        documentBlocks = docParsed.blocks;
        questions = docParsed.questions;
        categories = docParsed.categories;
        subCategories = docParsed.subCategories;
        textSource = "document-template";
      }
      if (documentHtml) {
        extractionConfig.documentHtml = documentHtml;
      }
    }

    if (!formTemplate) {
      const extCats = await callExternalExtractor(destPath, originalname);
      if (extCats && Array.isArray(extCats.categories) && extCats.categories.length) {
        const collected = [];
        extCats.categories.forEach((cat) => {
          const catName = cat?.name || "Uncategorized";
          categories.push(catName);
          (cat?.subcategories || []).forEach((sub) => {
            const subName = sub?.name || "General";
            subCategories.push(subName);
            (sub?.questions || []).forEach((qObj) => {
              if (!qObj?.text) return;
              const { answerType, options: defOpts, mapType } = mapResponseType(qObj.response_type || "");
              const opts = (qObj.options || []).length ? qObj.options : defOpts;
              const responseSchema = {
                type: answerType,
                options: opts.map((o) => ({ value: o, label: o })),
                helperText: "",
                required: false,
                validation: {},
                layout: {},
                subQuestions: [],
              };
              const answerMapping = {
                type: mapType,
                options: opts.map((o) => ({ value: o, aliases: [] })),
                joinChar: "|",
              };
              collected.push({
                question: qObj.text,
                categoryName: catName,
                subCategoryName: subName,
                answerType,
                options: opts,
                responseSchema,
                answerMapping,
                extractionHints: {
                  keywords: [catName, subName].filter(Boolean),
                  sections: [catName, subName].filter(Boolean),
                  expectedEntities: [],
                  confidencePolicy: "require_evidence",
                },
              });
            });
          });
        });
        questions = collected;
        console.log(`External extractor success: cats=${categories.length}, questions=${questions.length}`);
        meta = { ...meta, extracted_text_items: extCats.meta?.extracted_text_items, category_count: extCats.meta?.category_count };
      }
    }

    if (!questions.length) {
      const fallback = await processQuestionnaireUpload({
        file: req.file,
        defaultCategory: req.body?.defaultCategory,
        templateType,
      });
      questions = fallback.questions;
      categories = fallback.categories;
      subCategories = fallback.subCategories || [];
      usedOcr = fallback.usedOcr;
      textSource = fallback.textSource;
      meta = fallback.meta;
      if (formTemplate && !documentBody) {
        documentBody = fallback.documentBody || "";
      }
      if (!rawTextForLlm) {
        rawTextForLlm = fallback.documentBody || "";
      }
      console.log(`External extractor failed; using internal. Questions=${questions.length}`);
    }

    if (formTemplate && documentBody && !documentBlocks.length) {
      const placeholderQuestions = extractQuestionsFromText(documentBody, { templateType });
      if (placeholderQuestions.length && placeholderQuestions.length >= questions.length) {
        questions = placeholderQuestions;
        categories = Array.from(new Set(questions.map((q) => q.categoryName)));
        subCategories = Array.from(new Set(questions.map((q) => q.subCategoryName).filter(Boolean)));
        textSource = "template-body";
      }
    }

    if (llmThreshold && questions.length < llmThreshold) {
      if (!rawTextForLlm) {
        try {
          const extracted = await extractTextFromBuffer(mimetype, buffer);
          rawTextForLlm = extracted?.text || "";
        } catch {
          rawTextForLlm = "";
        }
      }
      const llmSource = rawTextForLlm || documentBody;
      if (llmSource) {
        try {
          const gemini = await extractQuestionnaireWithGemini(llmSource);
          const mapped = gemini ? coerceQuestionsFromGemini(gemini.categories || []) : null;
          if (mapped?.questions?.length) {
            questions = mapped.questions;
            categories = mapped.categories;
            subCategories = mapped.subCategories || [];
            textSource = "gemini";
            meta = { ...meta, geminiUsed: true };
          }
        } catch (err) {
          console.warn("LLM questionnaire extraction failed:", err.message);
        }
      }
    }

    categories = Array.from(new Set(categories.filter(Boolean)));
    subCategories = Array.from(new Set(subCategories.filter(Boolean)));

    const questionsWithNormalization = questions.map((q) => ({
      ...q,
      normalizedQuestion: normalizeQuestionText(q.question || ""),
    }));

    const delta = await computeDeltaForTemplate(TemplateQuestions, templateId, questionsWithNormalization);

    const record = await QuestionnaireUpload.create({
      tenantId,
      uploadedBy: req.user._id,
      fileName: originalname,
      mimeType: mimetype,
      size,
      status: "ready",
      message: questions.length ? "Parsed successfully" : "Uploaded; no questions detected",
      questions: questionsWithNormalization,
      categories,
      subCategories,
      sourceUrl: destPath,
      templateId,
      templateType,
      assessmentTypeId: resolvedAssessmentTypeId || null,
      delta,
      metadata: {
        usedOcr,
        textSource,
        characterCount: meta?.characterCount || 0,
      },
      extractionConfig: {
        ...extractionConfig,
        ...(documentBlocks.length ? { documentBlocks } : {}),
      },
      documentBody,
    });

    return res.status(201).json({
      status: true,
      data: {
        id: record._id,
        status: record.status,
        message: record.message,
        questionsFound: questions.length,
        delta,
      },
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const getQuestionnaireJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await QuestionnaireUpload.findById(id).lean();
    if (!job) return res.status(404).json({ status: false, error: "Job not found" });
    return res.status(200).json({ status: true, data: job });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const getQuestionnaireJobSource = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await QuestionnaireUpload.findById(id).lean();
    if (!job) return res.status(404).json({ status: false, error: "Job not found" });
    const sourcePath = job.sourceUrl;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(404).json({ status: false, error: "Source file not found" });
    }
    if (job.mimeType) {
      res.setHeader("Content-Type", job.mimeType);
    }
    return res.sendFile(path.resolve(sourcePath));
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const publishQuestionnaireJob = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      templateId,
      selectedQuestionIds,
      riskOverrides,
      Audittype,
      industry,
      templateName,
      riskcategory: riskcategoryBody,
      templateType,
      artifactType: artifactTypeBody,
      assessmentTypeId: assessmentTypeIdRaw,
      templateStatus = "PUBLISHED",
      extractionConfig = {},
      fieldLayouts = {},
    } = req.body;
    const tenantScopeId = req.tenantId || req.user?.tenant_id || null;
    const tenantId = null;
    const resolvedAssessmentTypeId = await resolveAssessmentTypeId({
      assessmentTypeId: assessmentTypeIdRaw,
      tenantId: tenantScopeId,
    });
    const resolvedArtifactType = resolveArtifactType(templateType, artifactTypeBody);
    const numericTemplateId = Number(templateId);
    if (!templateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }

    const job = await QuestionnaireUpload.findById(id).lean();
    if (!job) return res.status(404).json({ status: false, error: "Job not found" });
    const mergedExtractionConfig = {
      ...(job.extractionConfig || {}),
      ...(extractionConfig || {}),
    };
    const normalizedTemplateType = String(templateType || "").toUpperCase();
    const allowEmpty = ALLOW_EMPTY_TEMPLATE_TYPES.has(normalizedTemplateType);
    if (!job.questions || !job.questions.length) {
      if (!allowEmpty) {
        return res.status(400).json({ status: false, error: "No questions to publish" });
      }
    }

    let questionsToPublish = job.questions;
    if (Array.isArray(selectedQuestionIds) && selectedQuestionIds.length === 0 && allowEmpty) {
      questionsToPublish = [];
    }
    if (Array.isArray(selectedQuestionIds) && selectedQuestionIds.length) {
      const allowed = new Set(selectedQuestionIds.map((id) => String(id)));
      questionsToPublish = job.questions.filter((q) => {
        const key = q?._id ? String(q._id) : String(q.question);
        return allowed.has(key);
      });
      if (!questionsToPublish.length && !allowEmpty) {
        return res.status(400).json({ status: false, error: "No matching questions for the provided selection" });
      }
    }

    const lastVersion = await TemplateQuestions.find({ templateId: numericTemplateId })
      .sort({ version: -1 })
      .limit(1)
      .select("version")
      .lean();
    const nextVersion = (lastVersion?.[0]?.version || 0) + 1;

    // Ensure categories exist and map names to IDs
    const categoryNames = Array.from(new Set(questionsToPublish.map((q) => q.categoryName || "Uncategorized")));
    const existingCats = await Categories.find({ name: { $in: categoryNames } }).lean();
    const catMap = new Map(existingCats.map((c) => [c.name, c._id]));
    const toInsert = categoryNames.filter((name) => !catMap.has(name)).map((name) => ({ name }));
    if (toInsert.length) {
      const inserted = await Categories.insertMany(toInsert);
      inserted.forEach((c) => catMap.set(c.name, c._id));
    }

    const riskMap = Array.isArray(riskOverrides)
      ? new Map(riskOverrides.map((r) => [String(r.id), r.riskcategory]))
      : new Map();

    const docs = questionsToPublish.map((q, idx) => {
      const qid = String(q._id || q.question);
      const riskcategory = riskMap.get(qid) || q.riskcategory || "";
      const normalizedQuestion = q.normalizedQuestion || normalizeQuestionText(q.question || "");
      const layoutOverride =
        fieldLayouts && typeof fieldLayouts === "object" ? fieldLayouts[qid] || null : null;
      const responseSchema = q.responseSchema || {
        type: q.answerType || "text",
        options: (q.options || []).map((o) => ({ value: o, label: o })),
        helperText: q.helperText || "",
        placeholder: "",
        commentPlaceholder: "",
        required: false,
        validation: {},
        layout: {},
        subQuestions: q.subQuestions || [],
      };
      if (layoutOverride) {
        responseSchema.layout = layoutOverride;
      }
      return {
        question: q.question,
        questionCode: q.questionCode,
        categoryName: q.categoryName || "Uncategorized",
        subCategoryName: q.subCategoryName || "",
        templateId: numericTemplateId,
        categoryId: q.categoryId || catMap.get(q.categoryName || "Uncategorized") || new mongoose.Types.ObjectId(),
        riskcategory,
        Audittype: Audittype || q.Audittype || "",
        industry: industry || q.industry || "",
        Physical: "Y",
        normalizedQuestion,
        responseSchema,
        answerType: q.answerType || "text",
        options: q.options || [],
        helperText: q.helperText || "",
        subQuestions: q.subQuestions || [],
        extractionHints: q.extractionHints || {},
        answerMapping: q.answerMapping || {},
        order: Number.isFinite(q.order) ? q.order : idx,
        version: nextVersion,
      };
    });

    if (docs.length) {
      await TemplateQuestions.insertMany(docs);
    }

    // Upsert template metadata
    const documentBody = job.documentBody || "";
    if (
      templateName ||
      riskcategoryBody ||
      Audittype ||
      industry ||
      categoryNames.length ||
      templateType ||
      assessmentTypeIdRaw ||
      documentBody
    ) {
      await Template.findOneAndUpdate(
        { templateId: numericTemplateId },
        {
          $set: {
            tenantId,
            name: templateName || `Template ${numericTemplateId}`,
            riskcategory: riskcategoryBody || "",
            Audittype: Audittype || "",
            industry: industry || "",
            categories: categoryNames,
            templateType: templateType || null,
            artifactType: resolvedArtifactType || null,
            assessmentTypeId: resolvedAssessmentTypeId || null,
            sourceFile: job.sourceUrl || "",
            sourceFileName: job.fileName || "",
            sourceMimeType: job.mimeType || "",
            ...(documentBody ? { documentBody } : {}),
            status: templateStatus || "PUBLISHED",
            version: nextVersion,
            extractionConfig: mergedExtractionConfig,
          },
        },
        { upsert: true, new: true }
      );
    }

    await QuestionnaireUpload.findByIdAndUpdate(id, {
      $set: {
        tenantId: tenantScopeId || job.tenantId || null,
        status: "ready",
        message: `Published to template ${numericTemplateId} version ${nextVersion}`,
        templateId: numericTemplateId,
        templateType: templateType || job.templateType || null,
        assessmentTypeId: resolvedAssessmentTypeId || job.assessmentTypeId || null,
        version: nextVersion,
        metadata: job.metadata || {},
        extractionConfig: mergedExtractionConfig,
      },
    });

    return res.status(200).json({
      status: true,
      data: { templateId: numericTemplateId, version: nextVersion, count: docs.length },
    });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};
