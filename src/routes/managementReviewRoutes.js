import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { ManagementReview } from "../models/ManagementReviewModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/management-reviews
router.get("/", async (req, res) => {
  try {
    const { status, reviewType } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (reviewType) filter.reviewType = reviewType;

    const reviews = await ManagementReview.find(filter)
      .sort({ plannedDate: -1 })
      .lean();
    return res.json(reviews);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/management-reviews/:id
router.get("/:id", async (req, res) => {
  try {
    const review = await ManagementReview.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).lean();
    if (!review) return res.status(404).json({ error: "Not found" });
    return res.json(review);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/management-reviews
router.post("/", async (req, res) => {
  try {
    const review = new ManagementReview({
      ...req.body,
      tenantId: req.tenantId,
    });
    await review.save();
    return res.status(201).json(review);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/management-reviews/:id
router.put("/:id", async (req, res) => {
  try {
    const review = await ManagementReview.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!review) return res.status(404).json({ error: "Not found" });
    return res.json(review);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/management-reviews/:id/complete
router.post("/:id/complete", async (req, res) => {
  try {
    const { qmsAdequacy, resourceDecisions, improvementOpportunities, approvalNotes } = req.body;
    const review = await ManagementReview.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $set: {
          status: "COMPLETED",
          actualDate: new Date(),
          qmsAdequacy: qmsAdequacy || null,
          resourceDecisions: resourceDecisions || null,
          improvementOpportunities: improvementOpportunities || [],
          approvedBy: req.user._id,
          approvedAt: new Date(),
          approvalNotes: approvalNotes || null,
        },
      },
      { new: true, runValidators: true }
    );
    if (!review) return res.status(404).json({ error: "Not found" });
    return res.json(review);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/management-reviews/:id
router.delete("/:id", async (req, res) => {
  try {
    const review = await ManagementReview.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantId,
    });
    if (!review) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
