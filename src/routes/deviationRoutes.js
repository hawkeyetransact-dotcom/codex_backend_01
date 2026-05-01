import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { requireESignature } from "../middlewares/requireESignature.js";
import { Deviation } from "../models/DeviationModel.js";
import { notifySupplier, notifyUsers } from "../services/governance/notifySupplier.js";
import { applyPersonaScope } from "../middlewares/personaScope.js";
import { recordTransition } from "../services/auditTrailService.js";
import { requireStepApprover } from "../middlewares/requireStepApprover.js";

const router = express.Router();

const VIEWER_ROLES = [
  "buyer", "supplier", "auditor", "tenant_admin", "admin", "superadmin",
  "workflow_manager", "inspector", "verifier", "reviewer",
];
const EDITOR_ROLES = [
  "buyer", "auditor", "tenant_admin", "admin", "superadmin",
  "workflow_manager", "inspector",
];

const supplierUrl = (id) => `/supplier/deviations/${id}`;

// ── List deviations with filters ────────────────────────────────────────────
router.get("/", authenticate, permit(...VIEWER_ROLES), async (req, res) => {
  try {
    const { status, classification, category, deviationType, productId, page = 1, limit = 25 } = req.query;
    const baseFilter = req.user.tenant_id ? { tenantId: req.user.tenant_id } : {};
    const filter = applyPersonaScope(req, baseFilter, { supplierField: "supplierId" });
    if (status) filter.status = status;
    if (classification) filter.classification = classification;
    if (category) filter.category = category;
    if (deviationType) filter.deviationType = deviationType;
    if (productId) filter.productId = productId;

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      Deviation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Deviation.countDocuments(filter),
    ]);
    return res.json({ data: records, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Get single deviation ────────────────────────────────────────────────────
router.get("/:id", authenticate, permit(...VIEWER_ROLES), async (req, res) => {
  try {
    const filter = applyPersonaScope(req, { _id: req.params.id }, { supplierField: "supplierId" });
    const record = await Deviation.findOne(filter).lean();
    if (!record) return res.status(404).json({ error: "Deviation not found" });
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Supplier acknowledges receipt ───────────────────────────────────────────
router.post("/:id/acknowledge", authenticate, async (req, res) => {
  try {
    const record = await Deviation.findOneAndUpdate(
      { _id: req.params.id, supplierId: req.user._id },
      { $set: { supplierAcknowledgedAt: new Date(), supplierAcknowledgedBy: req.user._id } },
      { new: true }
    );
    if (!record) return res.status(404).json({ error: "Not found or not assigned to you" });
    return res.json({ data: record });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ── Create deviation ────────────────────────────────────────────────────────
router.post("/", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await Deviation.create({
      ...req.body,
      tenantId: req.user.tenant_id || req.body.tenantId,
      reportedBy: req.user._id,
      createdBy: req.user._id,
    });

    // Supplier-attributed deviations: notify the supplier so they can investigate.
    if (record.supplierId) {
      notifySupplier({
        tenantId: record.tenantId,
        supplierUserId: record.supplierId,
        eventKey: "DEVIATION_REPORTED",
        actionUrl: supplierUrl(record._id),
        payload: {
          deviationId: record._id,
          deviationNumber: record.deviationNumber,
          title: record.title,
          classification: record.classification,
          category: record.category,
        },
      }).catch((e) => console.error("notifySupplier(DEVIATION_REPORTED) failed:", e?.message));
    }

    return res.status(201).json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Update deviation ────────────────────────────────────────────────────────
router.put("/:id", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await Deviation.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ error: "Deviation not found" });
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Investigate deviation ───────────────────────────────────────────────────
router.post("/:id/investigate", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await Deviation.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Deviation not found" });

    record.investigation = {
      investigatorId: req.user._id,
      ...req.body,
      startedAt: record.investigation?.startedAt || new Date(),
    };

    if (req.body.rootCause) {
      record.investigation.completedAt = new Date();
      record.status = "PENDING_DISPOSITION";
    } else {
      record.status = "UNDER_INVESTIGATION";
    }

    await record.save();

    // If an investigator was assigned and they aren't the actor, notify them.
    const investigatorId = record.investigation?.investigatorId;
    if (investigatorId && String(investigatorId) !== String(req.user._id)) {
      notifyUsers({
        tenantId: record.tenantId,
        userIds: [investigatorId],
        eventKey: "DEVIATION_ASSIGNED",
        actionUrl: `/quality/deviations/${record._id}`,
        payload: {
          deviationId: record._id,
          deviationNumber: record.deviationNumber,
          status: record.status,
        },
      }).catch((e) => console.error("notifyUsers(DEVIATION_ASSIGNED) failed:", e?.message));
    }

    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Assess impact ───────────────────────────────────────────────────────────
router.post("/:id/assess", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await Deviation.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Deviation not found" });

    record.impactAssessment = {
      ...req.body,
      assessedBy: req.user._id,
      assessedAt: new Date(),
    };

    if (record.status === "REPORTED") {
      record.status = "UNDER_ASSESSMENT";
    }

    await record.save();
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Disposition ─────────────────────────────────────────────────────────────
router.post("/:id/dispose", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await Deviation.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Deviation not found" });

    const { decision, justification } = req.body;
    record.dispositionDecision = decision;
    record.dispositionJustification = justification;
    record.dispositionBy = req.user._id;
    record.dispositionAt = new Date();
    record.status = "PENDING_CAPA_DECISION";

    await record.save();
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── CAPA decision ───────────────────────────────────────────────────────────
router.post("/:id/capa-decision", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await Deviation.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Deviation not found" });

    const { capaRequired, linkedCAPAIds, autoCreateCapa } = req.body;
    record.capaRequired = capaRequired;
    if (linkedCAPAIds) record.linkedCAPAIds = linkedCAPAIds;
    record.status = capaRequired ? "CAPA_REQUIRED" : "PENDING_CLOSURE";

    // Phase 1: auto-create CAPA from deviation if requested
    let autoCapaId = null;
    if (capaRequired && autoCreateCapa) {
      try {
        const { createCapaFromDeviation } = await import("../services/crossModuleService.js");
        const capa = await createCapaFromDeviation(record, req.user._id);
        if (capa) {
          autoCapaId = capa._id;
          record.linkedCAPAIds = [...(record.linkedCAPAIds || []), capa._id];
        }
      } catch (e) {
        console.warn("Auto-create CAPA failed (non-blocking):", e.message);
      }
    }

    await record.save();
    return res.json({ data: record, autoCapaId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Close deviation (e-sig gated + SoD: closer != reporter) ─────────────────
router.post(
  "/:id/close",
  authenticate,
  permit(...EDITOR_ROLES),
  requireStepApprover({
    Model: Deviation,
    recordType: "deviation",
    ownerFields: ["reportedBy", "createdBy"],
    resolveStep: () => ({ stepOrder: "close", role: null }),
  }),
  requireESignature({ recordType: "deviation", meaning: "CLOSURE" }),
  async (req, res) => {
    try {
      const record = await Deviation.findById(req.params.id);
      if (!record) return res.status(404).json({ error: "Deviation not found" });

      const fromStatus = record.status;
      record.closureNotes = req.body.closureNotes;
      record.closedBy = req.user._id;
      record.closedAt = new Date();
      record.status = "CLOSED";
      if (req.electronicSignature?._id) record.closureSignatureId = req.electronicSignature._id;

      await record.save();

      await recordTransition({
        req,
        module: "deviation",
        entityType: "deviation",
        entityId: record._id,
        fromStatus,
        toStatus: "CLOSED",
        reasonForChange: req.body.reasonForChange,
        extraMeta: { closureNotes: req.body.closureNotes || null, deviationNumber: record.deviationNumber },
      });

      return res.json({ data: record });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// ── Delete (REPORTED only) ──────────────────────────────────────────────────
router.delete("/:id", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await Deviation.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Deviation not found" });
    if (record.status !== "REPORTED") {
      return res.status(400).json({ error: "Only REPORTED deviations can be deleted" });
    }
    await record.deleteOne();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
