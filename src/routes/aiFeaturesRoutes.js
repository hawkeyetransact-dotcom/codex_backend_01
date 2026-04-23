/**
 * AI Features routes — Wave 1.
 * Mounted at /api/ai (see src/app.js).
 */
import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  postCapaDraftRca,
  postDeviationScaffoldFiveWhy,
  postAiDecisionOutcome,
} from "../controllers/aiFeaturesController.js";

const router = express.Router();

// Anyone with quality duties can draft. The human still e-signs the final record.
const CAPA_ROLES = ["admin", "tenant_admin", "superadmin", "user", "auditor", "supplier", "supplierUser"];
const DEVIATION_ROLES = ["admin", "tenant_admin", "superadmin", "user", "supplier", "supplierUser", "auditor"];

router.post(
  "/capa/draft-rca",
  authenticate,
  requireTenantActive,
  permit(...CAPA_ROLES),
  postCapaDraftRca
);

router.post(
  "/deviation/scaffold-five-why",
  authenticate,
  requireTenantActive,
  permit(...DEVIATION_ROLES),
  postDeviationScaffoldFiveWhy
);

router.post(
  "/decisions/outcome",
  authenticate,
  requireTenantActive,
  postAiDecisionOutcome
);

export default router;
