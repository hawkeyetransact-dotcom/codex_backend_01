import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  adminDashboardSummary,
  auditorDashboardSummary,
  buyerDashboardSummary,
  supplierDashboardSummary,
  dashboardDrilldown,
} from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/buyer/dashboard/summary", authenticate, permit("buyer"), buyerDashboardSummary);
router.get("/auditor/dashboard/summary", authenticate, permit("auditor"), auditorDashboardSummary);
router.get("/supplier/dashboard/summary", authenticate, permit("supplier", "supplierUser"), supplierDashboardSummary);
router.get("/admin/dashboard/summary", authenticate, permit("tenant_admin", "superadmin", "admin"), adminDashboardSummary);
router.post("/dashboard/drilldown", authenticate, dashboardDrilldown);

export default router;
