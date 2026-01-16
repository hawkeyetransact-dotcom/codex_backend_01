import multer from "multer";
import { DigiLockerService } from "../services/digilocker/digilockerService.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const digilockerUploadMiddleware = upload.single("file");

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);
const SUPPLIER_ROLES = new Set(["supplier", "supplierUser"]);
const AUDITOR_ROLES = new Set(["auditor"]);
const BUYER_ROLES = new Set(["buyer"]);

const resolveSupplierOrgId = (user) => {
  if (!user) return null;
  if (user.role === "supplier") return user._id;
  if (user.role === "supplierUser") return user.invitedBy || null;
  return null;
};

const assertTenant = (entityTenantId, req) => {
  if (entityTenantId && req.tenantId && String(entityTenantId) !== String(req.tenantId)) {
    const err = new Error("Not Found");
    err.status = 404;
    throw err;
  }
};

const ensureAuditAccess = async (req, auditId) => {
  if (!auditId) return null;
  const audit = await AuditRequestMaster.findById(auditId).lean();
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  assertTenant(audit.tenantOrgId, req);

  if (ADMIN_ROLES.has(req.user?.role)) return audit;

  const supplierOrgId = resolveSupplierOrgId(req.user);
  if (SUPPLIER_ROLES.has(req.user?.role)) {
    if (supplierOrgId && String(audit.supplier_id) !== String(supplierOrgId)) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return audit;
  }

  if (AUDITOR_ROLES.has(req.user?.role)) {
    const ok = await canAuditorAccessAudit(req.user?._id, auditId);
    if (!ok && String(audit.auditor_id) !== String(req.user?._id)) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return audit;
  }

  if (BUYER_ROLES.has(req.user?.role)) {
    if (String(audit.create_by_buyer_id) !== String(req.user?._id)) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return audit;
  }

  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
};

export const createDocument = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const supplierOrgId = resolveSupplierOrgId(req.user);
    if (!supplierOrgId && !ADMIN_ROLES.has(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const targetSupplierId = supplierOrgId || req.body?.supplierOrgId;
    if (!targetSupplierId) return res.status(400).json({ error: "supplierOrgId is required" });
    const document = await DigiLockerService.createDocument({
      tenantId: req.tenantId,
      supplierOrgId: targetSupplierId,
      ownerUserId: req.user?._id,
      payload: req.body || {},
    });
    await DigiLockerService.logAudit({
      tenantId: req.tenantId,
      actorUserId: req.user?._id,
      action: "CREATE_DOCUMENT",
      entityType: "Document",
      entityId: document._id,
    });
    res.status(201).json({ success: true, data: document });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to create document" });
  }
};

export const uploadDocumentVersion = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    if (!req.file) return res.status(400).json({ error: "File missing" });
    const supplierOrgId = resolveSupplierOrgId(req.user) || req.body?.supplierOrgId;
    if (!supplierOrgId && !ADMIN_ROLES.has(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const result = await DigiLockerService.uploadVersion({
      documentId: req.params.documentId,
      tenantId: req.tenantId,
      supplierOrgId: supplierOrgId,
      file: req.file,
      meta: req.body || {},
      actorUserId: req.user?._id,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("digilocker upload failed", err);
    res.status(err.status || 500).json({ error: err.message || "Failed to upload version" });
  }
};

export const listDocuments = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const supplierOrgId = resolveSupplierOrgId(req.user);
    const auditId = req.query?.auditId;
    let scopedSupplierId = supplierOrgId;

    if (!supplierOrgId && auditId) {
      const audit = await ensureAuditAccess(req, auditId);
      scopedSupplierId = audit?.supplier_id || null;
    }

    if (!supplierOrgId && !scopedSupplierId && !ADMIN_ROLES.has(req.user?.role)) {
      return res.json({ success: true, data: { items: [], total: 0, page: 1, pageSize: 25 } });
    }

    const shouldScopeConfidentiality =
      !SUPPLIER_ROLES.has(req.user?.role) && !ADMIN_ROLES.has(req.user?.role);
    const filters = {
      siteId: req.query?.siteId,
      productId: req.query?.productId,
      department: req.query?.department,
      docType: req.query?.docType,
      status: req.query?.status,
      tag: req.query?.tag,
      search: req.query?.search,
      expiryBefore: req.query?.expiryBefore,
      confidentiality: shouldScopeConfidentiality ? "SharedWithAuditor" : req.query?.confidentiality,
    };

    const data = await DigiLockerService.listDocuments({
      tenantId: req.tenantId,
      supplierOrgId: scopedSupplierId,
      filters,
      pagination: { page: req.query?.page, pageSize: req.query?.pageSize },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load documents" });
  }
};

export const getDocument = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const document = await DigiLockerService.getDocument({
      tenantId: req.tenantId,
      documentId: req.params.id,
    });
    if (!document) return res.status(404).json({ error: "Document not found" });
    const supplierOrgId = resolveSupplierOrgId(req.user);
    if (supplierOrgId && String(document.supplierOrgId) !== String(supplierOrgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!supplierOrgId && !ADMIN_ROLES.has(req.user?.role) && document.confidentiality !== "SharedWithAuditor") {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ success: true, data: document });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load document" });
  }
};

