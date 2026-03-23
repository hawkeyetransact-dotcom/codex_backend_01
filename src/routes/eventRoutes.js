// backend/src/routes/eventRoutes.js
// Universal nonconformance / deviation / complaint / incident management.

import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import WorkflowEvent from "../models/EventModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

const allowedViewers = ["supplier", "buyer", "auditor", "admin", "tenant_admin",
  "inspector", "verifier", "certifier", "reviewer", "party_admin", "workflow_manager"];
const editRoles = ["auditor", "admin", "tenant_admin", "inspector", "verifier",
  "certifier", "reviewer", "workflow_manager"];

// GET list events for tenant (filterable by status, eventType, severity, workflowInstanceId)
router.get("/", permit(...allowedViewers), async (req, res) => {
  try {
    const { status, eventType, severity, workflowInstanceId } = req.query;
    const filter = { tenantId: req.user.tenantId };
    if (status) filter.status = status;
    if (eventType) filter.eventType = eventType;
    if (severity) filter.severity = severity;
    if (workflowInstanceId) filter.workflowInstanceId = workflowInstanceId;

    const events = await WorkflowEvent.find(filter)
      .sort({ reportedAt: -1 })
      .limit(200)
      .lean();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single event
router.get("/:id", permit(...allowedViewers), async (req, res) => {
  try {
    const event = await WorkflowEvent.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).lean();
    if (!event) return res.status(404).json({ error: "Not found" });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create event (any authenticated party can report)
router.post("/", permit(...allowedViewers), async (req, res) => {
  try {
    const event = await WorkflowEvent.create({
      ...req.body,
      tenantId: req.user.tenantId,
      reportedBy: req.user._id,
    });
    res.status(201).json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update event fields (auditor/admin roles only)
router.put("/:id", permit(...editRoles), async (req, res) => {
  try {
    const event = await WorkflowEvent.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!event) return res.status(404).json({ error: "Not found" });
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST close event with notes
router.post("/:id/close", permit(...editRoles), async (req, res) => {
  try {
    const event = await WorkflowEvent.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      {
        status: "CLOSED",
        closureDate: new Date(),
        closedBy: req.user._id,
        closureNotes: req.body.closureNotes,
      },
      { new: true }
    );
    if (!event) return res.status(404).json({ error: "Not found" });
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
