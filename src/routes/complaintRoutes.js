/**
 * complaintRoutes.js — Phase 1 EQMS
 * CRUD + lifecycle actions for customer/regulatory complaints.
 */
import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { Complaint } from "../models/ComplaintModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/complaints
router.get("/", async (req, res) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.complaintType) filter.complaintType = req.query.complaintType;
    if (req.query.productId) filter.productId = req.query.productId;
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).lean();
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/complaints/:id
router.get("/:id", async (req, res) => {
  try {
    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!complaint) return res.status(404).json({ error: "Not found" });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/complaints
router.post("/", async (req, res) => {
  try {
    const complaint = new Complaint({ ...req.body, tenantId: req.tenantId, reportedBy: req.user._id });
    await complaint.save();
    res.status(201).json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/complaints/:id
router.put("/:id", async (req, res) => {
  try {
    const complaint = await Complaint.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!complaint) return res.status(404).json({ error: "Not found" });
    res.json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/complaints/:id/investigate
router.post("/:id/investigate", async (req, res) => {
  try {
    const { investigationSummary, rootCause, assignedTo } = req.body;
    const complaint = await Complaint.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $set: {
          status: "UNDER_INVESTIGATION",
          investigationSummary,
          rootCause,
          assignedTo,
          investigationCompletedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ error: "Not found" });
    res.json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/complaints/:id/close
router.post("/:id/close", async (req, res) => {
  try {
    const { closureNotes, correctiveAction, preventiveAction } = req.body;
    const complaint = await Complaint.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $set: {
          status: "CLOSED",
          closureNotes,
          correctiveAction,
          preventiveAction,
          closedAt: new Date(),
          closedBy: req.user._id,
        },
      },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ error: "Not found" });
    res.json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/complaints/:id  (only OPEN complaints)
router.delete("/:id", async (req, res) => {
  try {
    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!complaint) return res.status(404).json({ error: "Not found" });
    if (complaint.status !== "OPEN") return res.status(409).json({ error: "Only OPEN complaints can be deleted" });
    await complaint.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
