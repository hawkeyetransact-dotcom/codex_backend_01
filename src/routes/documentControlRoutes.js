import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { DocumentControl } from "../models/DocumentControlModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// GET /api/document-control
// ?pendingMyApproval=true → only docs where I'm an approver AND step still PENDING
router.get("/", async (req, res) => {
  try {
    const { status, documentType, ownerId, pendingMyApproval } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (documentType) filter.documentType = documentType;
    if (ownerId) filter.ownerId = ownerId;
    if (pendingMyApproval === "true") {
      filter.approvalSteps = {
        $elemMatch: { approverId: req.user._id, decision: { $in: [null, "PENDING"] } },
      };
    }

    const docs = await DocumentControl.find(filter)
      .sort({ updatedAt: -1 })
      .lean();
    return res.json(docs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/document-control/:id
router.get("/:id", async (req, res) => {
  try {
    const doc = await DocumentControl.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/document-control
router.post("/", async (req, res) => {
  try {
    const doc = new DocumentControl({
      ...req.body,
      tenantId: req.tenantId,
      ownerId: req.body.ownerId || req.user._id,
    });
    await doc.save();
    return res.status(201).json(doc);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/document-control/:id
router.put("/:id", async (req, res) => {
  try {
    const doc = await DocumentControl.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json(doc);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/document-control/:id/submit-for-review
// Moves DRAFT → UNDER_REVIEW and sets up approval steps
router.post("/:id/submit-for-review", async (req, res) => {
  try {
    const doc = await DocumentControl.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (doc.status !== "DRAFT") return res.status(400).json({ error: "Only DRAFT documents can be submitted for review" });

    const { reviewers } = req.body;
    // reviewers: [{ role: "QA Manager", userId?: ObjectId }, { role: "Department Head" }]
    // If no reviewers specified, create a single default QA approval step
    const steps = (reviewers && reviewers.length > 0)
      ? reviewers.map((r, i) => ({
          stepOrder: i + 1,
          role: r.role || `Reviewer ${i + 1}`,
          approverId: r.userId || null,
          decision: "PENDING",
          decisionAt: null,
          comments: null,
        }))
      : [{ stepOrder: 1, role: "QA Manager", approverId: null, decision: "PENDING" }];

    doc.approvalSteps = steps;
    doc.status = "UNDER_REVIEW";
    doc.submittedForReviewAt = new Date();
    doc.submittedForReviewBy = req.user._id;
    await doc.save();
    return res.json(doc);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/document-control/:id/approve
// Processes one approval step decision
router.post("/:id/approve", async (req, res) => {
  try {
    const { stepOrder, decision, comments } = req.body;
    const doc = await DocumentControl.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });
    if (!doc) return res.status(404).json({ error: "Not found" });

    const step = doc.approvalSteps.find((s) => s.stepOrder === stepOrder);
    if (!step) return res.status(400).json({ error: "Approval step not found" });

    step.decision = decision;
    step.approverId = req.user._id;
    step.decisionAt = new Date();
    if (comments) step.comments = comments;

    // Advance status
    if (decision === "REJECTED") {
      doc.status = "DRAFT";
    } else {
      const allApproved = doc.approvalSteps.every(
        (s) => s.decision === "APPROVED" || s.decision === "DELEGATED"
      );
      if (allApproved) {
        doc.status = "APPROVED";
        doc.approvedAt = new Date();
        doc.approvedBy = req.user._id;
      }
    }

    await doc.save();
    return res.json(doc);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/document-control/:id/publish
// Makes an approved document effective
router.post("/:id/publish", async (req, res) => {
  try {
    const { effectiveDate } = req.body;
    const doc = await DocumentControl.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: "APPROVED" },
      {
        $set: {
          status: "EFFECTIVE",
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        },
      },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Not found or not in APPROVED state" });

    // Phase 1: auto-assign training if requiresTrainingOnUpdate
    let trainingAssigned = [];
    if (doc.requiresTrainingOnUpdate) {
      try {
        const { triggerTrainingOnDocumentRevision } = await import("../services/crossModuleService.js");
        trainingAssigned = await triggerTrainingOnDocumentRevision(doc, req.user?._id);
      } catch (e) {
        console.warn("Training auto-assign failed (non-blocking):", e.message);
      }
    }

    return res.json({ ...doc.toObject(), _trainingAssigned: trainingAssigned.length });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/document-control/:id/supersede
// Creates a new version superseding this document
router.post("/:id/supersede", async (req, res) => {
  try {
    const current = await DocumentControl.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      status: "EFFECTIVE",
    });
    if (!current) return res.status(404).json({ error: "Not found or not currently EFFECTIVE" });

    const newVersion = new DocumentControl({
      ...current.toObject(),
      _id: new (await import("mongoose")).default.Types.ObjectId(),
      status: "DRAFT",
      versionMajor: current.versionMajor + 1,
      versionMinor: 0,
      supersedesId: current._id,
      supersededById: null,
      approvedAt: null,
      approvedBy: null,
      effectiveDate: null,
      docNumber: undefined,
      docSequence: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      ...req.body,
      tenantId: req.tenantId,
      ownerId: req.body.ownerId || req.user._id,
    });

    await newVersion.save();

    // Mark current as superseded
    current.status = "SUPERSEDED";
    current.supersededById = newVersion._id;
    await current.save();

    return res.status(201).json(newVersion);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/document-control/:id/withdraw
router.post("/:id/withdraw", async (req, res) => {
  try {
    const { withdrawalReason } = req.body;
    const doc = await DocumentControl.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $set: {
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
          withdrawnBy: req.user._id,
          withdrawalReason: withdrawalReason || null,
        },
      },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json(doc);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/document-control/:id
router.delete("/:id", async (req, res) => {
  try {
    const doc = await DocumentControl.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantId,
      status: "DRAFT",
    });
    if (!doc) return res.status(404).json({ error: "Not found or not deletable (only DRAFT)" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
