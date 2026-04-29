import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { applyPersonaScope } from "../middlewares/personaScope.js";
import { TrainingRecord } from "../models/TrainingRecordModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/training-records
router.get("/", async (req, res) => {
  try {
    const { status, traineeId, trainingType, documentControlId } = req.query;
    // Trainees (suppliers and other personas) auto-scope to traineeId=me.
    const filter = applyPersonaScope(req, { tenantId: req.tenantId }, { supplierField: "traineeId" });
    if (status) filter.status = status;
    if (traineeId) filter.traineeId = traineeId;
    if (trainingType) filter.trainingType = trainingType;
    if (documentControlId) filter.documentControlId = documentControlId;

    const records = await TrainingRecord.find(filter)
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();
    return res.json(records);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/training-records/:id
router.get("/:id", async (req, res) => {
  try {
    const filter = applyPersonaScope(req, { _id: req.params.id, tenantId: req.tenantId }, { supplierField: "traineeId" });
    const record = await TrainingRecord.findOne(filter).lean();
    if (!record) return res.status(404).json({ error: "Not found" });
    return res.json(record);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/training-records
router.post("/", async (req, res) => {
  try {
    const record = new TrainingRecord({
      ...req.body,
      tenantId: req.tenantId,
      traineeId: req.body.traineeId || req.user._id,
      assignedBy: req.user._id,
    });
    await record.save();
    return res.status(201).json(record);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/training-records/:id
router.put("/:id", async (req, res) => {
  try {
    const record = await TrainingRecord.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!record) return res.status(404).json({ error: "Not found" });
    return res.json(record);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/training-records/:id/complete
router.post("/:id/complete", async (req, res) => {
  try {
    const { competencyLevel, assessment, trainingDurationMinutes, notes } = req.body;
    const updates = {
      status: "COMPLETED",
      completedAt: new Date(),
      competencyLevel: competencyLevel || null,
      trainingDurationMinutes: trainingDurationMinutes || null,
      notes: notes || null,
    };
    if (assessment) updates.assessment = assessment;

    const record = await TrainingRecord.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!record) return res.status(404).json({ error: "Not found" });
    return res.json(record);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/training-records/:id
router.delete("/:id", async (req, res) => {
  try {
    const record = await TrainingRecord.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantId,
    });
    if (!record) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
