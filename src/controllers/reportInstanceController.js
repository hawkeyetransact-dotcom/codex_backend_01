import { ReportTemplate } from "../models/reportTemplateModel.js";
import { ReportInstance } from "../models/reportInstanceModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { buildAuditReportData } from "../services/reportDataService.js";
import { mergeReportTemplate } from "../utils/reportTemplateEngine.js";
import { renderReportHtml } from "../utils/reportHtmlRenderer.js";
import { uploadFileToBucket } from "../utils/s3Upload.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import fs from "fs";
import path from "path";

const ensureAccess = async (req, auditRequestId) => {
  if (req.user?.adminScope === "PLATFORM") return true;
  const role = req.user?.role;
  if (role === "auditor") {
    return canAuditorAccessAudit(req.user?._id, auditRequestId);
  }
  const audit = await AuditRequestMaster.findById(auditRequestId)
    .select("supplier_id create_by_buyer_id auditor_id")
    .lean();
  if (!audit) return false;
  if (role === "buyer") return String(audit.create_by_buyer_id) === String(req.user?._id);
  if (role === "supplier" || role === "supplierUser") return String(audit.supplier_id) === String(req.user?._id);
  if (role === "admin" || role === "superadmin" || role === "tenant_admin") return true;
  return false;
};

const createPdfBuffer = async (html) => {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "18mm", bottom: "20mm", left: "18mm" },
    });
    await browser.close();
    return pdf;
  } catch (error) {
    console.error("createPdfBuffer error", error);
    throw new Error("PDF generation failed (Playwright not installed?)");
  }
};

const storePdf = async (buffer, fileName) => {
  if (process.env.AWS_S3_BUCKET && process.env.AWS_REGION) {
    const url = await uploadFileToBucket(buffer, fileName, "application/pdf");
    return { url };
  }
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return { url: `/uploads/${fileName}` };
};

export const createReportInstance = async (req, res) => {
  try {
    const { auditRequestId } = req.params;
    const { templateId } = req.body || {};
    if (!templateId) {
      return res.status(400).json({ success: false, error: "templateId is required" });
    }
    const template = await ReportTemplate.findById(templateId).lean();
    if (!template) return res.status(404).json({ success: false, error: "Template not found" });

    const hasAccess = await ensureAccess(req, auditRequestId);
    if (!hasAccess) return res.status(403).json({ success: false, error: "Forbidden" });

    const existing = await ReportInstance.findOne({
      auditRequestId,
      templateId,
      status: "draft",
    }).sort({ createdAt: -1 });
    if (existing) {
      return res.json({ success: true, data: existing });
    }

    const auditData = await buildAuditReportData(auditRequestId);
    if (!auditData) return res.status(404).json({ success: false, error: "Audit request not found" });

    const { renderedBlocks, highlights } = mergeReportTemplate(template, auditData);
    const report = await ReportInstance.create({
      auditRequestId,
      templateId,
      templateVersion: template.version || 1,
      renderedBlocks,
      highlights,
      status: "draft",
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });
    return res.status(201).json({ success: true, data: report });
  } catch (error) {
    console.error("createReportInstance error", error);
    return res.status(500).json({ success: false, error: "Failed to create report instance" });
  }
};

export const getReportInstance = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await ReportInstance.findById(id).lean();
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });

    const hasAccess = await ensureAccess(req, report.auditRequestId);
    if (!hasAccess) return res.status(403).json({ success: false, error: "Forbidden" });

    return res.json({ success: true, data: report });
  } catch (error) {
    console.error("getReportInstance error", error);
    return res.status(500).json({ success: false, error: "Failed to load report instance" });
  }
};

export const updateReportInstance = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await ReportInstance.findById(id);
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });

    const hasAccess = await ensureAccess(req, report.auditRequestId);
    if (!hasAccess) return res.status(403).json({ success: false, error: "Forbidden" });

    const { renderedBlocks, status } = req.body || {};
    if (renderedBlocks) report.renderedBlocks = renderedBlocks;
    if (status) report.status = status;
    report.updatedBy = req.user?._id;
    await report.save();

    return res.json({ success: true, data: report });
  } catch (error) {
    console.error("updateReportInstance error", error);
    return res.status(500).json({ success: false, error: "Failed to update report instance" });
  }
};

export const exportReportInstancePdf = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await ReportInstance.findById(id);
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });

    const hasAccess = await ensureAccess(req, report.auditRequestId);
    if (!hasAccess) return res.status(403).json({ success: false, error: "Forbidden" });

    const html = renderReportHtml(report);
    const buffer = await createPdfBuffer(html);
    const fileName = `audit-report-${report._id}-${Date.now()}.pdf`;
    const stored = await storePdf(buffer, fileName);

    report.exportHistory = report.exportHistory || [];
    report.exportHistory.push({ url: stored.url, fileName, format: "pdf", exportedAt: new Date() });
    await report.save();

    return res.json({ success: true, data: { url: stored.url, fileName } });
  } catch (error) {
    console.error("exportReportInstancePdf error", error);
    return res.status(500).json({ success: false, error: "Failed to export report PDF" });
  }
};
