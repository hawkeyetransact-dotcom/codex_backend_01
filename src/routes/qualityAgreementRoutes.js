/**
 * G10: Quality Agreement CRUD + signing flow.
 */
import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { applyPersonaScope } from "../middlewares/personaScope.js";
import { QualityAgreement } from "../models/qualityAgreementModel.js";
import { ElectronicSignature } from "../models/electronicSignatureModel.js";
import { notifySupplier } from "../services/governance/notifySupplier.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/quality-agreements
router.get("/", async (req, res) => {
  try {
    const filter = applyPersonaScope(req, { tenantOrgId: String(req.tenantId) }, { supplierField: "supplierUserId" });
    if (req.query.status) filter.status = req.query.status;
    if (req.query.supplierId) filter.supplierUserId = req.query.supplierId;
    const items = await QualityAgreement.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ data: items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/quality-agreements/:id
router.get("/:id", async (req, res) => {
  try {
    const filter = applyPersonaScope(req, { _id: req.params.id, tenantOrgId: String(req.tenantId) }, { supplierField: "supplierUserId" });
    const qa = await QualityAgreement.findOne(filter).lean();
    if (!qa) return res.status(404).json({ error: "Not found" });
    return res.json({ data: qa });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/quality-agreements
// Buyer drafts the agreement.
router.post("/", permit("buyer", "tenant_admin", "admin", "superadmin"), async (req, res) => {
  try {
    if (!req.body?.supplierUserId) {
      return res.status(400).json({ error: "supplierUserId is required" });
    }
    const qa = await QualityAgreement.create({
      ...req.body,
      tenantOrgId: String(req.tenantId),
      createdBy: req.user._id,
      status: "DRAFT",
    });
    return res.status(201).json({ data: qa });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/quality-agreements/:id/sign
// Body: { reasonForChange? }
// Auto-detects whether the caller is the giver (buyer) or acceptor (supplier).
router.post("/:id/sign", async (req, res) => {
  try {
    const qa = await QualityAgreement.findOne({ _id: req.params.id, tenantOrgId: String(req.tenantId) });
    if (!qa) return res.status(404).json({ error: "Not found" });

    const me = String(req.user._id);
    const isGiver = String(qa.contractGiverUserId) === me;
    const isAcceptor = String(qa.contractAcceptorUserId) === me || String(qa.supplierUserId || "") === me;
    if (!isGiver && !isAcceptor) {
      return res.status(403).json({ error: "You are not a party to this agreement" });
    }
    if (isGiver && qa.giverSignatureId) {
      return res.status(409).json({ error: "Giver has already signed" });
    }
    if (isAcceptor && qa.acceptorSignatureId) {
      return res.status(409).json({ error: "Acceptor has already signed" });
    }

    const sig = await ElectronicSignature.create({
      recordType: "QUALITY_AGREEMENT",
      recordId: qa._id,
      recordVersion: 1,
      signerId: req.user._id,
      signerEmail: req.user.email,
      signerFullName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email,
      signerRole: req.user.role,
      signatureMeaning: isGiver ? "AUTHORED" : "APPROVED",
      authMethod: "PASSWORD",
      tenantOrgId: qa.tenantOrgId,
      reasonForChange: req.body?.reasonForChange || null,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    if (isGiver) {
      qa.giverSignatureId = sig._id;
      qa.giverSignedAt = new Date();
      qa.status = "GIVER_SIGNED";
      // Notify supplier to counter-sign.
      if (qa.supplierUserId) {
        notifySupplier({
          tenantId: qa.tenantOrgId,
          supplierUserId: qa.supplierUserId,
          eventKey: "QUALITY_AGREEMENT_AWAITING_SIGN",
          actionUrl: `/supplier/quality-agreements/${qa._id}`,
          payload: { qaId: qa._id, qaNumber: qa.qaNumber, title: qa.title },
        }).catch((e) => console.error("notifySupplier(QA awaiting) failed:", e?.message));
      }
    } else {
      qa.acceptorSignatureId = sig._id;
      qa.acceptorSignedAt = new Date();
      qa.status = "COMPLETED";
      qa.completedAt = new Date();
      qa.effectiveFrom = qa.effectiveFrom || new Date();
    }
    await qa.save();
    return res.json({ data: qa, signature: sig });
  } catch (err) {
    console.error("QA sign error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/quality-agreements/:id/terminate
router.post("/:id/terminate", permit("buyer", "tenant_admin", "admin", "superadmin"), async (req, res) => {
  try {
    const qa = await QualityAgreement.findOneAndUpdate(
      { _id: req.params.id, tenantOrgId: String(req.tenantId) },
      { $set: { status: "TERMINATED", terminatedAt: new Date() } },
      { new: true }
    );
    if (!qa) return res.status(404).json({ error: "Not found" });
    return res.json({ data: qa });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
