import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { SupplierPreQualification } from "../models/SupplierPreQualificationModel.js";
import { notifySupplier } from "../services/governance/notifySupplier.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/supplier-prequalifications
router.get("/", async (req, res) => {
  try {
    const { status, supplierId, decision } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (supplierId) filter.supplierId = supplierId;
    if (decision) filter.decision = decision;

    const items = await SupplierPreQualification.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/supplier-prequalifications/:id
router.get("/:id", async (req, res) => {
  try {
    const item = await SupplierPreQualification.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/supplier-prequalifications
router.post("/", async (req, res) => {
  try {
    if (!req.body?.supplierId) {
      return res.status(400).json({ error: "supplierId is required — pick a supplier in the form" });
    }
    const pq = new SupplierPreQualification({
      ...req.body,
      tenantId: req.tenantId,
      supplierId: req.body.supplierId,
      initiatedBy: req.user._id,
    });
    await pq.save();

    // Fire-and-forget supplier notification on submission (skip silent drafts).
    if (pq.status && pq.status !== "DRAFT") {
      notifySupplier({
        tenantId: req.tenantId,
        supplierUserId: pq.supplierId,
        eventKey: "PQ_REQUESTED",
        payload: {
          pqId: pq._id,
          pqNumber: pq.pqNumber,
          scope: pq.scope,
          initialRiskBand: pq.initialRiskBand,
        },
      }).catch((e) => console.error("notifySupplier(PQ_REQUESTED) failed:", e?.message));
    }

    return res.status(201).json(pq);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/supplier-prequalifications/:id/submit
// Flips DRAFT → SUBMITTED and notifies the assigned supplier.
router.post("/:id/submit", async (req, res) => {
  try {
    const item = await SupplierPreQualification.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: "DRAFT" },
      { $set: { status: "SUBMITTED", submittedAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: "PQ not found or not in DRAFT state" });

    notifySupplier({
      tenantId: req.tenantId,
      supplierUserId: item.supplierId,
      eventKey: "PQ_REQUESTED",
      payload: {
        pqId: item._id,
        pqNumber: item.pqNumber,
        scope: item.scope,
        initialRiskBand: item.initialRiskBand,
      },
    }).catch((e) => console.error("notifySupplier(PQ_REQUESTED) failed:", e?.message));

    return res.json(item);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/supplier-prequalifications/:id
router.put("/:id", async (req, res) => {
  try {
    const item = await SupplierPreQualification.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/supplier-prequalifications/:id/decision
router.post("/:id/decision", async (req, res) => {
  try {
    const { decision, decisionNotes, conditions, validUntil } = req.body;
    if (!["APPROVED", "CONDITIONALLY_APPROVED", "REJECTED"].includes(decision)) {
      return res.status(400).json({ error: "Invalid decision value" });
    }
    const item = await SupplierPreQualification.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $set: {
          decision,
          decisionNotes: decisionNotes || null,
          conditions: conditions || [],
          validUntil: validUntil || null,
          decisionBy: req.user._id,
          decisionAt: new Date(),
          status: decision === "APPROVED" ? "APPROVED"
            : decision === "CONDITIONALLY_APPROVED" ? "CONDITIONALLY_APPROVED"
            : "REJECTED",
        },
      },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: "Not found" });

    notifySupplier({
      tenantId: req.tenantId,
      supplierUserId: item.supplierId,
      eventKey: "PQ_DECISION",
      payload: {
        pqId: item._id,
        pqNumber: item.pqNumber,
        decision: item.decision,
        decisionNotes: item.decisionNotes,
        conditions: item.conditions,
        validUntil: item.validUntil,
      },
    }).catch((e) => console.error("notifySupplier(PQ_DECISION) failed:", e?.message));

    return res.json(item);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/supplier-prequalifications/:id
router.delete("/:id", async (req, res) => {
  try {
    const item = await SupplierPreQualification.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantId,
    });
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
