import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditArtifact } from "../models/auditArtifactModel.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import {
  attachEvidenceUrlsToAuditQuestions,
  attachExecutionEvidenceToAuditQuestions,
  runAutoFillForAudit,
} from "./autoFillController.js";
import { ComplianceEvaluationService } from "../services/compliance/complianceEvaluationService.js";
import { buildWhoGmpDraftReport } from "./reportController.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenantadmin"]);
const SUPPLIER_ROLES = new Set(["supplier", "supplieruser"]);

const normalizeRole = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

const extractArtifactAttachmentUrls = (artifacts = []) => {
  const urls = [];
  artifacts.forEach((artifact) => {
    const attachments = Array.isArray(artifact?.data?.attachments) ? artifact.data.attachments : [];
    attachments.forEach((item) => {
      const url = String(item?.url || "").trim();
      if (url) urls.push(url);
    });
  });
  return Array.from(new Set(urls));
};

const ensureAuditAccess = async (req, auditRequestId) => {
  const audit = await AuditRequestMaster.findById(auditRequestId).lean();
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }

  const role = normalizeRole(req.user?.role);
  if (ADMIN_ROLES.has(role)) return audit;

  if (role === "auditor") {
    const assigned =
      (audit.auditor_id && String(audit.auditor_id) === String(req.user?._id)) ||
      (await canAuditorAccessAudit(req.user?._id, auditRequestId));
    if (!assigned) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return audit;
  }

  if (role === "buyer" && String(audit.create_by_buyer_id) === String(req.user?._id)) {
    return audit;
  }

  if (SUPPLIER_ROLES.has(role) && String(audit.supplier_id) === String(req.user?._id)) {
    return audit;
  }

  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
};

export const runExecutionRagPipeline = async (req, res) => {
  try {
    const auditRequestId = req.params.auditRequestId;
    if (!auditRequestId) {
      return res.status(400).json({ success: false, error: "auditRequestId is required" });
    }
    if (!req.tenantId) {
      return res.status(400).json({ success: false, error: "Tenant missing" });
    }

    await ensureAuditAccess(req, auditRequestId);

    const evidenceDataset = req.body?.evidenceDataset || "sai_life_sciences";
    const standardKey = req.body?.standardKey || "ICH_Q7_CFR21";
    const standardVersion = req.body?.standardVersion || "1.0.0";

    const executionArtifacts = await AuditArtifact.find({
      auditId: auditRequestId,
      artifactType: "EXECUTION_QUESTIONNAIRE",
    })
      .select("data.attachments")
      .sort({ updatedAt: -1 })
      .lean();
    const artifactAttachmentUrls = extractArtifactAttachmentUrls(executionArtifacts);

    const [artifactAttachResult, datasetAttachResult] = await Promise.all([
      artifactAttachmentUrls.length
        ? attachEvidenceUrlsToAuditQuestions({
            auditRequestId,
            evidenceUrls: artifactAttachmentUrls,
          })
        : Promise.resolve({ updated: 0, total: 0, linkedUrls: 0 }),
      attachExecutionEvidenceToAuditQuestions({ auditRequestId }),
    ]);

    const attachResult = {
      updated:
        Number(artifactAttachResult?.updated || 0) + Number(datasetAttachResult?.updated || 0),
      total:
        Number(datasetAttachResult?.total || artifactAttachResult?.total || 0),
      linkedUrls:
        Number(artifactAttachResult?.linkedUrls || 0) +
        Number(datasetAttachResult?.linkedUrls || 0),
      artifactUploads: {
        ...artifactAttachResult,
        sourceCount: artifactAttachmentUrls.length,
      },
      executionDataset: datasetAttachResult,
    };
    const autoFillResult = await runAutoFillForAudit({
      auditRequestId,
      actorUserId: req.user?._id,
      evidenceDataset,
    });

    const complianceResult = await ComplianceEvaluationService.createRun({
      tenantId: req.tenantId,
      auditId: auditRequestId,
      standardKey,
      standardVersion,
      mode: "ADVISORY",
      actorUserId: req.user?._id,
    });

    const { report } = await buildWhoGmpDraftReport({
      auditId: auditRequestId,
      tenantId: req.tenantId || req.user?.tenant_id || null,
      actorUserId: req.user?._id,
    });

    return res.json({
      success: true,
      data: {
        auditRequestId,
        attach: attachResult,
        autoFill: autoFillResult,
        compliance: {
          runId: complianceResult?.run?._id,
          summary: complianceResult?.summary || null,
          standardKey,
          standardVersion,
        },
        report: {
          id: report?._id,
          format: report?.reportFormat,
          status: report?.status,
          templateName: report?.templateName,
        },
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      error: error.message || "Failed to run execution RAG pipeline",
    });
  }
};
