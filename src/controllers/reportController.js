import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditReport } from "../models/auditReportModel.js";
import { AccessGrant } from "../models/accessGrantModel.js";
import { AdminAuditLog } from "../models/adminAuditLogModel.js";

const buildObservations = (questions = []) =>
  questions.map((q) => ({
    questionId: q._id,
    title: q.question,
    severity: q.severity || "Info",
    classification: q.actionClass || "None",
    followUp: !!q.followUp,
    cfr: "ICH Q7",
    notes: q.textResponse || "",
  }));

export const generateDraftReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    const audit = await AuditRequestMaster.findById(auditId)
      .populate("supplier_product_id", "name")
      .populate("site_id", "site_name")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });

    const qs = await AuditQuestions.find({ auditRequestId: auditId }).lean();
    const observations = buildObservations(qs);
    const productName = audit?.supplier_product_id?.name || "product";
    const siteName = audit?.site_id?.site_name || "site";
    const summary = `Draft report for ${productName} at ${siteName} with ${observations.length} observations.`;

    const report = await AuditReport.findOneAndUpdate(
      { auditRequestId: auditId },
      {
        auditRequestId: auditId,
        tenantOrgId: audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null,
        summary,
        observations,
        status: "DRAFT",
        updatedBy: req.user?._id,
        createdBy: req.user?._id,
      },
      { new: true, upsert: true }
    );

    return res.json({ success: true, data: report });
  } catch (error) {
    console.error("generateDraftReport error", error);
    return res.status(500).json({ success: false, error: "Failed to generate report" });
  }
};

const assertGrant = async (req, auditId) => {
  if (req.user?.adminScope === "PLATFORM") return;
  const grant = await AccessGrant.findOne({
    tenant_id: req.user?.tenant_id,
    granteeUserId: req.user?._id,
    resourceType: "report",
    resourceId: auditId,
    status: "ACTIVE",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  if (!grant) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const logDownload = async (req, auditId) => {
  try {
    await AdminAuditLog.create({
      tenant_id: req.user?.tenant_id || null,
      actorUserId: req.user?._id,
      adminScope: req.user?.adminScope || "NONE",
      action: "report_download",
      entityType: "AuditReport",
      entityId: auditId,
      details: `report download`,
    });
  } catch (err) {
    console.error("logDownload error", err);
  }
};

export const getReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    await assertGrant(req, auditId);
    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });
    await logDownload(req, auditId);
    return res.json({ success: true, data: report });
  } catch (error) {
    const status = error.status || 500;
    console.error("getReport error", error);
    return res.status(status).json({ success: false, error: status === 403 ? "Forbidden" : "Failed to load report" });
  }
};

export const signReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    const { role } = req.body;
    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });
    report.signatures = report.signatures || [];
    report.signatures.push({
      role: role || req.user?.role || "auditor",
      userId: req.user?._id,
      signedAt: new Date(),
    });
    report.status = "PENDING_SIGNATURES";
    await report.save();
    return res.json({ success: true, data: report });
  } catch (error) {
    console.error("signReport error", error);
    return res.status(500).json({ success: false, error: "Failed to sign report" });
  }
};
