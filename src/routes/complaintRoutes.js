/**
 * complaintRoutes.js — Phase 1 EQMS
 * CRUD + lifecycle actions for customer/regulatory complaints.
 *
 * Tier-2 EQMS↔Supplier integration: when a complaint is regulatory + linked
 * to a supplier, auto-trigger a for-cause audit on that supplier.
 */
import express from "express";
import mongoose from "mongoose";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { Complaint } from "../models/ComplaintModel.js";
import Tenant from "../models/tenantModel.js";
import { triggerForCauseAudit } from "../services/crossModuleService.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

/**
 * Tier-2 hook — fires after every complaint create/update.
 * If the complaint is now flagged regulatory AND linked to a supplier AND
 * not already linked to a for-cause audit, kick one off via the existing
 * crossModule helper (which dedupes per supplier).
 *
 * Fire-and-forget; failure is logged but never breaks the complaint write.
 */
async function maybeTriggerForCauseAudit(complaint, actorUserId) {
  try {
    if (!complaint?.requiresRegulatoryReporting) return null;
    if (!complaint?.supplierId) return null;
    if (complaint.linkedAuditId) return null; // already wired

    // crossModuleService.triggerForCauseAudit expects a string-keyed tenantOrgId.
    // Resolve the tenant slug from the ObjectId if needed.
    let tenantOrgKey = null;
    if (mongoose.isValidObjectId(complaint.tenantId)) {
      const tenant = await Tenant.findById(complaint.tenantId).select("name").lean();
      tenantOrgKey = tenant?.name || String(complaint.tenantId);
    } else {
      tenantOrgKey = String(complaint.tenantId);
    }

    const result = await triggerForCauseAudit({
      tenantId: tenantOrgKey,
      supplierId: complaint.supplierId,
      reason: `COMPLAINT_REGULATORY · ${complaint.complaintNumber || complaint._id} · ${complaint.severity || "?"}`,
      triggeredBy: String(actorUserId || "system"),
      createdByUserId: actorUserId,
      sourceType: "COMPLAINT",
      sourceId: complaint._id,
    });
    if (result?.created) {
      // Back-link so we don't try again.
      await Complaint.updateOne({ _id: complaint._id }, { $set: { linkedAuditId: result.auditId } });
    }
    return result;
  } catch (err) {
    console.warn("[complaintRoutes] for-cause trigger failed (non-fatal):", err?.message);
    return null;
  }
}

// GET /api/complaints
router.get("/", async (req, res) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.complaintType) filter.complaintType = req.query.complaintType;
    if (req.query.productId) filter.productId = req.query.productId;
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).lean();
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/complaints/:id
router.get("/:id", async (req, res) => {
  try {
    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!complaint) return res.status(404).json({ error: "Not found" });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/complaints
router.post("/", async (req, res) => {
  try {
    const complaint = new Complaint({ ...req.body, tenantId: req.tenantId, reportedBy: req.user._id });
    await complaint.save();
    // Tier-2 cross-module hook (fire-and-forget) — don't await on the response path.
    maybeTriggerForCauseAudit(complaint, req.user._id);
    res.status(201).json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/complaints/:id
router.put("/:id", async (req, res) => {
  try {
    const complaint = await Complaint.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!complaint) return res.status(404).json({ error: "Not found" });
    // Re-evaluate after edit — supplier or regulatory flag may have changed.
    maybeTriggerForCauseAudit(complaint, req.user._id);
    res.json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/complaints/:id/investigate
router.post("/:id/investigate", async (req, res) => {
  try {
    const { investigationSummary, rootCause, assignedTo } = req.body;
    const complaint = await Complaint.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $set: {
          status: "UNDER_INVESTIGATION",
          investigationSummary,
          rootCause,
          assignedTo,
          investigationCompletedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ error: "Not found" });
    res.json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/complaints/:id/close
router.post("/:id/close", async (req, res) => {
  try {
    const { closureNotes, correctiveAction, preventiveAction } = req.body;
    const complaint = await Complaint.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $set: {
          status: "CLOSED",
          closureNotes,
          correctiveAction,
          preventiveAction,
          closedAt: new Date(),
          closedBy: req.user._id,
        },
      },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ error: "Not found" });
    res.json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/complaints/:id  (only OPEN complaints)
router.delete("/:id", async (req, res) => {
  try {
    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!complaint) return res.status(404).json({ error: "Not found" });
    if (complaint.status !== "OPEN") return res.status(409).json({ error: "Only OPEN complaints can be deleted" });
    await complaint.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
