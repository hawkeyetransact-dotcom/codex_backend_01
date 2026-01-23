import express from "express";
import { authenticate, requireTenantActive } from "../../middlewares/authMiddleware.js";
import { permit } from "../../middlewares/roleMiddleware.js";
import { createAssessmentCapa, listAssessmentCapas } from "../../controllers/v2/assessmentCapaController.js";

const router = express.Router();

router.post("/capas", authenticate, requireTenantActive, permit("auditor", "admin", "tenant_admin", "superadmin"), createAssessmentCapa);
router.get("/capas", authenticate, requireTenantActive, listAssessmentCapas);

export default router;
