import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  aggregateQualityKPIs,
  calculateSupplierScorecard,
  getEquipmentAlerts,
  triggerForCauseAudit,
  assessRegulatoryReportingRequired,
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

export default router;
