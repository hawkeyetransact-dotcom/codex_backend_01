// backend/src/routes/changeControlRoutes.js
// Full change request lifecycle management.

import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import ChangeControl from "../models/ChangeControlModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

const viewRoles = ["buyer", "auditor", "admin", "tenant_admin", "workflow_manager",
  "inspector", "verifier", "reviewer"];
const createRoles = [...viewRoles, "supplier", "party_admin"];

// GET list change controls for tenant
router.get("/", permit(...viewRoles), async (req, res) => {
  try {
    const { status, changeType } = req.query;
    const filter = { tenantId: req.user.tenantId };
    if (status) filter.status = status;
    if (changeType) filter.changeType = changeType;

    const records = await ChangeControl.find(filter)
      .sort({ requestDate: -1 })
      .lean();
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single change control
router.get("/:id", permit(...viewRoles), async (req, res) => {
  try {
    const record = await ChangeControl.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).lean();
    if (!record) return res.status(404).json({ error: "Not found" });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create change control
router.post("/", permit(...createRoles), async (req, res) => {
  try {
    const record = await ChangeControl.create({
      ...req.body,
      tenantId: req.user.tenantId,
      requestedBy: req.user._id,
      status: "DRAFT",
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update change control
router.put("/:id", permit(...viewRoles), async (req, res) => {
  try {
    const record = await ChangeControl.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!record) return res.status(404).json({ error: "Not found" });
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST process approval/rejection for a step
router.post(
  "/:id/approval",
  permit("auditor", "admin", "tenant_admin", "reviewer", "workflow_manager"),
  async (req, res) => {
    try {
      const { decision, comments, stepOrder } = req.body;
      const record = await ChangeControl.findOne({
        _id: req.params.id,
        tenantId: req.user.tenantId,
      });
      if (!record) return res.status(404).json({ error: "Not found" });

      const step = record.approvalSteps.find((s) => s.stepOrder === stepOrder);
      if (!step)
        return res.status(400).json({ error: `Step ${stepOrder} not found` });

      step.decision = decision;
      step.decisionDate = new Date();
      step.userId = req.user._id;
      step.comments = comments;

      const allApproved = record.approvalSteps.every(
        (s) => s.decision === "APPROVED"
      );
      const anyRejected = record.approvalSteps.some(
        (s) => s.decision === "REJECTED"
      );

      if (anyRejected) record.status = "REJECTED";
      else if (allApproved) record.status = "APPROVED";

      await record.save();
      res.json(record);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
