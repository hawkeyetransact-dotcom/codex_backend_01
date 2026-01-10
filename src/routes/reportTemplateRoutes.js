import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  listReportTemplates,
  getReportTemplate,
  createReportTemplate,
  updateReportTemplate,
} from "../controllers/reportTemplateController.js";

const router = express.Router();

router.get("/", authenticate, permit("auditor", "admin", "superadmin", "tenant_admin"), listReportTemplates);
router.get("/:id", authenticate, permit("auditor", "admin", "superadmin", "tenant_admin"), getReportTemplate);
router.post("/", authenticate, permit("admin", "superadmin", "tenant_admin"), createReportTemplate);
router.put("/:id", authenticate, permit("admin", "superadmin", "tenant_admin"), updateReportTemplate);

export default router;
