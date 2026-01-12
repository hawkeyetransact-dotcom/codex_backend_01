import mongoose from "mongoose";
import { DigiLockerDocument } from "../../models/digilockerDocumentModel.js";
import { DigiLockerDocumentVersion } from "../../models/digilockerDocumentVersionModel.js";
import { DigiLockerDocumentExtraction } from "../../models/digilockerDocumentExtractionModel.js";
import { DigiLockerQuestionEvidenceMap } from "../../models/digilockerQuestionEvidenceMapModel.js";
import { DigiLockerAuditEvidenceChecklist } from "../../models/digilockerAuditEvidenceChecklistModel.js";
import { DigiLockerAccessPolicy } from "../../models/digilockerAccessPolicyModel.js";
import { DigiLockerAuditTrailEvent } from "../../models/digilockerAuditTrailEventModel.js";
import { AuditQuestions } from "../../models/auditQuestionsModels.js";
import { TemplateQuestions } from "../../models/templateQuestionsModel.js";
import { extractTextFromBuffer, classifyAndExtract, suggestMappings } from "../ai/digilockerAiService.js";
import { readExtractedText, saveExtractedText, storeDocumentFile } from "./digilockerStorageService.js";

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;


const inferDocTypes = (text = "") => {
  const lower = text.toLowerCase();
  const types = new Set();
  if (lower.includes("sop") || lower.includes("procedure")) types.add("SOP");
  if (lower.includes("policy")) types.add("Policy");
  if (lower.includes("validation")) types.add("ValidationReport");
  if (lower.includes("certificate")) types.add("Certificate");
  if (lower.includes("training")) types.add("Record");
  return Array.from(types);
};

const inferTags = (text = "") => {
  const lower = text.toLowerCase();
  const tags = new Set();
  if (lower.includes("training")) tags.add("training");
  if (lower.includes("calibration")) tags.add("calibration");
  if (lower.includes("validation")) tags.add("validation");
  if (lower.includes("quality")) tags.add("quality");
  if (lower.includes("audit")) tags.add("audit");
  return Array.from(tags);
};

