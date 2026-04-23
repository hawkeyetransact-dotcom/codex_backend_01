/**
 * AI Wave 3 routes — mounted at /api/ai.
 */
import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  postPredictCapaOutcome,
  postDetectSignals,
  getSignals,
  postCloseSignal,
  postIngestTelemetry,
  getMtbf,
  postRegisterOnPremEndpoint,
  getOnPremEndpoint,
  postHealthCheckOnPrem,
  postReviewAuditorDraft,
  getAuditorGrowthPlan,
  getDriftDashboardRoute,
  postRunDriftCheck,
} from "../controllers/aiWave3Controller.js";

const router = express.Router();
const ALL = ["admin", "tenant_admin", "superadmin", "user", "auditor", "buyer", "supplier", "supplierUser"];
const ADMINS = ["admin", "tenant_admin", "superadmin"];

// Predictive
router.post("/predict/capa-outcome", authenticate, requireTenantActive, permit(...ALL), postPredictCapaOutcome);

// Signals
router.get("/signals", authenticate, requireTenantActive, permit(...ALL), getSignals);
router.post("/signals/detect", authenticate, requireTenantActive, permit(...ADMINS), postDetectSignals);
router.post("/signals/:alertId/close", authenticate, requireTenantActive, permit(...ADMINS), postCloseSignal);

// IoT
router.post("/iot/telemetry", authenticate, requireTenantActive, permit(...ALL), postIngestTelemetry);
router.get("/iot/equipment/:equipmentId/mtbf", authenticate, requireTenantActive, permit(...ALL), getMtbf);

// On-prem LLM
router.post("/onprem/endpoint", authenticate, requireTenantActive, permit(...ADMINS), postRegisterOnPremEndpoint);
router.get("/onprem/endpoint", authenticate, requireTenantActive, permit(...ADMINS), getOnPremEndpoint);
router.post("/onprem/health-check", authenticate, requireTenantActive, permit(...ADMINS), postHealthCheckOnPrem);

// Auditor coach
router.post("/coach/review-draft", authenticate, requireTenantActive, permit("auditor", ...ADMINS), postReviewAuditorDraft);
router.get("/coach/auditors/:auditorId/growth-plan", authenticate, requireTenantActive, permit("auditor", ...ADMINS), getAuditorGrowthPlan);

// Drift
router.get("/drift/dashboard", authenticate, requireTenantActive, permit(...ADMINS), getDriftDashboardRoute);
router.post("/drift/run-check", authenticate, requireTenantActive, permit(...ADMINS), postRunDriftCheck);

export default router;
