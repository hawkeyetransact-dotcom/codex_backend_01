// backend/src/routes/workflowSubjectRoutes.js
// Universal workflow subject management (drug product, crop lot, property, item, process).

import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import WorkflowSubject from "../models/WorkflowSubjectModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

const viewRoles = ["supplier", "buyer", "auditor", "admin", "tenant_admin",
  "inspector", "verifier", "certifier", "reviewer", "party_admin", "workflow_manager"];
const adminRoles = ["admin", "tenant_admin", "workflow_manager", "buyer"];

// GET list subjects for tenant (optionally filter by partyId, subjectType)
router.get("/", permit(...viewRoles), async (req, res) => {
  try {
    const { partyId, subjectType, isActive } = req.query;
    const filter = { tenantId: req.user.tenantId };
    if (partyId) filter.partyId = partyId;
    if (subjectType) filter.subjectType = subjectType;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const subjects = await WorkflowSubject.find(filter)
      .sort({ name: 1 })
      .lean();
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single subject
router.get("/:id", permit(...viewRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).lean();
    if (!subject) return res.status(404).json({ error: "Not found" });
    res.json(subject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create subject
router.post("/", permit(...adminRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.create({
      ...req.body,
      tenantId: req.user.tenantId,
    });
    res.status(201).json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update subject
router.put("/:id", permit(...adminRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!subject) return res.status(404).json({ error: "Not found" });
    res.json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE soft-deactivate
router.delete("/:id", permit(...adminRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { isActive: false },
      { new: true }
    );
    if (!subject) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Subject deactivated", subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
