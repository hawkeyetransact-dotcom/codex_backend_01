/**
 * equipmentRoutes.js — Equipment master + calibration history CRUD
 */
import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { Equipment } from "../models/EquipmentModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/equipment
router.get("/", async (req, res) => {
  try {
    const { status, calibrationStatus, equipmentType } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (calibrationStatus) filter.calibrationStatus = calibrationStatus;
    if (equipmentType) filter.equipmentType = equipmentType;
    const items = await Equipment.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/equipment/:id
router.get("/:id", async (req, res) => {
  try {
    const item = await Equipment.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/equipment
router.post("/", async (req, res) => {
  try {
    const eq = new Equipment({ ...req.body, tenantId: req.tenantId, createdBy: req.user._id });
    await eq.save();
    return res.status(201).json(eq);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/equipment/:id
router.put("/:id", async (req, res) => {
  try {
    const updated = await Equipment.findOneAndUpdate(
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

// POST /api/equipment/:id/calibration — record a calibration event
router.post("/:id/calibration", async (req, res) => {
  try {
    const eq = await Equipment.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!eq) return res.status(404).json({ error: "Not found" });

    const { performedAt, performedBy, result, certificateRef, nextDueDays, notes } = req.body;
    const nextDueDate = nextDueDays
      ? new Date(new Date(performedAt).getTime() + nextDueDays * 86400000)
      : eq.calibrationFrequencyDays
      ? new Date(new Date(performedAt).getTime() + eq.calibrationFrequencyDays * 86400000)
      : null;

    eq.calibrationHistory.push({ performedAt, performedBy, result, certificateRef, nextDueDate, notes });
    eq.lastCalibrationDate = new Date(performedAt);
    eq.nextCalibrationDue = nextDueDate;
    eq.calibrationStatus = result === "PASS" ? "CURRENT" : result === "CONDITIONAL" ? "DUE_SOON" : "OVERDUE";
    if (result === "FAIL") eq.status = "QUARANTINED";

    await eq.save();
    return res.json(eq);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/equipment/:id (soft retire)
router.delete("/:id", async (req, res) => {
  try {
    const updated = await Equipment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: { status: "RETIRED", decommissionedAt: new Date() } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
