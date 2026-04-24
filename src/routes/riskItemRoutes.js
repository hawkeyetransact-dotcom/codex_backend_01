import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { RiskItem } from "../models/RiskItemModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/risk-items
router.get("/", async (req, res) => {
  try {
    const { status, riskBand, riskCategory, sourceType } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (riskBand) filter.riskBand = riskBand;
    if (riskCategory) filter.riskCategory = riskCategory;
    if (sourceType) filter.sourceType = sourceType;

    const items = await RiskItem.find(filter)
      .sort({ rpn: -1, createdAt: -1 })
      .lean();
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/risk-items/:id
router.get("/:id", async (req, res) => {
  try {
    const item = await RiskItem.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/risk-items
router.post("/", async (req, res) => {
  try {
    const item = new RiskItem({
      ...req.body,
      tenantId: req.tenantId,
      identifiedBy: req.user._id,
      riskOwner: req.user._id,
    });
    await item.save();
    return res.status(201).json(item);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/risk-items/:id
// Use load+set+save (not findOneAndUpdate) so the pre-save hook fires —
// the hook is what recomputes rpn / riskBand / residualRpn from the new
// S/O/D values. findOneAndUpdate skips Mongoose middleware.
router.put("/:id", async (req, res) => {
  try {
    const item = await RiskItem.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!item) return res.status(404).json({ error: "Not found" });
    Object.assign(item, req.body);
    await item.save();
    return res.json(item);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/risk-items/:id/mitigate
// Add a mitigation action
router.post("/:id/mitigate", async (req, res) => {
  try {
    const item = await RiskItem.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $push: { mitigations: req.body } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/risk-items/:id
router.delete("/:id", async (req, res) => {
  try {
    const item = await RiskItem.findOneAndDelete({
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
