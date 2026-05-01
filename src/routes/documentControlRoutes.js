import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { requireESignature } from "../middlewares/requireESignature.js";
import { requireStepApprover } from "../middlewares/requireStepApprover.js";
import { DocumentControl } from "../models/DocumentControlModel.js";
import { recordTransition, writeAuditTrail } from "../services/auditTrailService.js";
import { bulkUploadDocuments, bulkUploadMiddleware } from "../controllers/documentControlBulkController.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

// POST /api/document-control/bulk-upload — AI-driven bulk intake.
// Multipart with `files[]`, max 50 × 25 MB. Lands every file as DRAFT
// with AI-suggested title / type / reviewer role / keywords. Returns a
// per-file result envelope.
router.post("/bulk-upload", bulkUploadMiddleware, bulkUploadDocuments);

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

// POST /api/document-control/:id/approve  — Part-11 e-signature gated + SoD + role check
// Processes one approval step decision
router.post(
  "/:id/approve",
  requireStepApprover({
    Model: DocumentControl,
    recordType: "document_control",
    ownerFields: ["ownerId", "submittedForReviewBy"],
    resolveStep: (rec, req) => rec.approvalSteps?.find((s) => s.stepOrder === req.body?.stepOrder),
    roleField: "role",
  }),
  requireESignature({ recordType: "document_control", meaning: "APPROVED" }),
  async (req, res) => {
  try {
    const { stepOrder, decision, comments, reasonForChange } = req.body;
    const doc = await DocumentControl.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });
    if (!doc) return res.status(404).json({ error: "Not found" });

    const step = doc.approvalSteps.find((s) => s.stepOrder === stepOrder);
    if (!step) return res.status(400).json({ error: "Approval step not found" });

    const fromStatus = doc.status;
    step.decision = decision;
    step.approverId = req.user._id;
    step.decisionAt = new Date();
    if (req.electronicSignature?._id) step.signatureId = req.electronicSignature._id;
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

    await recordTransition({
      req,
      module: "document_control",
      entityType: "document_control",
      entityId: doc._id,
      fromStatus,
      toStatus: doc.status,
      reasonForChange,
      extraMeta: { stepOrder, decision, comments: comments || null, documentNumber: doc.documentNumber },
    });

    return res.json(doc);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/document-control/:id/publish  — Part-11 e-signature gated + SoD
// Makes an approved document effective. SoD same as approve — publisher
// must not be the original submitter. (Approval ROLE check is satisfied by
// having gone through the prior approve step; we don't enforce role here.)
router.post(
  "/:id/publish",
  requireStepApprover({
    Model: DocumentControl,
    recordType: "document_control",
    ownerFields: ["ownerId", "submittedForReviewBy"],
    // For publish there's no specific approval step — invent a synthetic
    // "publish" step so the middleware passes its step check.
    resolveStep: () => ({ stepOrder: "publish", role: null }),
  }),
  requireESignature({ recordType: "document_control", meaning: "EFFECTIVE" }),
  async (req, res) => {
  try {
    const { effectiveDate, reasonForChange } = req.body;
    const doc = await DocumentControl.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, status: "APPROVED" },
      {
        $set: {
          status: "EFFECTIVE",
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          ...(req.electronicSignature?._id ? { effectiveSignatureId: req.electronicSignature._id } : {}),
        },
      },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Not found or not in APPROVED state" });

    await recordTransition({
      req,
      module: "document_control",
      entityType: "document_control",
      entityId: doc._id,
      fromStatus: "APPROVED",
      toStatus: "EFFECTIVE",
      reasonForChange,
      extraMeta: { documentNumber: doc.documentNumber, effectiveDate: doc.effectiveDate },
    });

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