export const updateDocument = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const existing = await DigiLockerService.getDocument({
      tenantId: req.tenantId,
      documentId: req.params.id,
    });
    if (!existing) return res.status(404).json({ error: "Document not found" });
    const supplierOrgId = resolveSupplierOrgId(req.user);
    if (supplierOrgId && String(existing.supplierOrgId) !== String(supplierOrgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const document = await DigiLockerService.updateDocument({
      tenantId: req.tenantId,
      documentId: req.params.id,
      update: req.body || {},
    });
    await DigiLockerService.logAudit({
      tenantId: req.tenantId,
      actorUserId: req.user?._id,
      action: "UPDATE_DOCUMENT",
      entityType: "Document",
      entityId: document._id,
    });
    res.json({ success: true, data: document });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to update document" });
  }
};

export const suggestTags = async (req, res) => {
  try {
    const extraction = await DigiLockerService.suggestTags({
      tenantId: req.tenantId,
      documentId: req.params.id,
    });
    res.json({ success: true, data: extraction });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to suggest tags" });
  }
};

export const applyTags = async (req, res) => {
  try {
    const document = await DigiLockerService.applyTags({
      tenantId: req.tenantId,
      documentId: req.params.id,
      payload: req.body || {},
    });
    if (!document) return res.status(404).json({ error: "Document not found" });
    await DigiLockerService.logAudit({
      tenantId: req.tenantId,
      actorUserId: req.user?._id,
      action: "APPLY_TAGS",
      entityType: "Document",
      entityId: document._id,
    });
    res.json({ success: true, data: document });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to apply tags" });
  }
};

export const suggestQuestionsForDocument = async (req, res) => {
  try {
    const auditId = req.body?.auditId;
    const templateId = req.body?.templateId;
    if (!auditId && !templateId) {
      return res.status(400).json({ error: "auditId or templateId is required" });
    }
    if (auditId) await ensureAuditAccess(req, auditId);
    const data = await DigiLockerService.suggestQuestionsForDocument({
      tenantId: req.tenantId,
      documentId: req.params.id,
      auditId,
      templateId,
      limit: req.body?.limit || 10,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to suggest questions" });
  }
};

export const suggestEvidence = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const questionText = req.body?.questionText || "";
    const auditId = req.body?.auditId;
    if (!auditId && !SUPPLIER_ROLES.has(req.user?.role) && !ADMIN_ROLES.has(req.user?.role)) {
      return res.status(400).json({ error: "auditId is required" });
    }
    const audit = await ensureAuditAccess(req, auditId);
    const supplierOrgId = resolveSupplierOrgId(req.user) || audit?.supplier_id || req.body?.supplierOrgId;
    const data = await DigiLockerService.suggestEvidence({
      tenantId: req.tenantId,
      supplierOrgId,
      questionText,
      siteId: req.body?.siteId,
      productId: req.body?.productId,
      limit: req.body?.limit || 8,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to suggest evidence" });
  }
};

export const attachEvidence = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const auditId = req.body?.auditId;
    await ensureAuditAccess(req, auditId);
    const mapping = await DigiLockerService.attachEvidence({
      tenantId: req.tenantId,
      auditId: auditId || undefined,
      templateId: req.body?.templateId,
      questionId: req.params.questionId,
      documentId: req.body?.documentId,
      versionId: req.body?.versionId,
      mappingType: req.body?.mappingType,
      actorUserId: req.user?._id,
    });
    await DigiLockerService.logAudit({
      tenantId: req.tenantId,
      actorUserId: req.user?._id,
      action: "ATTACH_EVIDENCE",
      entityType: "QuestionEvidenceMap",
      entityId: mapping._id,
      metadata: { questionId: req.params.questionId },
    });
    res.json({ success: true, data: mapping });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to attach evidence" });
  }
};

export const listQuestionEvidence = async (req, res) => {
  try {
    const auditId = req.query?.auditId;
    if (!auditId && !SUPPLIER_ROLES.has(req.user?.role) && !ADMIN_ROLES.has(req.user?.role)) {
      return res.status(400).json({ error: "auditId is required" });
    }
    if (auditId) await ensureAuditAccess(req, auditId);
    const mappings = await DigiLockerService.listQuestionEvidence({
      tenantId: req.tenantId,
      auditId: auditId || undefined,
      questionId: req.params.questionId,
    });
    res.json({ success: true, data: mappings });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load evidence" });
  }
};

export const getEvidenceChecklist = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const audit = await ensureAuditAccess(req, req.params.auditId);
    const checklist = await DigiLockerService.refreshChecklist({
      tenantId: req.tenantId,
      auditId: req.params.auditId,
      siteId: audit?.site_id,
      productId: audit?.supplier_product_id,
      supplierOrgId: audit?.supplier_id,
    });
    res.json({ success: true, data: checklist });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load checklist" });
  }
};

const evidenceJobs = new Map();

export const createEvidencePack = async (req, res) => {
  try {
    const auditId = req.params.auditId;
    await ensureAuditAccess(req, auditId);
    const jobId = `${auditId}-${Date.now()}`;
    evidenceJobs.set(jobId, { status: "QUEUED", createdAt: new Date().toISOString() });
    res.json({ success: true, data: { jobId, status: "QUEUED" } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to start evidence pack" });
  }
};

export const getEvidenceJobStatus = async (req, res) => {
  try {
    const job = evidenceJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load job" });
  }
};
