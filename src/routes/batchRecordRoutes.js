import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { BatchRecord } from "../models/BatchRecordModel.js";

const router = express.Router();
const VIEWER_ROLES = ["buyer", "supplier", "auditor", "tenant_admin", "admin", "superadmin"];
const EDITOR_ROLES = ["buyer", "supplier", "tenant_admin", "admin", "superadmin"];

// List batch records
router.get("/", authenticate, permit(...VIEWER_ROLES), async (req, res) => {
  try {
    const { status, productName, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (req.user.tenant_id) filter.tenantId = req.user.tenant_id;
    if (status) filter.status = status;
    if (productName) filter.productName = { $regex: productName, $options: "i" };
    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      BatchRecord.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      BatchRecord.countDocuments(filter),
    ]);
    return res.json({ data: records, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Get single
router.get("/:id", authenticate, permit(...VIEWER_ROLES), async (req, res) => {
  try {
    const r = await BatchRecord.findById(req.params.id).lean();
    if (!r) return res.status(404).json({ error: "Batch record not found" });
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Create
router.post("/", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const r = await BatchRecord.create({ ...req.body, tenantId: req.user.tenant_id, createdBy: req.user._id });
    return res.status(201).json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Update
router.put("/:id", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const r = await BatchRecord.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!r) return res.status(404).json({ error: "Not found" });
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Submit for QA review
router.post("/:id/submit-for-review", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const r = await BatchRecord.findById(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    r.status = r.labResultsComplete ? "PENDING_QA_REVIEW" : "PENDING_LAB_RESULTS";
    await r.save();
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// QA review
router.post("/:id/qa-review", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), async (req, res) => {
  try {
    const r = await BatchRecord.findById(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    r.qaReviewedBy = req.user._id;
    r.qaReviewedAt = new Date();
    r.qaReviewNotes = req.body.notes || "";
    r.labResultsComplete = req.body.labResultsComplete ?? r.labResultsComplete;
    r.labResultsSummary = req.body.labResultsSummary || r.labResultsSummary;
    r.deviationsResolved = req.body.deviationsResolved ?? r.deviationsResolved;
    r.status = !r.deviationsResolved ? "PENDING_DEVIATION_CLOSURE"
      : !r.labResultsComplete ? "PENDING_LAB_RESULTS"
      : "PENDING_DISPOSITION";
    await r.save();
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Disposition (release / reject)
router.post("/:id/dispose", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), async (req, res) => {
  try {
    const r = await BatchRecord.findById(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    const { decision, justification } = req.body;
    r.disposition = decision;
    r.dispositionBy = req.user._id;
    r.dispositionAt = new Date();
    r.dispositionJustification = justification;
    r.status = decision === "RELEASED" ? "RELEASED" : decision === "REJECTED" ? "REJECTED" : "QUARANTINED";
    if (decision === "RELEASED") r.releaseDate = new Date();
    await r.save();
    return res.json({ data: r });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

export default router;
