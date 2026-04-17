import express from "express";
import crypto from "crypto";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { ElectronicSignature } from "../models/electronicSignatureModel.js";
import { DataIntegrityLog } from "../models/dataIntegrityLogModel.js";

const router = express.Router();

const ALL_ROLES = [
  "buyer", "supplier", "supplierUser", "auditor",
  "tenant_admin", "admin", "superadmin",
];

// ── Sign a record (21 CFR Part 11 compliant) ────────────────────────────────
router.post("/sign", authenticate, permit(...ALL_ROLES), async (req, res) => {
  try {
    const {
      recordType, recordId, recordVersion,
      signatureMeaning, authMethod, comments, contentSnapshot,
    } = req.body;

    if (!recordType || !recordId || !signatureMeaning) {
      return res.status(400).json({ error: "recordType, recordId, and signatureMeaning are required" });
    }

    // Compute content hash if snapshot provided (ALCOA+ Original)
    const contentHash = contentSnapshot
      ? crypto.createHash("sha256").update(JSON.stringify(contentSnapshot)).digest("hex")
      : null;

    const signature = await ElectronicSignature.create({
      tenantId: req.user.tenant_id,
      recordType,
      recordId,
      recordVersion: recordVersion || 1,
      signerId: req.user._id,
      signerEmail: req.user.email,
      signerFullName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email,
      signerRole: req.user.role,
      signatureMeaning,
      signedAt: new Date(),
      authMethod: authMethod || "PASSWORD",
      contentHash,
      signerIpAddress: req.ip || req.headers["x-forwarded-for"] || null,
      signerUserAgent: req.headers["user-agent"] || null,
      comments,
    });

    // Write ALCOA+ integrity log
    await DataIntegrityLog.create({
      tenantId: req.user.tenant_id,
      recordType,
      recordId,
      action: "SIGNATURE",
      description: `${signatureMeaning} signature by ${req.user.email}`,
      performedBy: req.user._id,
      performedByEmail: req.user.email,
      performedByRole: req.user.role,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
      userAgent: req.headers["user-agent"] || null,
      contentHashAfter: contentHash,
      signatureId: signature._id,
      sourceModule: "electronic-signatures",
    });

    return res.status(201).json({ data: signature });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── List signatures for a record ────────────────────────────────────────────
router.get("/record/:recordType/:recordId", authenticate, permit(...ALL_ROLES), async (req, res) => {
  try {
    const { recordType, recordId } = req.params;
    const signatures = await ElectronicSignature.find({ recordType, recordId })
      .sort({ signedAt: 1 })
      .lean();
    return res.json({ data: signatures });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Get ALCOA+ audit trail for a record ─────────────────────────────────────
router.get("/audit-trail/:recordType/:recordId", authenticate, permit(...ALL_ROLES), async (req, res) => {
  try {
    const { recordType, recordId } = req.params;
    const trail = await DataIntegrityLog.find({ recordType, recordId })
      .sort({ performedAt: 1 })
      .lean();
    return res.json({ data: trail });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Verify a signature (check content hash matches) ─────────────────────────
router.post("/verify", authenticate, permit(...ALL_ROLES), async (req, res) => {
  try {
    const { signatureId, contentSnapshot } = req.body;
    const sig = await ElectronicSignature.findById(signatureId).lean();
    if (!sig) return res.status(404).json({ error: "Signature not found" });

    if (!sig.contentHash || !contentSnapshot) {
      return res.json({ verified: false, reason: "No content hash available for verification" });
    }

    const currentHash = crypto.createHash("sha256").update(JSON.stringify(contentSnapshot)).digest("hex");
    const verified = currentHash === sig.contentHash;

    return res.json({
      verified,
      reason: verified ? "Content hash matches — record unmodified since signing" : "Content hash mismatch — record may have been modified after signing",
      signedAt: sig.signedAt,
      signerEmail: sig.signerEmail,
      signatureMeaning: sig.signatureMeaning,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
