/**
 * transactionReviewRoutes.js — P2P Transaction Due-Diligence CRUD
 */
import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { TransactionReview } from "../models/TransactionReviewModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/universal/transactions
router.get("/", async (req, res) => {
  try {
    const { status, transactionType, riskLevel } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (transactionType) filter.transactionType = transactionType;
    if (riskLevel) filter.riskLevel = riskLevel;
    const items = await TransactionReview.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/universal/transactions/:id
router.get("/:id", async (req, res) => {
  try {
    const item = await TransactionReview.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/universal/transactions
router.post("/", async (req, res) => {
  try {
    const tx = new TransactionReview({
      ...req.body,
      tenantId: req.tenantId,
      createdBy: req.user._id,
      initiatorId: req.user._id,
    });
    await tx.save();
    return res.status(201).json(tx);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/universal/transactions/:id
router.put("/:id", async (req, res) => {
  try {
    const updated = await TransactionReview.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/universal/transactions/:id/approve
router.post("/:id/approve", async (req, res) => {
  try {
    const { decision, comments } = req.body; // decision: APPROVED | REJECTED
    const tx = await TransactionReview.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!tx) return res.status(404).json({ error: "Not found" });

    tx.approvalSteps.push({
      approverId: req.user._id,
      approverName: req.user.name || req.user.email,
      decision: decision || "APPROVED",
      decidedAt: new Date(),
      comments: comments || null,
    });

    if (decision === "REJECTED") {
      tx.status = "REJECTED";
    } else {
      const allApproved = tx.approvalSteps.every((s) => s.decision === "APPROVED");
      if (allApproved && !tx.requiresApproval) tx.status = "APPROVED";
      else if (allApproved) tx.status = "APPROVED";
    }

    await tx.save();
    return res.json(tx);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