export const DigiLockerService = {
  async logAudit({ tenantId, actorUserId, action, entityType, entityId, metadata }) {
    if (!tenantId) return null;
    return DigiLockerAuditTrailEvent.create({
      tenantId,
      actorUserId,
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      metadata,
    });
  },

  async createDocument({ tenantId, supplierOrgId, ownerUserId, payload }) {
    const doc = await DigiLockerDocument.create({
      tenantId,
      supplierOrgId,
      ownerUserId,
      title: payload.title,
      description: payload.description || "",
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      standardRefs: Array.isArray(payload.standardRefs) ? payload.standardRefs : [],
      confidentiality: payload.confidentiality || "Internal",
      status: payload.status || "Draft",
      docType: payload.docType || "Other",
      department: payload.department || "Other",
      siteId: payload.siteId || undefined,
      productId: payload.productId || undefined,
    });
    return doc;
  },

  async uploadVersion({ documentId, tenantId, supplierOrgId, file, meta, actorUserId }) {
    const doc = await DigiLockerDocument.findOne({ _id: documentId, tenantId, supplierOrgId });
    if (!doc) throw new Error("Document not found");
    const stored = await storeDocumentFile({ file });
    const existingCount = await DigiLockerDocumentVersion.countDocuments({ documentId: doc._id });
    const versionLabel = meta.versionLabel || `v${existingCount + 1}.0`;
    const version = await DigiLockerDocumentVersion.create({
      tenantId,
      documentId: doc._id,
      versionLabel,
      effectiveDate: meta.effectiveDate ? new Date(meta.effectiveDate) : undefined,
      expiryDate: meta.expiryDate ? new Date(meta.expiryDate) : undefined,
      file: stored,
      uploadedBy: actorUserId,
    });

    const extraction = await extractTextFromBuffer({
      buffer: file.buffer,
      mimeType: stored.mimeType,
      fileName: stored.originalFileName,
    });
    const extractedRef = await saveExtractedText({ versionId: version._id, pages: extraction.pages, text: extraction.text });
    const ai = classifyAndExtract({ text: extraction.text });

    version.extractedTextRef = extractedRef;
    version.extractedFields = {
      ...version.extractedFields,
      ...ai.keyFields,
    };
    await version.save();

    await DigiLockerDocumentExtraction.create({
      tenantId,
      documentId: doc._id,
      versionId: version._id,
      provider: "mock",
      classification: {
        docTypeGuess: ai.docTypeGuess,
        departmentGuess: ai.departmentGuess,
        confidence: ai.confidence,
      },
      suggestedTags: ai.suggestedTags,
      keyFields: ai.keyFields,
    });

    doc.currentVersionId = version._id;
    doc.aiSummary = `${ai.docTypeGuess} ${ai.departmentGuess}`.trim();
    doc.aiConfidence = ai.confidence;
    if (doc.status === "Draft") doc.status = "Submitted";
    await doc.save();

    await this.logAudit({
      tenantId,
      actorUserId,
      action: "UPLOAD_VERSION",
      entityType: "DocumentVersion",
      entityId: version._id,
      metadata: { documentId: doc._id },
    });

    return { document: doc, version };
  },

  async listDocuments({ tenantId, supplierOrgId, filters = {}, pagination = {} }) {
    const query = { tenantId };
    if (supplierOrgId) query.supplierOrgId = supplierOrgId;
    if (filters.siteId) query.siteId = toObjectId(filters.siteId) || filters.siteId;
    if (filters.productId) query.productId = toObjectId(filters.productId) || filters.productId;
    if (filters.department) query.department = filters.department;
    if (filters.docType) query.docType = filters.docType;
    if (filters.status) query.status = filters.status;
    if (filters.tag) query.tags = filters.tag;
    if (filters.confidentiality) query.confidentiality = filters.confidentiality;
    if (filters.search) query.$text = { $search: filters.search };

    if (filters.expiryBefore) {
      const expiryDate = new Date(filters.expiryBefore);
      const docsWithVersions = await DigiLockerDocumentVersion.find({
        tenantId,
        expiryDate: { $lte: expiryDate },
      }).select("documentId");
      const ids = docsWithVersions.map((v) => v.documentId);
      query._id = { $in: ids };
    }

    const page = Number(pagination.page || 1);
    const pageSize = Number(pagination.pageSize || 25);
    const skip = (page - 1) * pageSize;

    const sort = { updatedAt: -1 };
    const total = await DigiLockerDocument.countDocuments(query);
    const documents = await DigiLockerDocument.find(query).sort(sort).skip(skip).limit(pageSize).lean();
    const versionIds = documents.map((doc) => doc.currentVersionId).filter(Boolean);
    const versions = await DigiLockerDocumentVersion.find({ _id: { $in: versionIds } }).lean();
    const versionMap = new Map(versions.map((v) => [String(v._id), v]));

    return {
      items: documents.map((doc) => ({
        ...doc,
        currentVersion: doc.currentVersionId ? versionMap.get(String(doc.currentVersionId)) || null : null,
      })),
      total,
      page,
      pageSize,
    };
  },

  async getDocument({ tenantId, documentId }) {
    const document = await DigiLockerDocument.findOne({ _id: documentId, tenantId }).lean();
    if (!document) return null;
    const versions = await DigiLockerDocumentVersion.find({ documentId }).sort({ createdAt: -1 }).lean();
    const extractionMap = await DigiLockerDocumentExtraction.find({
      documentId,
      tenantId,
    }).lean();
    return {
      ...document,
      versions,
      extractions: extractionMap,
    };
  },

  async updateDocument({ tenantId, documentId, update }) {
    const allowed = {};
    ["title", "description", "tags", "standardRefs", "confidentiality", "status", "docType", "department", "siteId", "productId"].forEach(
      (field) => {
        if (update[field] !== undefined) allowed[field] = update[field];
      }
    );
    return DigiLockerDocument.findOneAndUpdate(
      { _id: documentId, tenantId },
      { $set: allowed },
      { new: true }
    );
  },

  async suggestTags({ tenantId, documentId }) {
    const document = await DigiLockerDocument.findOne({ _id: documentId, tenantId }).lean();
    if (!document?.currentVersionId) throw new Error("Document version missing");
    const version = await DigiLockerDocumentVersion.findById(document.currentVersionId).lean();
    if (!version?.extractedTextRef) throw new Error("Extraction missing");
    const extracted = await readExtractedText(version.extractedTextRef);
    const ai = classifyAndExtract({ text: extracted.text });
    const extraction = await DigiLockerDocumentExtraction.findOneAndUpdate(
      { tenantId, documentId, versionId: version._id },
      {
        $set: {
          classification: {
            docTypeGuess: ai.docTypeGuess,
            departmentGuess: ai.departmentGuess,
            confidence: ai.confidence,
          },
          suggestedTags: ai.suggestedTags,
          keyFields: ai.keyFields,
        },
      },
      { new: true, upsert: true }
    );
    return extraction;
  },

  async applyTags({ tenantId, documentId, payload }) {
    const updates = {
      docType: payload.docType,
      department: payload.department,
      tags: payload.tags,
      siteId: payload.siteId,
      productId: payload.productId,
      standardRefs: payload.standardRefs,
      status: payload.status,
      confidentiality: payload.confidentiality,
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    const document = await DigiLockerDocument.findOneAndUpdate(
      { _id: documentId, tenantId },
      { $set: updates },
      { new: true }
    );
    return document;
  },

  async listQuestionEvidence({ tenantId, auditId, questionId }) {
    const query = { tenantId, questionId };
    if (auditId) query.auditId = auditId;
    const mappings = await DigiLockerQuestionEvidenceMap.find(query)
      .populate("documentId")
      .populate("versionId")
      .sort({ createdAt: -1 })
      .lean();
    return mappings;
  },

  async attachEvidence({ tenantId, auditId, templateId, questionId, documentId, versionId, mappingType, actorUserId }) {
    const filter = { tenantId, questionId, documentId };
    if (auditId) filter.auditId = auditId;
    const existing = await DigiLockerQuestionEvidenceMap.findOne(filter);
    if (existing) {
      existing.versionId = versionId || existing.versionId;
      existing.mappingType = mappingType || existing.mappingType;
      existing.confidence = existing.confidence || null;
      await existing.save();
      return existing;
    }
    const created = await DigiLockerQuestionEvidenceMap.create({
      tenantId,
      auditId,
      templateId,
      questionId,
      documentId,
      versionId,
      mappingType: mappingType || "SupplierAttached",
      createdBy: actorUserId,
    });
    return created;
  },

  async suggestEvidence({ tenantId, supplierOrgId, questionText, siteId, productId, limit = 8 }) {
    const query = { tenantId };
    if (supplierOrgId) query.supplierOrgId = supplierOrgId;
    if (siteId) query.siteId = toObjectId(siteId) || siteId;
    if (productId) query.productId = toObjectId(productId) || productId;
    const documents = await DigiLockerDocument.find(query).sort({ updatedAt: -1 }).limit(200).lean();
    const versionIds = documents.map((doc) => doc.currentVersionId).filter(Boolean);
    const versions = await DigiLockerDocumentVersion.find({ _id: { $in: versionIds } }).lean();
    const versionMap = new Map(versions.map((v) => [String(v._id), v]));

    const candidates = [];
    for (const doc of documents) {
      const version = doc.currentVersionId ? versionMap.get(String(doc.currentVersionId)) : null;
      if (!version?.extractedTextRef) continue;
      const extracted = await readExtractedText(version.extractedTextRef);
      candidates.push({
        document: doc,
        version,
        pages: extracted.pages || [],
        text: extracted.text || "",
      });
    }

    const ranked = suggestMappings({
      questionText,
      candidates: candidates.map((item) => ({
        documentId: item.document._id,
        versionId: item.version._id,
        title: item.document.title,
        docType: item.document.docType,
        tags: item.document.tags || [],
        pages: item.pages,
        text: item.text,
      })),
    });

    const versionById = new Map(versions.map((v) => [String(v._id), v]));
    return ranked.slice(0, limit).map((item) => {
      const version = versionById.get(String(item.versionId));
      return {
        ...item,
        effectiveDate: version?.effectiveDate,
        expiryDate: version?.expiryDate,
      };
    });
  },

  async computeAuditChecklist({ tenantId, auditId, siteId, productId }) {
    const existing = await DigiLockerAuditEvidenceChecklist.findOne({ tenantId, auditId }).lean();
    if (existing) return existing;

    const questions = await AuditQuestions.find({ auditRequestId: auditId }).lean();
    const items = [];
    for (const q of questions) {
      const requiredDocTypes = inferDocTypes(q.question || "");
      const requiredTags = inferTags(q.question || "");
      items.push({
        questionId: String(q._id),
        requiredDocTypes,
        requiredTags,
        status: "Missing",
        recommendedDocs: [],
        lastComputedAt: new Date(),
      });
    }

    const checklist = await DigiLockerAuditEvidenceChecklist.create({
      tenantId,
      auditId,
      siteId,
      productId,
      items,
    });
    return checklist.toObject();
  },

  async refreshChecklist({ tenantId, auditId, siteId, productId, supplierOrgId }) {
    const checklist = await this.computeAuditChecklist({ tenantId, auditId, siteId, productId });
    const map = new Map(checklist.items.map((item) => [item.questionId, item]));
    const mappings = await DigiLockerQuestionEvidenceMap.find({ tenantId, auditId }).lean();
    const mappedQuestions = new Set(mappings.map((m) => String(m.questionId)));
    const now = new Date();

    const questions = await AuditQuestions.find({ auditRequestId: auditId }).lean();
    for (const q of questions) {
      const item = map.get(String(q._id));
      if (!item) continue;
      if (mappedQuestions.has(String(q._id))) {
        item.status = "AvailableMapped";
        continue;
      }
      const suggestions = await this.suggestEvidence({
        tenantId,
        supplierOrgId,
        questionText: q.question || "",
        siteId,
        productId,
        limit: 3,
      });
      item.recommendedDocs = suggestions.map((s) => ({
        documentId: s.documentId,
        versionId: s.versionId,
        confidence: s.confidence,
      }));
      if (!suggestions.length) {
        item.status = "Missing";
        continue;
      }
      const hasExpired = suggestions.some((s) => s.expiryDate && new Date(s.expiryDate) < now);
      const topConfidence = suggestions[0]?.confidence || 0;
      if (hasExpired) item.status = "NeedsReviewExpired";
      else if (topConfidence < 0.45) item.status = "NeedsReviewLowConfidence";
      else item.status = "AvailableUnmapped";
      item.lastComputedAt = new Date();
    }

    await DigiLockerAuditEvidenceChecklist.updateOne(
      { tenantId, auditId },
      { $set: { items: Array.from(map.values()) } }
    );
    return DigiLockerAuditEvidenceChecklist.findOne({ tenantId, auditId }).lean();
  },

  async listSharedDocuments({ tenantId, auditId }) {
    const accessPolicies = await DigiLockerAccessPolicy.find({
      tenantId,
      $or: [{ auditId }, { scope: "Document" }],
    }).lean();
    const docIds = accessPolicies.map((policy) => policy.documentId).filter(Boolean);
    if (!docIds.length) return [];
    return DigiLockerDocument.find({ tenantId, _id: { $in: docIds } }).lean();
  },

  async suggestQuestionsForDocument({ tenantId, documentId, auditId, templateId, limit = 10 }) {
    const document = await DigiLockerDocument.findOne({ _id: documentId, tenantId }).lean();
    if (!document?.currentVersionId) throw new Error("Document version missing");
    const version = await DigiLockerDocumentVersion.findById(document.currentVersionId).lean();
    if (!version?.extractedTextRef) throw new Error("Extraction missing");
    const extracted = await readExtractedText(version.extractedTextRef);
    const candidate = {
      documentId: document._id,
      versionId: version._id,
      title: document.title,
      docType: document.docType,
      tags: document.tags || [],
      pages: extracted.pages || [],
      text: extracted.text || "",
    };

    let questions = [];
    if (auditId) {
      questions = await AuditQuestions.find({ auditRequestId: auditId }).lean();
    } else if (templateId) {
      questions = await TemplateQuestions.find({ templateId }).lean();
    }

    const results = questions
      .map((q) => {
        const matches = suggestMappings({ questionText: q.question || "", candidates: [candidate] });
        const top = matches[0];
        return {
          questionId: String(q._id),
          questionText: q.question || "",
          confidence: top?.confidence || 0,
          pageNumber: top?.pageNumber || 1,
        };
      })
      .filter((item) => item.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return results;
  },
};
