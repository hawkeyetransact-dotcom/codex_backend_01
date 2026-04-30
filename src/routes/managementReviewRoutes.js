import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { requireESignature } from "../middlewares/requireESignature.js";
import { ManagementReview } from "../models/ManagementReviewModel.js";
import { recordTransition, writeAuditTrail } from "../services/auditTrailService.js";

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

// POST /api/management-reviews/:id/complete  — Part-11 e-signature gated
router.post(
  "/:id/complete",
  requireESignature({ recordType: "management_review", meaning: "COMPLETED" }),
  async (req, res) => {
  try {
    const { qmsAdequacy, resourceDecisions, improvementOpportunities, approvalNotes, reasonForChange } = req.body;
    const prior = await ManagementReview.findOne({
      _id: req.params.id, tenantId: req.tenantId,
    }).select("status").lean();
    if (!prior) return res.status(404).json({ error: "Not found" });

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
          ...(req.electronicSignature?._id ? { completionSignatureId: req.electronicSignature._id } : {}),
        },
      },
      { new: true, runValidators: true }
    );
    if (!review) return res.status(404).json({ error: "Not found" });

    await recordTransition({
      req,
      module: "mrm",
      entityType: "management_review",
      entityId: review._id,
      fromStatus: prior.status,
      toStatus: "COMPLETED",
      reasonForChange,
      extraMeta: { reviewNumber: review.reviewNumber, qmsAdequacy: review.qmsAdequacy },
    });
    return res.json(review);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/management-reviews/:id/action-items — add a single action item
router.post("/:id/action-items", async (req, res) => {
  try {
    const { description, owner, dueDate, priority, notes } = req.body;
    if (!description) return res.status(400).json({ error: "description is required" });
    const review = await ManagementReview.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!review) return res.status(404).json({ error: "Not found" });
    const item = {
      description,
      owner: owner || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || "MEDIUM",
      status: "OPEN",
      notes: notes || null,
    };
    review.actionItems.push(item);
    await review.save();
    const created = review.actionItems[review.actionItems.length - 1];
    await writeAuditTrail({
      tenantId: req.tenantId,
      module: "mrm",
      entityType: "management_review.action_item",
      entityId: created._id,
      action: "ACTION_ITEM_ADDED",
      actorId: req.user._id,
      actorRole: req.user.role,
      meta: { reviewId: String(review._id), reviewNumber: review.reviewNumber, description, priority: item.priority },
    });
    return res.status(201).json({ review, item: created });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/management-reviews/:id/action-items/:itemId — update an action item
router.patch("/:id/action-items/:itemId", async (req, res) => {
  try {
    const { status, owner, dueDate, priority, notes, reasonForChange } = req.body;
    const review = await ManagementReview.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!review) return res.status(404).json({ error: "Not found" });
    const item = review.actionItems.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Action item not found" });
    const fromStatus = item.status;
    if (status) item.status = status;
    if (owner !== undefined) item.owner = owner;
    if (dueDate !== undefined) item.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority) item.priority = priority;
    if (notes !== undefined) item.notes = notes;
    if (status === "COMPLETED" && !item.completedAt) item.completedAt = new Date();
    await review.save();
    if (status && status !== fromStatus) {
      await recordTransition({
        req,
        module: "mrm",
        entityType: "management_review.action_item",
        entityId: item._id,
        fromStatus,
        toStatus: status,
        reasonForChange,
        extraMeta: { reviewId: String(review._id), reviewNumber: review.reviewNumber, description: item.description },
      });
    }
    return res.json({ review, item });
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
