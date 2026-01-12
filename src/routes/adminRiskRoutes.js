import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import {
  getPublicSignals,
  updatePublicSignals,
  getRiskMetrics,
  updateRiskMetrics,
  recalcSupplier,
  recalcBulk,
  getRiskEvents,
  bulkNetworkLinks,
  getNetworkLinks,
  createEvidenceFinding,
  getEvidenceFindings,
} from "../controllers/riskAdminController.js";
import {
  publicSignalsValidator,
  riskMetricsValidator,
  networkLinksValidator,
  evidenceFindingValidator,
} from "../validators/riskValidators.js";

const router = express.Router();

router.get(
  "/suppliers/:supplierId/public-signals",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  getPublicSignals
);
router.put(
  "/suppliers/:supplierId/public-signals",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  validate(publicSignalsValidator),
  updatePublicSignals
);

router.get(
  "/suppliers/:supplierId/risk-metrics",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  getRiskMetrics
);
router.put(
  "/suppliers/:supplierId/risk-metrics",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  validate(riskMetricsValidator),
  updateRiskMetrics
);

router.post(
  "/risk/recalculate/:supplierId",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  recalcSupplier
);
router.post(
  "/risk/recalculate",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  recalcBulk
);

router.get(
  "/risk/events/:supplierId",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  getRiskEvents
);

router.post(
  "/network-links/bulk",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  validate(networkLinksValidator),
  bulkNetworkLinks
);
router.get(
  "/network-links/:supplierId",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  getNetworkLinks
);

router.post(
  "/evidence-findings",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  validate(evidenceFindingValidator),
  createEvidenceFinding
);
router.get(
  "/evidence-findings/:supplierId",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  getEvidenceFindings
);

export default router;
