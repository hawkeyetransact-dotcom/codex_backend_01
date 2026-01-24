import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { createMonitoringSignal, listMonitoringSignals } from "../controllers/monitoringController.js";

const router = express.Router();

router.get(
  "/monitoring/signals",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  listMonitoringSignals
);
router.post(
  "/monitoring/signals",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  createMonitoringSignal
);

export default router;
