import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  createReportInstance,
  getReportInstance,
  updateReportInstance,
  exportReportInstancePdf,
} from "../controllers/reportInstanceController.js";

const router = express.Router();

router.post(
  "/audits/:auditRequestId/report-instances",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  createReportInstance
);

router.get(
  "/report-instances/:id",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "superadmin", "tenant_admin"),
  getReportInstance
);

router.put(
  "/report-instances/:id",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  updateReportInstance
);

router.post(
  "/report-instances/:id/export-pdf",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "superadmin", "tenant_admin"),
  exportReportInstancePdf
);

export default router;
