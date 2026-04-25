import express from "express";
import mongoose from "mongoose";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  aggregateQualityKPIs,
  calculateSupplierScorecard,
  getEquipmentAlerts,
  triggerForCauseAudit,
  assessRegulatoryReportingRequired,
  createCapaFromDeviation,
} from "../services/crossModuleService.js";

const router = express.Router();

const ADMIN_ROLES = ["tenant_admin", "admin", "superadmin"];
const ALL_ROLES = ["buyer", "supplier", "auditor", "tenant_admin", "admin", "superadmin"];

// ── KPI aggregation for Management Review (Phase 1 item 4) ──────────────────
router.get("/kpis", authenticate, permit(...ALL_ROLES), async (req, res) => {
  try {
    const { periodStart, periodEnd } = req.query;
    const start = periodStart ? new Date(periodStart) : new Date(Date.now() - 90 * 86400000);
    const end = periodEnd ? new Date(periodEnd) : new Date();
    const kpis = await aggregateQualityKPIs(req.user.tenant_id, start, end);
    return res.json({ data: kpis });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Supplier scorecard (Phase 1 item 7) ─────────────────────────────────────
router.get("/supplier-scorecard/:supplierId", authenticate, permit("buyer", ...ADMIN_ROLES), async (req, res) => {
  try {
    const scorecard = await calculateSupplierScorecard(req.params.supplierId, req.user.tenant_id);
    return res.json({ data: scorecard });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Equipment alerts (Phase 1 item 10) ──────────────────────────────────────
router.get("/equipment-alerts", authenticate, permit(...ALL_ROLES), async (req, res) => {
  try {
    const alerts = await getEquipmentAlerts(req.user.tenant_id);
    return res.json({ data: alerts });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Trigger for-cause audit (Phase 1 item 3) ────────────────────────────────
router.post("/trigger-audit", authenticate, permit("buyer", ...ADMIN_ROLES), async (req, res) => {
  try {
    const { supplierId, reason, sourceType, sourceId } = req.body;
    if (!supplierId || !reason) {
      return res.status(400).json({ error: "supplierId and reason are required" });
    }
    const result = await triggerForCauseAudit({
      tenantId: req.user.tenant_id,
      supplierId,
      reason,
      triggeredBy: req.user._id,
      sourceType: sourceType || "MANUAL",
      sourceId: sourceId || null,
    });
    return res.status(result.created ? 201 : 200).json({ data: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Assess regulatory reporting for complaint (Phase 1 item 9) ──────────────
router.post("/regulatory-assessment", authenticate, permit(...ALL_ROLES), async (req, res) => {
  try {
    const assessment = assessRegulatoryReportingRequired(req.body);
    return res.json({ data: assessment });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Create a real CAPA from a deviation + AI-drafted RCA ────────────────────
// Used by the AI CAPA-RCA Drafter "Accept" button so the user actually sees
// a CAPA appear in /buyer/capas (not just a logged AI outcome).
router.post(
  "/capa-from-deviation",
  authenticate,
  permit(...ALL_ROLES),
  async (req, res) => {
    try {
      const { deviationId, draftRca, severity, title } = req.body || {};
      if (!deviationId) return res.status(400).json({ error: "deviationId required" });

      const Deviation = mongoose.model("Deviation");
      const dev = await Deviation.findOne({
        _id: deviationId,
        tenantId: req.user.tenant_id,
      });
      if (!dev) return res.status(404).json({ error: "Deviation not found in this tenant" });

      // If the AI draft has a richer rootCause, fold it into the deviation
      // before the cross-module helper builds the CAPA description.
      if (draftRca?.rootCause && !dev.investigation?.rootCause) {
        dev.investigation = {
          ...(dev.investigation || {}),
          rootCause: draftRca.rootCause,
          method: draftRca.rcaMethod || "FIVE_WHY",
          summary: draftRca.summary || "AI-drafted RCA accepted by user.",
        };
        await dev.save();
      }

      const capa = await createCapaFromDeviation(dev, req.user._id);
      if (!capa) {
        return res.status(500).json({ error: "CAPA model not available" });
      }

      // Persist the AI-drafted action plan onto the new CAPA so it shows up
      // in the workspace, not just in the audit-trail.
      let actionPlanWritten = false;
      if (draftRca?.correctiveActions || draftRca?.preventiveActions) {
        try {
          const CapaActionPlan = mongoose.model("capa-v2-action-plans");
          await CapaActionPlan.create({
            tenantId: dev.tenantId,
            capaId: capa._id,
            correctiveActionsSummary: (draftRca.correctiveActions || [])
              .map((a, i) => `CA${i + 1}: ${a.action || a}`)
              .join("\n"),
            preventiveActionsSummary: (draftRca.preventiveActions || [])
              .map((a, i) => `PA${i + 1}: ${a.action || a}`)
              .join("\n"),
            createdBy: req.user._id,
          });
          actionPlanWritten = true;
        } catch (e) {
          // model may not be registered in this serverless instance — non-fatal
        }
      }

      // Link the new CAPA back to the deviation.
      if (!Array.isArray(dev.linkedCAPAIds)) dev.linkedCAPAIds = [];
      if (!dev.linkedCAPAIds.find((x) => String(x) === String(capa._id))) {
        dev.linkedCAPAIds.push(capa._id);
        dev.capaRequired = true;
        await dev.save();
      }

      return res.status(201).json({
        ok: true,
        capa: {
          _id: capa._id,
          capaNumber: capa.capaNumber,
          title: capa.title,
          status: capa.status,
          severity: capa.severity,
        },
        deviation: { _id: dev._id, deviationNumber: dev.deviationNumber, linkedCAPAIds: dev.linkedCAPAIds },
        actionPlanWritten,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

export default router;
