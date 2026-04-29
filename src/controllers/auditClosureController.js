/**
 * auditClosureController.js
 *
 * G8: Audit closure certification — auditor authors + buyer approves.
 * Append-only after both signatures captured.
 */
import mongoose from "mongoose";
import { AuditClosureCertificate } from "../models/auditClosureCertificateModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditReport } from "../models/auditReportModel.js";
import { ElectronicSignature } from "../models/electronicSignatureModel.js";
import { notifyUsers } from "../services/governance/notifySupplier.js";

/**
 * POST /api/audits/:auditId/closure-certificate
 * Auditor creates the certificate draft + signs as AUTHORED.
 * Body: { outcome, validUntil?, summary? }
 */
export const createClosureCertificate = async (req, res) => {
  try {
    const { auditId } = req.params;
    const { outcome, validUntil, summary } = req.body || {};
    if (!outcome) return res.status(400).json({ error: "outcome is required" });
    if (!["APPROVED", "APPROVED_WITH_CAPA", "CONDITIONALLY_APPROVED", "REJECTED"].includes(outcome)) {
      return res.status(400).json({ error: "Invalid outcome value" });
    }

    const audit = await AuditRequestMaster.findById(auditId).lean();
    if (!audit) return res.status(404).json({ error: "Audit not found" });
    if (String(audit.auditor_id || "") !== String(req.user._id)) {
      return res.status(403).json({ error: "Only the assigned auditor may create the closure certificate" });
    }

    const existing = await AuditClosureCertificate.findOne({ auditId });
    if (existing && existing.status === "COMPLETED") {
      return res.status(409).json({ error: "Certificate already finalized for this audit" });
    }

    // Pull finding counts from the audit report observations (best-effort).
    const report = await AuditReport.findOne({ auditRequestId: auditId }).select("observations").lean();
    const observations = Array.isArray(report?.observations) ? report.observations : [];
    const findingsSummary = {
      criticalCount: observations.filter((o) => String(o.severity || "").toLowerCase() === "critical").length,
      majorCount: observations.filter((o) => String(o.severity || "").toLowerCase() === "major").length,
      minorCount: observations.filter((o) => String(o.severity || "").toLowerCase() === "minor").length,
      capaCount: observations.reduce((s, o) => s + (Array.isArray(o.linkedCapaIds) ? o.linkedCapaIds.length : 0), 0),
    };

    const certPayload = {
      tenantOrgId: String(audit.tenantOrgId || req.tenantId || ""),
      auditId,
      supplierId: audit.supplier_id,
      auditorId: audit.auditor_id,
      buyerId: audit.create_by_buyer_id,
      outcome,
      findingsSummary,
      validUntil: validUntil ? new Date(validUntil) : null,
      summary: summary || "",
      status: "AUDITOR_SIGNED",
      auditorSignedAt: new Date(),
      createdBy: req.user._id,
    };

    let cert;
    if (existing) {
      Object.assign(existing, certPayload);
      cert = await existing.save();
    } else {
      cert = await AuditClosureCertificate.create(certPayload);
    }

    // Append the auditor's e-signature row.
    const sig = await ElectronicSignature.create({
      recordType: "AUDIT_CLOSURE_CERTIFICATE",
      recordId: cert._id,
      recordVersion: 1,
      signerId: req.user._id,
      signerEmail: req.user.email,
      signerFullName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email,
      signerRole: req.user.role,
      signatureMeaning: "AUTHORED",
      authMethod: "PASSWORD",
      tenantOrgId: cert.tenantOrgId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    cert.auditorSignatureId = sig._id;
    await cert.save();

    if (audit.create_by_buyer_id) {
      notifyUsers({
        tenantId: cert.tenantOrgId,
        userIds: [audit.create_by_buyer_id],
        eventKey: "AUDIT_CLOSURE_AWAITING_BUYER",
        actionUrl: `/audits/${auditId}/closure`,
        payload: { auditId, certificateId: cert._id, outcome },
      }).catch((e) => console.error("notifyUsers(AUDIT_CLOSURE_AWAITING_BUYER) failed:", e?.message));
    }

    return res.status(201).json({ data: cert });
  } catch (err) {
    console.error("createClosureCertificate error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/audits/:auditId/closure-certificate/approve
 * Buyer approves + signs. After this the cert is locked + status=COMPLETED.
 * Triggers supplier-scorecard refresh hook downstream.
 */
export const approveClosureCertificate = async (req, res) => {
  try {
    const { auditId } = req.params;
    const cert = await AuditClosureCertificate.findOne({ auditId });
    if (!cert) return res.status(404).json({ error: "Certificate not found — auditor must author first" });
    if (cert.status !== "AUDITOR_SIGNED") {
      return res.status(409).json({ error: `Certificate is in state ${cert.status}; cannot approve` });
    }
    if (String(cert.buyerId) !== String(req.user._id)) {
      return res.status(403).json({ error: "Only the buyer who created the audit may approve closure" });
    }

    const sig = await ElectronicSignature.create({
      recordType: "AUDIT_CLOSURE_CERTIFICATE",
      recordId: cert._id,
      recordVersion: 1,
      signerId: req.user._id,
      signerEmail: req.user.email,
      signerFullName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email,
      signerRole: req.user.role,
      signatureMeaning: "APPROVED",
      authMethod: "PASSWORD",
      tenantOrgId: cert.tenantOrgId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    cert.buyerSignatureId = sig._id;
    cert.buyerSignedAt = new Date();
    cert.status = "COMPLETED";
    cert.completedAt = new Date();
    await cert.save();

    // Mirror status to the audit + advance phase.
    await AuditRequestMaster.findByIdAndUpdate(auditId, {
      $set: {
        trackStatus: "Audit closed",
        nextAuditOn: null,
        facilityOutcome: cert.outcome,
        facilityOutcomeSetAt: new Date(),
      },
    });

    // Notify auditor + supplier of finalization.
    notifyUsers({
      tenantId: cert.tenantOrgId,
      userIds: [cert.auditorId, cert.supplierId].filter(Boolean),
      eventKey: "AUDIT_CLOSURE_COMPLETED",
      actionUrl: `/audits/${auditId}/closure`,
      payload: { auditId, certificateId: cert._id, outcome: cert.outcome, validUntil: cert.validUntil },
    }).catch((e) => console.error("notifyUsers(AUDIT_CLOSURE_COMPLETED) failed:", e?.message));

    return res.json({ data: cert });
  } catch (err) {
    console.error("approveClosureCertificate error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/audits/:auditId/closure-certificate
 */
export const getClosureCertificate = async (req, res) => {
  try {
    const { auditId } = req.params;
    if (!mongoose.isValidObjectId(auditId)) return res.status(400).json({ error: "Invalid auditId" });
    const cert = await AuditClosureCertificate.findOne({ auditId }).lean();
    if (!cert) return res.status(404).json({ error: "Not found" });
    return res.json({ data: cert });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
