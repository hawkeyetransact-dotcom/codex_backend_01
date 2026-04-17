import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { DesignControl } from "../models/DesignControlModel.js";

const router = express.Router();
const VIEWER_ROLES = ["buyer", "supplier", "auditor", "tenant_admin", "admin", "superadmin"];
const EDITOR_ROLES = ["buyer", "tenant_admin", "admin", "superadmin"];

// List
router.get("/", authenticate, permit(...VIEWER_ROLES), async (req, res) => {
  try {
    const { status, deviceClass, currentPhase, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (req.user.tenant_id) filter.tenantId = req.user.tenant_id;
    if (status) filter.status = status;
    if (deviceClass) filter.deviceClass = deviceClass;
    if (currentPhase) filter.currentPhase = currentPhase;
    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      DesignControl.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      DesignControl.countDocuments(filter),
    ]);
    return res.json({ data: records, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Get single
router.get("/:id", authenticate, permit(...VIEWER_ROLES), async (req, res) => {
  try {
    const r = await DesignControl.findById(req.params.id).lean();
    if (!r) return res.status(404).json({ error: "Design control not found" });
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Create
router.post("/", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const r = await DesignControl.create({ ...req.body, tenantId: req.user.tenant_id, createdBy: req.user._id });
    return res.status(201).json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Update
router.put("/:id", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const r = await DesignControl.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!r) return res.status(404).json({ error: "Not found" });
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Advance phase
router.post("/:id/advance-phase", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const r = await DesignControl.findById(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    const phaseOrder = ["PLANNING", "INPUT", "OUTPUT", "REVIEW", "VERIFICATION", "VALIDATION", "TRANSFER", "CHANGES"];
    const currentIdx = phaseOrder.indexOf(r.currentPhase);
    if (currentIdx < 0 || currentIdx >= phaseOrder.length - 1) {
      return res.status(400).json({ error: `Cannot advance from ${r.currentPhase}` });
    }
    // Complete current phase
    const currentPhaseObj = r.phases.find((p) => p.phaseKey === r.currentPhase);
    if (currentPhaseObj) { currentPhaseObj.status = "COMPLETED"; currentPhaseObj.completedAt = new Date(); }
    // Start next phase
    const nextKey = phaseOrder[currentIdx + 1];
    const nextPhaseObj = r.phases.find((p) => p.phaseKey === nextKey);
    if (nextPhaseObj) { nextPhaseObj.status = "IN_PROGRESS"; nextPhaseObj.startedAt = new Date(); }
    r.currentPhase = nextKey;
    await r.save();
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Add design review
router.post("/:id/reviews", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const r = await DesignControl.findById(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    r.designReviews.push({ ...req.body, reviewDate: new Date() });
    await r.save();
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Design transfer (freeze + transfer to manufacturing)
router.post("/:id/transfer", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const r = await DesignControl.findById(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    r.status = "TRANSFERRED";
    r.transferDate = new Date();
    r.transferredBy = req.user._id;
    r.manufacturingSiteId = req.body.manufacturingSiteId || null;
    // Complete TRANSFER phase
    const tp = r.phases.find((p) => p.phaseKey === "TRANSFER");
    if (tp) { tp.status = "COMPLETED"; tp.completedAt = new Date(); }
    r.currentPhase = "CHANGES";
    await r.save();
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

export default router;
